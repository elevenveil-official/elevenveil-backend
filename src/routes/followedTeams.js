const express = require('express');
const supabase = require('../services/supabaseClient');
const router = express.Router();

router.get('/:userId', async (req, res) => {
  const { data, error } = await supabase
    .from('followed_teams')
    .select('team_id')
    .eq('user_id', req.params.userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ teamIds: data.map(d => d.team_id) });
});

router.post('/', async (req, res) => {
  const { userId, teamIds } = req.body;
  if (!userId || !Array.isArray(teamIds)) {
    return res.status(400).json({ error: 'Missing userId or teamIds array' });
  }

  await supabase.from('followed_teams').delete().eq('user_id', userId);

  if (teamIds.length > 0) {
    const rows = teamIds.map(teamId => ({ user_id: userId, team_id: teamId }));
    const { error } = await supabase.from('followed_teams').insert(rows);
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json({ saved: teamIds.length });
});

module.exports = router;