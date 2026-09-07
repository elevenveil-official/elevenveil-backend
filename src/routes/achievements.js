const express = require('express');
const supabase = require('../services/supabaseClient');
const { evaluateAchievements } = require('../services/achievementsEngine');
const router = express.Router();

router.get('/:userId', async (req, res) => {
  const userId = req.params.userId;

  const { data: predictions } = await supabase
    .from('match_predictions')
    .select('vision_score')
    .eq('user_id', userId);

  const { data: followedTeams } = await supabase
    .from('followed_teams')
    .select('team_id')
    .eq('user_id', userId);

  const { data: profile } = await supabase
    .from('profiles')
    .select('xp')
    .eq('id', userId)
    .single();

  const ctx = {
    totalPredictions: predictions?.length || 0,
    scoredPredictions: (predictions || []).filter(p => p.vision_score !== null),
    followedTeamsCount: followedTeams?.length || 0,
    xp: profile?.xp || 0,
  };

  res.json({ achievements: evaluateAchievements(ctx) });
});

module.exports = router;