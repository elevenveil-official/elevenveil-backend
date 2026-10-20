const express = require('express');
const supabase = require('../services/supabaseClient');
const { capsuleHash } = require('../services/capsuleService');
const router = express.Router();

const CONTACT = 'elevenveil.official@gmail.com';

const T = {
  es: {
    title: 'Cápsula de predicción',
    by: 'Predicción de',
    stSealed: 'SELLADA',
    stHit: '✓ ACERTADA',
    stMiss: '✗ FALLADA',
    stVoid: 'ANULADA',
    opens: 'Se resuelve el',
    pending: 'Pendiente de resolución',
    note: 'Resolución',
    sealedAt: 'Sellada el',
    integrityOk: 'Integridad verificada',
    integrityBad: 'La huella no coincide con el contenido',
    fingerprint: 'Huella',
    userText: 'Texto escrito por el jugador.',
    report: 'Reportar',
    cta: 'Sella tus predicciones antes de que pasen · ElevenVeil',
    notFound: 'Cápsula no encontrada',
    notFoundText: 'Este enlace no corresponde a ninguna cápsula.',
    removed: 'Cápsula retirada',
    removedText: 'Esta cápsula ya no está disponible.',
    player: 'Jugador',
  },
  en: {
    title: 'Prediction capsule',
    by: 'Prediction by',
    stSealed: 'SEALED',
    stHit: '✓ CORRECT',
    stMiss: '✗ MISSED',
    stVoid: 'VOIDED',
    opens: 'Resolves on',
    pending: 'Waiting for resolution',
    note: 'Resolution',
    sealedAt: 'Sealed on',
    integrityOk: 'Integrity verified',
    integrityBad: 'Fingerprint does not match the content',
    fingerprint: 'Fingerprint',
    userText: 'Text written by the player.',
    report: 'Report',
    cta: 'Seal your predictions before they happen · ElevenVeil',
    notFound: 'Capsule not found',
    notFoundText: 'This link does not match any capsule.',
    removed: 'Capsule removed',
    removedText: 'This capsule is no longer available.',
    player: 'Player',
  },
};

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const fmtUtc = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

const fmtDate = (ymd, lang) => {
  const [y, m, d] = String(ymd).split('-');
  return lang === 'es' ? `${d}/${m}/${y}` : `${y}-${m}-${d}`;
};

const STYLE = `
*{box-sizing:border-box}body{margin:0;background:#F4F6F8;color:#0B0E14;font-family:'Poppins',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:440px;margin:0 auto;padding:22px 16px 40px}
.brand{font-weight:800;font-size:20px;letter-spacing:-.4px;margin:4px 4px 16px}.brand b{color:#12C75A}
.card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 10px 34px rgba(11,14,20,.10)}
.top{background:#0B0E14;color:#fff;padding:26px 22px 24px;text-align:center}
.kicker{color:#12D26B;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase}
.quote{font-size:22px;font-weight:700;line-height:1.3;margin:16px 0 14px;word-wrap:break-word;overflow-wrap:anywhere}
.by{color:#9CA3AF;font-size:12px}.by b{color:#fff}
.status{text-align:center;font-weight:800;font-size:15px;letter-spacing:1px;padding:13px 10px}
.st-sealed{background:#E8FBF0;color:#0B8F43}.st-hit{background:#12D26B;color:#0B0E14}.st-miss{background:#FDECEC;color:#B42318}.st-void{background:#EEF0F3;color:#6B7280}
.sub{font-size:12px;font-weight:500;letter-spacing:0;margin-top:3px;opacity:.85}
.body{padding:6px 22px 4px}
.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #EEF0F3;font-size:14px}.row span{color:#6B7280}.row strong{text-align:right}
.seal{padding:14px 22px 18px;font-size:12px;color:#6B7280;line-height:1.7}
.seal .ok{color:#0B8F43;font-weight:600}.seal .bad{color:#B42318;font-weight:600}.seal code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#0B0E14}
.small{padding:0 22px 18px;font-size:11px;color:#9CA3AF}.small a{color:#6B7280}
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

const simpleCard = (kicker, text) =>
  `<div class="card"><div class="top"><div class="kicker">${esc(kicker)}</div><p class="by" style="margin-top:14px">${esc(text)}</p></div></div>`;

router.get('/:code', async (req, res) => {
  const lang = ['es', 'en'].includes(req.query.lang) ? req.query.lang : req.acceptsLanguages('es', 'en') || 'en';
  const L = T[lang];
  const code = String(req.params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=60');
  res.set('X-Robots-Tag', 'noindex');

  const { data: c } = await supabase.from('prediction_capsules').select('*').eq('code', code).maybeSingle();

  if (!c) return res.status(404).send(shell(lang, L.notFound, simpleCard(L.notFound, L.notFoundText)));
  if (c.hidden) return res.status(410).send(shell(lang, L.removed, simpleCard(L.removed, L.removedText)));

  const { data: profile } = await supabase.from('profiles').select('username').eq('id', c.user_id).maybeSingle();
  const username = profile?.username || L.player;

  const todayYmd = new Date().toISOString().slice(0, 10);
  let stText = L.stSealed;
  let stClass = 'st-sealed';
  let stSub = c.resolves_on <= todayYmd ? L.pending : `${L.opens} ${fmtDate(c.resolves_on, lang)}`;
  if (c.status === 'hit') { stText = L.stHit; stClass = 'st-hit'; stSub = ''; }
  else if (c.status === 'miss') { stText = L.stMiss; stClass = 'st-miss'; stSub = ''; }
  else if (c.status === 'void') { stText = L.stVoid; stClass = 'st-void'; stSub = ''; }

  const okHash = capsuleHash(c) === c.hash;

  const inner = `
<article class="card">
  <div class="top">
    <div class="kicker">${esc(L.title)}</div>
    <div class="quote">“${esc(c.body)}”</div>
    <div class="by">${esc(L.by)} <b>${esc(username)}</b></div>
  </div>
  <div class="status ${stClass}">${esc(stText)}${stSub ? `<div class="sub">${esc(stSub)}</div>` : ''}</div>
  <div class="body">
    ${c.resolution_note ? `<div class="row"><span>${esc(L.note)}</span><strong>${esc(c.resolution_note)}</strong></div>` : ''}
  </div>
  <div class="seal">
    <div>${esc(L.sealedAt)} <strong>${esc(fmtUtc(c.sealed_at))}</strong></div>
    <div class="${okHash ? 'ok' : 'bad'}">${okHash ? '✓ ' + esc(L.integrityOk) : '⚠ ' + esc(L.integrityBad)}</div>
    <div>${esc(L.fingerprint)}: <code>${esc(c.hash.slice(0, 16))}…</code></div>
  </div>
  <div class="small">${esc(L.userText)} <a href="mailto:${CONTACT}?subject=${encodeURIComponent('Report capsule ' + c.code)}">${esc(L.report)}</a></div>
</article>
<div class="cta">${esc(L.cta)}</div>`;

  const ogTitle = `${L.title} · “${c.body.slice(0, 80)}”`;
  const meta = `<meta property="og:title" content="${esc(ogTitle)}"><meta property="og:description" content="${esc(L.by + ' ' + username + ' · ' + stText)}"><meta property="og:type" content="website">`;

  res.send(shell(lang, ogTitle, inner, meta));
});

module.exports = router;