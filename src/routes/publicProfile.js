const express = require('express');
const supabase = require('../services/supabaseClient');
const { requireSelf } = require('../middleware/auth');
const { getSettings } = require('../services/publicProfileService');
const router = express.Router();

router.param('userId', requireSelf);

// Estado del perfil público del jugador (para la pantalla de ajustes)
router.get('/:userId', async (req, res) => {
  try {
    res.json(await getSettings(req.params.userId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Activar o desactivar el perfil público. Solo PRO puede activarlo.
router.put('/:userId', async (req, res) => {
  const enabled = !!req.body?.enabled;
  try {
    const current = await getSettings(req.params.userId);

    if (enabled && !current.isPro) return res.status(403).json({ error: 'pro_required' });
    if (enabled && !current.username) return res.status(400).json({ error: 'no_username' });

    const { error } = await supabase
      .from('profiles')
      .update({ public_profile: enabled })
      .eq('id', req.params.userId);
    if (error) return res.status(500).json({ error: error.message });

    res.json({ ...current, enabled });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;