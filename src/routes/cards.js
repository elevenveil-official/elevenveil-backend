const express = require('express');
const supabase = require('../services/supabaseClient');
const { requireSelf } = require('../middleware/auth');

const router = express.Router();
router.use(express.json());
router.param('userId', requireSelf); // solo el propio jugador puede usar estas rutas

const clean = (v, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanLogo = (v) => (typeof v === 'string' && v.startsWith('https://') && v.length <= 300 ? v : null);

// ---------- POST: guardar los datos del partido (nombres y escudos) al hacer una predicción ----------
router.post('/:userId/snapshot', async (req, res) => {
  try {
    const { userId } = req.params;
    const b = req.body || {};
    const fixtureId = Number(b.fixtureId);
    const homeName = clean(b.home?.name);
    const awayName = clean(b.away?.name);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0 || !homeName || !awayName) {
      return res.status(400).json({ error: 'bad_request' });
    }

    // Solo puede guardarlo quien tiene una predicción en ese partido
    const { data: pred } = await supabase
      .from('match_predictions').select('fixture_id').eq('user_id', userId).eq('fixture_id', fixtureId).maybeSingle();
    if (!pred) return res.status(403).json({ error: 'no_prediction' });

    const kickoff = b.kickoff && !Number.isNaN(Date.parse(b.kickoff)) ? new Date(b.kickoff).toISOString() : null;
    const { error } = await supabase.from('fixture_snapshots').upsert({
      fixture_id: fixtureId,
      home_name: homeName,
      home_logo: cleanLogo(b.home?.logo),
      away_name: awayName,
      away_logo: cleanLogo(b.away?.logo),
      league_name: clean(b.leagueName) || null,
      kickoff,
    }, { onConflict: 'fixture_id', ignoreDuplicates: true }); // el primero que lo guarda gana
    if (error) throw new Error(error.message);
    res.json({ success: true });
  } catch (e) {
    console.error('[cards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- GET: mis predicciones ya puntuadas, listas para compartir ----------
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [predsRes, profileRes] = await Promise.all([
      supabase
        .from('match_predictions')
        .select('fixture_id, predicted_home_score, predicted_away_score, vision_score, xp_earned, scored_at, correct_result, correct_scoreline, correct_scorer, correct_mvp, predicted_scorer_name, predicted_mvp_name')
        .eq('user_id', userId)
        .gt('scored_at', '1970-01-01')
        .order('scored_at', { ascending: false })
        .limit(40),
      supabase.from('profiles').select('username, rank, active_title').eq('id', userId).single(),
    ]);
    const preds = predsRes.data || [];
    const ids = preds.map((p) => p.fixture_id);
    let snaps = [];
    if (ids.length) {
      const { data } = await supabase.from('fixture_snapshots').select('*').in('fixture_id', ids);
      snaps = data || [];
    }
    const snapById = {};
    snaps.forEach((s) => { snapById[s.fixture_id] = s; });

    const visions = preds
      .filter((p) => snapById[p.fixture_id]) // sin datos del partido no se puede dibujar la tarjeta
      .map((p) => {
        const s = snapById[p.fixture_id];
        return {
          fixtureId: p.fixture_id,
          predictedHome: p.predicted_home_score,
          predictedAway: p.predicted_away_score,
          visionScore: p.vision_score || 0,
          xp: p.xp_earned || 0,
          scoredAt: p.scored_at,
          correctResult: !!p.correct_result,
          correctScoreline: !!p.correct_scoreline,
          correctScorer: !!p.correct_scorer,
          correctMvp: !!p.correct_mvp,
          scorerName: p.predicted_scorer_name || null,
          mvpName: p.predicted_mvp_name || null,
          match: {
            homeName: s.home_name, homeLogo: s.home_logo, awayName: s.away_name, awayLogo: s.away_logo,
            leagueName: s.league_name, kickoff: s.kickoff,
          },
        };
      });

    const p = profileRes.data;
    res.json({
      player: { username: p?.username || null, rank: p?.rank || 'Rookie', title: p?.active_title || null },
      visions,
    });
  } catch (e) {
    console.error('[cards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;