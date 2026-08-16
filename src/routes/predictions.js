const express = require('express');
const supabase = require('../services/supabaseClient');
const { apiSportsFetch } = require('../services/apiSportsClient');
const { scorePrediction } = require('../services/predictionScoringEngine');
const router = express.Router();

// Ruta para guardar una nueva predicción
router.post('/', async (req, res) => {
  const { userId, fixtureId, predictedHomeScore, predictedAwayScore, matchStartTime } = req.body;

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
      match_start_time: matchStartTime,
      submitted_at: now.toISOString(),
    }, { onConflict: 'user_id,fixture_id' })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ prediction: data[0] });
});

// Ruta para resolver las predicciones de un partido finalizado
router.get('/resolve/:fixtureId', async (req, res) => {
  const fixtureId = req.params.fixtureId;

  const fixtureData = await apiSportsFetch(`/fixtures?id=${fixtureId}`);
  const fixture = fixtureData?.response?.[0];

  if (!fixture || fixture?.fixture?.status?.short !== 'FT') {
    return res.status(400).json({ error: 'Match not finished yet, cannot resolve predictions.' });
  }

  const actualResult = {
    homeScore: fixture.goals.home,
    awayScore: fixture.goals.away,
  };

  const { data: predictions, error: fetchError } = await supabase
    .from('match_predictions')
    .select('*')
    .eq('fixture_id', fixtureId)
    .is('vision_score', null);

  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!predictions || predictions.length === 0) {
    return res.json({ resolved: 0, message: 'No pending predictions for this fixture.' });
  }

  const results = [];
  for (const pred of predictions) {
    const scored = scorePrediction(
      { predictedHomeScore: pred.predicted_home_score, predictedAwayScore: pred.predicted_away_score },
      actualResult
    );

    await supabase
      .from('match_predictions')
      .update({ vision_score: scored.visionScore, xp_earned: scored.xpEarned, scored_at: new Date().toISOString() })
      .eq('id', pred.id);

    const { data: profile } = await supabase.from('profiles').select('xp').eq('id', pred.user_id).single();
    const newXp = (profile?.xp || 0) + scored.xpEarned;
    await supabase.from('profiles').update({ xp: newXp }).eq('id', pred.user_id);

    results.push({ userId: pred.user_id, ...scored });
  }

  res.json({ resolved: results.length, results });
});

module.exports = router;