const express = require('express');
const supabase = require('../services/supabaseClient');
const router = express.Router();

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, xp, rank')
    .order('xp', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ leaderboard: data });
});

module.exports = router;