const express = require('express');
const supabase = require('../services/supabaseClient');
const { apiSportsFetch } = require('../services/apiSportsClient');
const { getRankForXp } = require('../services/rankEngine');
const router = express.Router();

const XP_REWARD = 250; // acertar una Live Vision vale menos que una Match Vision completa, es una predicción rápida

router.post('/', async (req, res) => {
  const { userId, fixtureId } = req.body;
  if (!userId || !fixtureId || req.body.predictedMoreGoals == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const fixtureData = await apiSportsFetch(`/fixtures?id=${fixtureId}`);
  const fixture = fixtureData?.response?.[0];
  const status = fixture?.fixture?.status?.short;

  if (!fixture || !['1H', '2H', 'HT', 'ET'].includes(status)) {
    return res.status(403).json({ error: 'This match is not live right now.' });
  }

  const { data, error } = await supabase
    .from('live_predictions')
    .insert({
      user_id: userId,
      fixture_id: fixtureId,
      home_score_at_submission: fixture.goals.home,
      away_score_at_submission: fixture.goals.away,
      predicted_more_goals: req.body.predictedMoreGoals,
    })
    .select();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Already locked in a Live Vision for this match.' });
    return res.status(500).json({ error: error.message });
  }
  res.json({ prediction: data[0] });
});

router.get('/auto-resolve', async (req, res) => {
  const { data: pending, error } = await supabase
    .from('live_predictions')
    .select('*')
    .is('resolved_at', null);

  if (error) return res.status(500).json({ error: error.message });

  const fixtureIds = [...new Set((pending || []).map(p => p.fixture_id))];
  let resolvedCount = 0;

  for (const fixtureId of fixtureIds) {
    const fixtureData = await apiSportsFetch(`/fixtures?id=${fixtureId}`);
    const fixture = fixtureData?.response?.[0];
    if (!fixture || fixture?.fixture?.status?.short !== 'FT') continue;

    const totalAtEnd = fixture.goals.home + fixture.goals.away;
    const predsForFixture = pending.filter(p => p.fixture_id === fixtureId);

    for (const pred of predsForFixture) {
      const totalAtSubmission = pred.home_score_at_submission + pred.away_score_at_submission;
      const moreGoalsHappened = totalAtEnd > totalAtSubmission;
      const correct = pred.predicted_more_goals === moreGoalsHappened;
      const xpEarned = correct ? XP_REWARD : 0;

      await supabase
        .from('live_predictions')
        .update({ resolved_at: new Date().toISOString(), correct, xp_earned: xpEarned })
        .eq('id', pred.id);

      if (xpEarned > 0) {
        const { data: profile } = await supabase.from('profiles').select('xp').eq('id', pred.user_id).single();
        const newXp = (profile?.xp || 0) + xpEarned;
        await supabase.from('profiles').update({ xp: newXp, rank: getRankForXp(newXp) }).eq('id', pred.user_id);
      }
      resolvedCount++;
    }
  }

  res.json({ checkedFixtures: fixtureIds.length, resolved: resolvedCount });
});

router.get('/status/:fixtureId/:userId', async (req, res) => {
  const { fixtureId, userId } = req.params;
  const { data } = await supabase
    .from('live_predictions')
    .select('*')
    .eq('fixture_id', fixtureId)
    .eq('user_id', userId)
    .maybeSingle();
  res.json({ prediction: data || null });
});

module.exports = router;