const express = require('express');
const supabase = require('../services/supabaseClient');
const { requireSelf } = require('../middleware/auth');
const { createCapsule, getLimits, capsuleUrl } = require('../services/capsuleService');
const router = express.Router();

router.param('userId', requireSelf);

const present = (c) => ({
  code: c.code,
  url: capsuleUrl(c.code),
  body: c.body,
  resolvesOn: c.resolves_on,
  sealedAt: c.sealed_at,
  status: c.status,
  resolutionNote: c.resolution_note || null,
});

// Sellar una cápsula nueva
router.post('/', async (req, res) => {
  const { userId, body, resolvesOn } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const capsule = await createCapsule({ userId, body, resolvesOn });
    res.json({ capsule: present(capsule) });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message, ...(e.extra || {}) });
    res.status(500).json({ error: e.message });
  }
});

// Cápsulas del jugador + cuántas tiene abiertas y cuántas puede tener
router.get('/mine/:userId', async (req, res) => {
  const { data, error } = await supabase
    .from('prediction_capsules')
    .select('code, body, resolves_on, sealed_at, status, resolution_note')
    .eq('user_id', req.params.userId)
    .eq('hidden', false)
    .order('sealed_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  const limits = await getLimits(req.params.userId);
  res.json({
    capsules: (data || []).map(present),
    openCount: limits.openCount,
    maxOpen: limits.maxOpen,
    isPro: limits.isPro,
  });
});

module.exports = router;