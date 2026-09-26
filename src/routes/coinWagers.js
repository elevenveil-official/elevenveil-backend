const express = require('express');
const supabase = require('../services/supabaseClient');
const { apiSportsFetch } = require('../services/apiSportsClient');
const router = express.Router();

const MIN_STAKE = 10;
const MIN_PCT_FLOOR = 8; // techo del multiplicador en ~12.5x

function calcOdds(pct) {
  const floored = Math.max(pct, MIN_PCT_FLOOR);
  return Math.round((100 / floored) * 100) / 100;
}

async function getConsensusPct(fixtureId) {
  const { data, error } = await supabase
    .from('match_predictions')
    .select('predicted_home_score, predicted_away_score')
    .eq('fixture_id', fixtureId);

  if (error) throw new Error(error.message);

  const total = data.length;
  if (total === 0) return { home: 33.33, draw: 33.33, away: 33.33 };

  let home = 0, draw = 0, away = 0;
  data.forEach(p => {
    if (p.predicted_home_score > p.predicted_away_score) home++;
    else if (p.predicted_home_score < p.predicted_away_score) away++;
    else draw++;
  });

  return { home: (home / total) * 100, draw: (draw / total) * 100, away: (away / total) * 100 };
}

router.get('/odds/:fixtureId', async (req, res) => {
  try {
    const pct = await getConsensusPct(req.params.fixtureId);
    res.json({ home: calcOdds(pct.home), draw: calcOdds(pct.draw), away: calcOdds(pct.away) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { userId, fixtureId, predictedOutcome, stake, matchStartTime } = req.body;

  if (!userId || !fixtureId || !predictedOutcome || !stake || !matchStartTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['home', 'draw', 'away'].includes(predictedOutcome)) {
    return res.status(400).json({ error: 'Invalid predicted outcome' });
  }
  if (stake < MIN_STAKE) {
    return res.status(400).json({ error: `Minimum stake is ${MIN_STAKE} coins.` });
  }

  const now = new Date();
  const kickoff = new Date(matchStartTime);
  if (now >= kickoff) {
    return res.status(403).json({ error: 'Wagers are locked — match has started.' });
  }

  const { data: existing } = await supabase
    .from('coin_wagers')
    .select('id')
    .eq('user_id', userId)
    .eq('fixture_id', fixtureId)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'You already have a wager on this match.' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('coins')
    .eq('id', userId)
    .single();

  if (profileError) return res.status(404).json({ error: 'User not found' });
  if ((profile.coins ?? 0) < stake) {
    return res.status(403).json({ error: 'Not enough coins for that stake.' });
  }

  const pct = await getConsensusPct(fixtureId);
  const odds = calcOdds(pct[predictedOutcome]);

  const { data, error } = await supabase
    .from('coin_wagers')
    .insert({ user_id: userId, fixture_id: fixtureId, predicted_outcome: predictedOutcome, stake, odds, match_start_time: matchStartTime })
    .select();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('profiles').update({ coins: profile.coins - stake }).eq('id', userId);

  res.json({ wager: data[0] });
});

async function resolveFixtureWagers(fixtureId) {
  const fixtureData = await apiSportsFetch(`/fixtures?id=${fixtureId}`);
  const fixture = fixtureData?.response?.[0];

  if (!fixture || fixture?.fixture?.status?.short !== 'FT') {
    return { resolved: 0, skipped: true, reason: 'Match not finished yet.' };
  }

  const actualWinner = fixture.goals.home > fixture.goals.away ? 'home'
    : fixture.goals.home < fixture.goals.away ? 'away' : 'draw';

  const { data: wagers, error } = await supabase
    .from('coin_wagers')
    .select('*')
    .eq('fixture_id', fixtureId)
    .is('resolved_at', null);

  if (error) throw new Error(error.message);
  if (!wagers || wagers.length === 0) {
    return { resolved: 0, message: 'No pending wagers for this fixture.' };
  }

  const results = [];
  for (const wager of wagers) {
    const won = wager.predicted_outcome === actualWinner;
    const payout = won ? Math.round(wager.stake * wager.odds) : 0;

    await supabase
      .from('coin_wagers')
      .update({ payout, resolved_at: new Date().toISOString() })
      .eq('id', wager.id);

    if (won) {
      const { data: profile } = await supabase.from('profiles').select('coins').eq('id', wager.user_id).single();
      await supabase.from('profiles').update({ coins: (profile?.coins || 0) + payout }).eq('id', wager.user_id);
    }

    results.push({ userId: wager.user_id, won, payout });
  }

  return { resolved: results.length, results };
}

router.get('/auto-resolve', async (req, res) => {
  const { data: pending, error } = await supabase
    .from('coin_wagers')
    .select('fixture_id')
    .is('resolved_at', null);

  if (error) return res.status(500).json({ error: error.message });

  const fixtureIds = [...new Set((pending || []).map(w => w.fixture_id))];
  const summary = [];

  for (const fixtureId of fixtureIds) {
    try {
      const result = await resolveFixtureWagers(fixtureId);
      summary.push({ fixtureId, ...result });
    } catch (err) {
      summary.push({ fixtureId, error: err.message });
    }
  }

  res.json({ checkedFixtures: fixtureIds.length, summary });
});

router.get('/leaderboard', async (req, res) => {
  const STARTING_BALANCE = 1000;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, coins, rank')
    .not('coins', 'is', null)
    .order('coins', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ leaderboard: data.map(p => ({ id: p.id, coins: p.coins, net: p.coins - STARTING_BALANCE, rank: p.rank })) });
});

router.get('/balance/:userId', async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('coins').eq('id', req.params.userId).single();
  if (error) return res.status(404).json({ error: 'User not found' });
  res.json({ coins: data.coins ?? 0, net: (data.coins ?? 0) - 1000 });
});

router.get('/status/:fixtureId/:userId', async (req, res) => {
  const { fixtureId, userId } = req.params;
  const { data, error } = await supabase
    .from('coin_wagers')
    .select('*')
    .eq('fixture_id', fixtureId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ wager: data || null });
});

module.exports = router;