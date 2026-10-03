const express = require('express');
const supabase = require('../services/supabaseClient');
const { isNotAllowed } = require('../services/nameFilter');

const router = express.Router();
router.use(express.json());

const PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const COOLDOWN_DAYS = 30;

router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const raw = String((req.body || {}).username ?? '').trim();

    if (!PATTERN.test(raw)) return res.status(400).json({ error: 'invalid' });
    if (isNotAllowed(raw)) return res.status(400).json({ error: 'not_allowed' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('username_changed_at')
      .eq('id', userId)
      .single();
    if (!profile) return res.status(404).json({ error: 'profile_not_found' });

    if (profile.username_changed_at) {
      const days = (Date.now() - new Date(profile.username_changed_at).getTime()) / 86400000;
      if (days < COOLDOWN_DAYS) {
        return res.status(429).json({ error: 'too_soon', retryAfterDays: Math.ceil(COOLDOWN_DAYS - days) });
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ username: raw, username_changed_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'taken' });
      console.error('[username]', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true, username: raw });
  } catch (e) {
    console.error('[username]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

