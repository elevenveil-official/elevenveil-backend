const express = require('express');
const supabase = require('../services/supabaseClient');
const { receiptHash } = require('../services/receiptService');
const router = express.Router();

const T = {
  es: {
    title: 'Recibo de predicción',
    by: 'Predicción de',
    stSealed: 'SELLADO',
    stHit: '✓ ACERTADO',
    stMiss: '✗ FALLADO',
    stReplaced: 'REEMPLAZADO',
    pending: 'Pendiente del partido',
    replacedNote: 'El autor sustituyó esta predicción por otra posterior. Este recibo ya no es su predicción vigente.',
    scorer: 'Goleador',
    mvp: 'MVP',
    starter: 'Titular',
    result: 'Resultado final',
    exact: 'Marcador exacto',
    score: 'Vision Score',
    sealedAt: 'Sellado el',
    lead: 'Sellado {x} antes del inicio',
    unverified: 'Hora de inicio no verificada',
    integrityOk: 'Integridad verificada',
    integrityBad: 'La huella no coincide con el contenido',
    fingerprint: 'Huella',
    cta: 'Sella tus predicciones antes del partido · ElevenVeil',
    notFound: 'Recibo no encontrado',
    notFoundText: 'Este enlace no corresponde a ningún recibo.',
    player: 'Jugador',
  },
  en: {
    title: 'Prediction receipt',
    by: 'Prediction by',
    stSealed: 'SEALED',
    stHit: '✓ CORRECT',
    stMiss: '✗ MISSED',
    stReplaced: 'REPLACED',
    pending: 'Waiting for the match',
    replacedNote: 'The author replaced this prediction with a later one. This receipt is no longer their current prediction.',
    scorer: 'Scorer',
    mvp: 'MVP',
    starter: 'Starter',
    result: 'Final result',
    exact: 'Exact score',
    score: 'Vision Score',
    sealedAt: 'Sealed on',
    lead: 'Sealed {x} before kickoff',
    unverified: 'Kickoff time not verified',
    integrityOk: 'Integrity verified',
    integrityBad: 'Fingerprint does not match the content',
    fingerprint: 'Fingerprint',
    cta: 'Seal your predictions before the match · ElevenVeil',
    notFound: 'Receipt not found',
    notFoundText: 'This link does not match any receipt.',
    player: 'Player',
  },
};

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function fmtUtc(d) {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function fmtLead(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return '< 1 min';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

function row(label, value) {
  return `<div class="row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

const STYLE = `
*{box-sizing:border-box}body{margin:0;background:#F4F6F8;color:#0B0E14;font-family:'Poppins',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:440px;margin:0 auto;padding:22px 16px 40px}
.brand{font-weight:800;font-size:20px;letter-spacing:-.4px;margin:4px 4px 16px}.brand b{color:#12C75A}
.card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 10px 34px rgba(11,14,20,.10)}
.top{background:#0B0E14;color:#fff;padding:24px 22px 22px;text-align:center}
.kicker{color:#12D26B;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase}
.league{color:#9CA3AF;font-size:12px;margin-top:10px}
.teams{font-size:16px;font-weight:600;margin-top:6px;line-height:1.35}.teams i{color:#6B7280;font-style:normal;font-weight:500;margin:0 6px}
.pred{font-size:54px;font-weight:800;letter-spacing:-1px;margin:10px 0 2px;color:#fff}
.by{color:#9CA3AF;font-size:12px}.by b{color:#fff}
.status{text-align:center;font-weight:800;font-size:15px;letter-spacing:1px;padding:13px 10px}
.st-sealed{background:#E8FBF0;color:#0B8F43}.st-hit{background:#12D26B;color:#0B0E14}.st-miss{background:#FDECEC;color:#B42318}.st-replaced{background:#EEF0F3;color:#6B7280}
.sub{font-size:12px;font-weight:500;letter-spacing:0;margin-top:3px;opacity:.85}
.body{padding:8px 22px 6px}
.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #EEF0F3;font-size:14px}.row span{color:#6B7280}.row strong{text-align:right}
.note{margin:14px 0 4px;font-size:13px;color:#6B7280;line-height:1.5}
.seal{padding:14px 22px 20px;font-size:12px;color:#6B7280;line-height:1.7}
.seal .ok{color:#0B8F43;font-weight:600}.seal .bad{color:#B42318;font-weight:600}.seal code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#0B0E14}
.cta{text-align:center;color:#6B7280;font-size:12px;margin-top:18px}
`;

function shell(lang, title, inner, meta = '') {
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · ElevenVeil</title>
${meta}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>${STYLE}</style></head>
<body><main class="wrap"><div class="brand">Eleven<b>Veil</b></div>${inner}</main></body></html>`;
}

router.get('/:code', async (req, res) => {
  const lang = ['es', 'en'].includes(req.query.lang) ? req.query.lang : req.acceptsLanguages('es', 'en') || 'en';
  const L = T[lang];
  const code = String(req.params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=60');
  res.set('X-Robots-Tag', 'noindex');

  const { data: r } = await supabase.from('prediction_receipts').select('*').eq('code', code).maybeSingle();

  if (!r) {
    return res
      .status(404)
      .send(shell(lang, L.notFound, `<div class="card"><div class="top"><div class="kicker">${esc(L.notFound)}</div><p class="by">${esc(L.notFoundText)}</p></div></div>`));
  }

  const { data: profile } = await supabase.from('profiles').select('username').eq('id', r.user_id).maybeSingle();
  const username = profile?.username || L.player;

  const m = r.match_info || {};
  const home = m.homeName || `#${r.fixture_id}`;
  const away = m.awayName || '';
  const replaced = !!r.superseded_at;

  let stText = L.stSealed;
  let stClass = 'st-sealed';
  let stSub = L.pending;
  if (replaced) {
    stText = L.stReplaced;
    stClass = 'st-replaced';
    stSub = '';
  } else if (r.status === 'hit') {
    stText = L.stHit;
    stClass = 'st-hit';
    stSub = r.exact ? L.exact : '';
  } else if (r.status === 'miss') {
    stText = L.stMiss;
    stClass = 'st-miss';
    stSub = '';
  }

  let rows = '';
  if (r.scorer_name) rows += row(L.scorer, r.scorer_name);
  if (r.mvp_name) rows += row(L.mvp, r.mvp_name);
  if (r.starter_name) rows += row(L.starter, r.starter_name);
  if (!replaced && r.status !== 'sealed' && r.final_home !== null && r.final_away !== null) {
    rows += row(L.result, `${r.final_home} – ${r.final_away}`);
    if (r.vision_score !== null) rows += row(L.score, r.vision_score);
  }

  let leadLine = '';
  if (r.kickoff && r.kickoff_verified) {
    const diff = new Date(r.kickoff).getTime() - new Date(r.sealed_at).getTime();
    leadLine = `<div>${esc(L.lead.replace('{x}', fmtLead(diff)))}</div>`;
  } else {
    leadLine = `<div>${esc(L.unverified)}</div>`;
  }

  const hash = receiptHash(r);
  const okHash = hash === r.hash;

  const inner = `
<article class="card">
  <div class="top">
    <div class="kicker">${esc(L.title)}</div>
    ${m.leagueName ? `<div class="league">${esc(m.leagueName)}</div>` : ''}
    <div class="teams">${esc(home)}${away ? ` <i>vs</i> ${esc(away)}` : ''}</div>
    <div class="pred">${esc(r.predicted_home)} – ${esc(r.predicted_away)}</div>
    <div class="by">${esc(L.by)} <b>${esc(username)}</b></div>
  </div>
  <div class="status ${stClass}">${esc(stText)}${stSub ? `<div class="sub">${esc(stSub)}</div>` : ''}</div>
  <div class="body">
    ${rows}
    ${replaced ? `<p class="note">${esc(L.replacedNote)}</p>` : ''}
  </div>
  <div class="seal">
    <div>${esc(L.sealedAt)} <strong>${esc(fmtUtc(r.sealed_at))}</strong></div>
    ${leadLine}
    <div class="${okHash ? 'ok' : 'bad'}">${okHash ? '✓ ' + esc(L.integrityOk) : '⚠ ' + esc(L.integrityBad)}</div>
    <div>${esc(L.fingerprint)}: <code>${esc(r.hash.slice(0, 16))}…</code></div>
  </div>
</article>
<div class="cta">${esc(L.cta)}</div>`;

  const ogTitle = `${L.title} · ${home}${away ? ' vs ' + away : ''} ${r.predicted_home}–${r.predicted_away}`;
  const meta = `<meta property="og:title" content="${esc(ogTitle)}"><meta property="og:description" content="${esc(L.by + ' ' + username + ' · ' + stText)}"><meta property="og:type" content="website">`;

  res.send(shell(lang, ogTitle, inner, meta));
});

module.exports = router;