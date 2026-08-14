const express = require('express');
const supabase = require('../services/supabaseClient');
const router = express.Router();

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

module.exports = router;