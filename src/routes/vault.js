const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');

router.put('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { frameId } = req.body;

  const { error } = await supabase
    .from('profiles')
    .update({ active_frame: frameId })
    .eq('id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, frameId });
});

module.exports = router;