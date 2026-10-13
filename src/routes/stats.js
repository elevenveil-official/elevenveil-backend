const express = require('express');
const supabase = require('../services/supabaseClient');
const { requireSelf } = require('../middleware/auth');

const router = express.Router();
router.param('userId', requireSelf);

const MAX_ROWS = 2000;
const MIN_SAMPLE = 3; // mínimo de predicciones para sacar conclusiones de una liga, un equipo o una habilidad
const CHUNK = 150;

// Misma lógica que la ruta de rachas: un fallo cubierto por un escudo no rompe la racha
function bestStreakOf(preds, covered) {
  let best = 0;
  let running = 0;
  for (const p of [...preds].sort((a, b) => String(a.scored_at).localeCompare(String(b.scored_at)))) {
    if (p.vision_score > 0) { running++; best = Math.max(best, running); }
    else if (covered.has(p.fixture_id)) continue;
    else running = 0;
  }
  return best;
}

const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : 0);

function basicStats(preds, covered) {
  const total = preds.length;
  const hits = preds.filter((p) => p.correct_result).length;
  return {
    total,
    hits,
    accuracy: pct(hits, total),
    exact: preds.filter((p) => p.correct_scoreline).length,
    avgVision: total ? Math.round(preds.reduce((s, p) => s + (p.vision_score || 0), 0) / total) : 0,
    xp: preds.reduce((s, p) => s + (p.xp_earned || 0), 0),
    bestStreak: bestStreakOf(preds, covered),
  };
}

function detailStats(preds, snapById) {
  // ---- ligas ----
  const leagues = {};
  const teams = {};
  for (const p of preds) {
    const s = snapById[p.fixture_id];
    if (!s) continue;
    const hit = p.correct_result ? 1 : 0;
    if (s.league_name) {
      const l = (leagues[s.league_name] = leagues[s.league_name] || { name: s.league_name, total: 0, hits: 0 });
      l.total++; l.hits += hit;
    }
    for (const name of [s.home_name, s.away_name]) {
      if (!name) continue;
      const t = (teams[name] = teams[name] || { name, total: 0, hits: 0 });
      t.total++; t.hits += hit;
    }
  }
  const rank = (obj) =>
    Object.values(obj)
      .filter((x) => x.total >= MIN_SAMPLE)
      .map((x) => ({ name: x.name, total: x.total, accuracy: pct(x.hits, x.total) }))
      .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  const leagueList = rank(leagues).slice(0, 5);
  const teamList = rank(teams);
  const bestTeam = teamList[0] || null;
  const nemesisTeam = teamList.length >= 2 ? teamList[teamList.length - 1] : null;

  // ---- habilidades ----
  const skill = (attempts, hits) => ({ attempts, hits, rate: attempts >= MIN_SAMPLE ? pct(hits, attempts) : null });
  const skills = {
    result: skill(preds.length, preds.filter((p) => p.correct_result).length),
    exact: skill(preds.length, preds.filter((p) => p.correct_scoreline).length),
    scorer: skill(preds.filter((p) => p.predicted_scorer_name).length, preds.filter((p) => p.predicted_scorer_name && p.correct_scorer).length),
    mvp: skill(preds.filter((p) => p.predicted_mvp_name).length, preds.filter((p) => p.predicted_mvp_name && p.correct_mvp).length),
  };
  const ranked = Object.entries(skills).filter(([, v]) => v.rate !== null).sort((a, b) => b[1].rate - a[1].rate);
  return {
    leagues: leagueList,
    bestTeam,
    nemesisTeam: nemesisTeam && bestTeam && nemesisTeam.name !== bestTeam.name ? nemesisTeam : null,
    skills,
    topSkill: ranked.length ? ranked[0][0] : null,
  };
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const now = new Date();
    const thisMonth = monthKey(now);

    const [predsRes, shieldRes, profileRes] = await Promise.all([
      supabase
        .from('match_predictions')
        .select('fixture_id, vision_score, xp_earned, scored_at, correct_result, correct_scoreline, correct_scorer, correct_mvp, predicted_scorer_name, predicted_mvp_name')
        .eq('user_id', userId)
        .gt('scored_at', '1970-01-01')
        .order('scored_at', { ascending: false })
        .limit(MAX_ROWS),
      supabase.from('shield_uses').select('fixture_id').eq('user_id', userId),
      supabase.from('profiles').select('username, rank, active_title, is_pro').eq('id', userId).single(),
    ]);
    if (predsRes.error) throw new Error(predsRes.error.message);
    const profile = profileRes.data;
    if (!profile) return res.status(404).json({ error: 'profile_not_found' });

    const all = predsRes.data || [];
    const monthPreds = all.filter((p) => monthKey(new Date(p.scored_at)) === thisMonth);
    const covered = new Set((shieldRes.data || []).map((s) => s.fixture_id));
    const isPro = !!profile.is_pro;

    const periods = { month: { ...basicStats(monthPreds, covered), detail: null }, all: { ...basicStats(all, covered), detail: null } };
    let trend = null;

    if (isPro && all.length) {
      // datos de liga y equipo guardados al predecir (solo existen para predicciones recientes)
      const ids = [...new Set(all.map((p) => p.fixture_id))];
      const chunks = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      const results = await Promise.all(chunks.map((c) => supabase.from('fixture_snapshots').select('fixture_id, league_name, home_name, away_name').in('fixture_id', c)));
      const snapById = {};
      results.forEach((r) => (r.data || []).forEach((s) => { snapById[s.fixture_id] = s; }));

      periods.month.detail = detailStats(monthPreds, snapById);
      periods.all.detail = detailStats(all, snapById);

      // tendencia: últimos 6 meses
      trend = [];
      for (let i = 5; i >= 0; i--) {
        const key = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
        const inMonth = all.filter((p) => monthKey(new Date(p.scored_at)) === key);
        trend.push({ month: key, total: inMonth.length, accuracy: pct(inMonth.filter((p) => p.correct_result).length, inMonth.length) });
      }
    }

    res.json({
      isPro,
      month: thisMonth,
      player: { username: profile.username, rank: profile.rank, title: profile.active_title },
      periods,
      trend,
    });
  } catch (e) {
    console.error('[stats]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;