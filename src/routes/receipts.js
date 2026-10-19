const express = require('express');
const supabase = require('../services/supabaseClient');
const { requireSelf } = require('../middleware/auth');
const { receiptUrl } = require('../services/receiptService');
const router = express.Router();

router.param('userId', requireSelf);

// Recibos vigentes del jugador (los reemplazados no salen en la lista; su enlace público sigue funcionando).
router.get('/mine/:userId', async (req, res) => {
  const { data, error } = await supabase
    .from('prediction_receipts')
    .select('code, fixture_id, predicted_home, predicted_away, scorer_name, mvp_name, starter_name, sealed_at, kickoff, kickoff_verified, status, exact, final_home, final_away, vision_score, match_info')
    .eq('user_id', req.params.userId)
    .is('superseded_at', null)
    .order('sealed_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    receipts: (data || []).map((r) => ({
      code: r.code,
      url: receiptUrl(r.code),
      fixtureId: r.fixture_id,
      predictedHome: r.predicted_home,
      predictedAway: r.predicted_away,
      scorerName: r.scorer_name,
      mvpName: r.mvp_name,
      starterName: r.starter_name,
      sealedAt: r.sealed_at,
      kickoff: r.kickoff,
      kickoffVerified: r.kickoff_verified,
      status: r.status,
      exact: !!r.exact,
      finalHome: r.final_home,
      finalAway: r.final_away,
      visionScore: r.vision_score,
      match: r.match_info || null,
    })),
  });
});

module.exports = router;