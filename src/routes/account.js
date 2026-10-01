const express = require('express');
const supabase = require('../services/supabaseClient');
const router = express.Router();

router.delete('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    await supabase.from('match_predictions').delete().eq('user_id', userId);
    await supabase.from('live_predictions').delete().eq('user_id', userId);
    await supabase.from('coin_wagers').delete().eq('user_id', userId);
    await supabase.from('followed_teams').delete().eq('user_id', userId);
    await supabase.from('profiles').delete().eq('id', userId);
    await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);
    
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;