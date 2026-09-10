const express = require('express');
const supabase = require('../services/supabaseClient');
const { apiSportsFetch } = require('../services/apiSportsClient');
const { scorePrediction } = require('../services/predictionScoringEngine');
const { getRankForXp, getRankProgress } = require('../services/rankEngine');
const router = express.Router();

// a) La ruta POST / acepta ahora el goleador (opcional)
router.post('/', async (req, res) => {
  const { userId, fixtureId, predictedHomeScore, predictedAwayScore, matchStartTime, predictedScorerId, predictedScorerName } = req.body;

  if (!userId || !fixtureId || predictedHomeScore == null || predictedAwayScore == null || !matchStartTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const now = new Date();
  const kickoff = new Date(matchStartTime);
  if (now >= kickoff) {
    return res.status(403).json({ error: 'Predictions are locked — match has started.' });
  }

  const { data, error } = await supabase
    .from('match_predictions')
    .upsert({
      user_id: userId,
      fixture_id: fixtureId,
      predicted_home_score: predictedHomeScore,
      predicted_away_score: predictedAwayScore,
      predicted_scorer_id: predictedScorerId || null,
      predicted_scorer_name: predictedScorerName || null,
      match_start_time: matchStartTime,
      submitted_at: now.toISOString(),
    }, { onConflict: 'user_id,fixture_id' })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ prediction: data[0] });
});

// b) Función nueva para obtener goleadores excluyendo penaltis fallados y goles en propia puerta
async function getActualScorers(fixtureId) {
  const eventsData = await apiSportsFetch(`/fixtures/events?fixture=${fixtureId}`);
  const events = eventsData?.response || [];
  return events
    .filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.detail !== 'Own Goal')
    .map(e => e.player.id);
}

// c) Versión actualizada de resolveFixturePredictions
async function resolveFixturePredictions(fixtureId) {
  const fixtureData = await apiSportsFetch(`/fixtures?id=${fixtureId}`);
  const fixture = fixtureData?.response?.[0];

  if (!fixture || fixture?.fixture?.status?.short !== 'FT') {
    return { resolved: 0, skipped: true, reason: 'Match not finished yet.' };
  }

  const actualResult = { homeScore: fixture.goals.home, awayScore: fixture.goals.away };
  actualResult.scorers = await getActualScorers(fixtureId);

  const { data: predictions, error: fetchError } = await supabase
    .from('match_predictions')
    .select('*')
    .eq('fixture_id', fixtureId)
    .is('vision_score', null);

  if (fetchError) throw new Error(fetchError.message);
  if (!predictions || predictions.length === 0) {
    return { resolved: 0, message: 'No pending predictions for this fixture.' };
  }

  const results = [];
  for (const pred of predictions) {
    const scored = scorePrediction(
      {
        predictedHomeScore: pred.predicted_home_score,
        predictedAwayScore: pred.predicted_away_score,
        predictedScorerId: pred.predicted_scorer_id,
      },
      actualResult
    );

    await supabase
      .from('match_predictions')
      .update({ vision_score: scored.visionScore, xp_earned: scored.xpEarned, scored_at: new Date().toISOString() })
      .eq('id', pred.id);

    const { data: profile } = await supabase.from('profiles').select('xp').eq('id', pred.user_id).single();
    const newXp = (profile?.xp || 0) + scored.xpEarned;
    const newRank = getRankForXp(newXp);
    await supabase.from('profiles').update({ xp: newXp, rank: newRank }).eq('id', pred.user_id);

    results.push({ userId: pred.user_id, ...scored });
  }

  return { resolved: results.length, results };
}

router.get('/resolve/:fixtureId', async (req, res) => {
  try {
    const result = await resolveFixturePredictions(req.params.fixtureId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/auto-resolve', async (req, res) => {
  const { data: pending, error } = await supabase
    .from('match_predictions')
    .select('fixture_id')
    .is('vision_score', null);

  if (error) return res.status(500).json({ error: error.message });

  const fixtureIds = [...new Set((pending || []).map(p => p.fixture_id))];
  const summary = [];

  for (const fixtureId of fixtureIds) {
    try {
      const result = await resolveFixturePredictions(fixtureId);
      summary.push({ fixtureId, ...result });
    } catch (err) {
      summary.push({ fixtureId, error: err.message });
    }
  }

  res.json({ checkedFixtures: fixtureIds.length, summary });
});

router.get('/rank/:userId', async (req, res) => {
  const { data: profile, error } = await supabase.from('profiles').select('xp, rank').eq('id', req.params.userId).single();
  if (error) return res.status(404).json({ error: 'User not found' });
  res.json(getRankProgress(profile.xp));
});

router.get('/streak/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data, error } = await supabase
    .from('match_predictions')
    .select('vision_score, scored_at')
    .eq('user_id', userId)
    .not('scored_at', 'is', null)
    .order('scored_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  let currentStreak = 0;
  for (const pred of data) {
    if (pred.vision_score > 0) currentStreak++;
    else break;
  }

  let bestStreak = 0, running = 0;
  for (const pred of [...data].reverse()) {
    if (pred.vision_score > 0) {
      running++;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
  }

  res.json({ currentStreak, bestStreak });
});

// d) Ruta nueva para devolver las plantillas (squads) completas
router.get('/squads/:fixtureId', async (req, res) => {
  try {
    const fixtureData = await apiSportsFetch(`/fixtures?id=${req.params.fixtureId}`);
    const fixture = fixtureData?.response?.[0];
    if (!fixture) return res.status(404).json({ error: 'Fixture not found' });

    const [homeSquad, awaySquad] = await Promise.all([
      apiSportsFetch(`/players/squads?team=${fixture.teams.home.id}`),
      apiSportsFetch(`/players/squads?team=${fixture.teams.away.id}`),
    ]);

    const formatSquad = (squadData, teamMeta) => ({
      teamId: teamMeta.id,
      teamName: teamMeta.name,
      players: (squadData?.response?.[0]?.players || []).map(p => ({
        id: p.id,
        name: p.name,
        photo: p.photo,
        position: p.position,
      })),
    });

    res.json({
      home: formatSquad(homeSquad, fixture.teams.home),
      away: formatSquad(awaySquad, fixture.teams.away),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;