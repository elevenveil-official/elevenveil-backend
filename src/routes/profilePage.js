const express = require('express');
const supabase = require('../services/supabaseClient');
const { buildPublicData, MIN_RESOLVED } = require('../services/publicProfileService');
const router = express.Router();

const T = {
  es: {
    verified: 'Verificado por ElevenVeil',
    hitRate: 'Acierto real',
    resolved: 'Resueltas',
    bestStreak: 'Mejor racha',
    currentStreak: 'Racha actual',
    building: `Construyendo su historial: el porcentaje aparece con ${MIN_RESOLVED} predicciones resueltas.`,
    recent: 'Últimos recibos',
    noReceipts: 'Aún no hay recibos resueltos.',
    capsules: 'Cápsulas',
    capSummary: (o, h, m) => `${o} abiertas · ${h} acertadas · ${m} falladas`,
    noCapsules: 'Sin cápsulas públicas.',
    how: 'Cada predicción se sella con la hora del servidor antes del partido y no se puede editar. Aquí solo cuentan los recibos sellados.',
    final: 'final',
    cta: 'Sella tus predicciones antes del partido · ElevenVeil',
    notFound: 'Perfil no disponible',
    notFoundText: 'Este perfil no existe o no es público.',
  },
  en: {
    verified: 'Verified by ElevenVeil',
    hitRate: 'Real hit rate',
    resolved: 'Resolved',
    bestStreak: 'Best streak',
    currentStreak: 'Current streak',
    building: `Building their record: the percentage appears after ${MIN_RESOLVED} resolved predictions.`,
    recent: 'Latest receipts',
    noReceipts: 'No resolved receipts yet.',
    capsules: 'Capsules',
    capSummary: (o, h, m) => `${o} open · ${h} correct · ${m} missed`,
    noCapsules: 'No public capsules.',
    how: 'Every prediction is sealed with the server time before the match and cannot be edited. Only sealed receipts count here.',
    final: 'final',
    cta: 'Seal your predictions before the match · ElevenVeil',
    notFound: 'Profile not available',
    notFoundText: 'This profile does not exist or is not public.',
  },
};

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const escapeLike = (s) => String(s).replace(/[\\%_]/g, (m) => '\\' + m);

const STYLE = `
*{box-sizing:border-box}body{margin:0;background:#F4F6F8;color:#0B0E14;font-family:'Poppins',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:440px;margin:0 auto;padding:22px 16px 40px}
.brand{font-weight:800;font-size:20px;letter-spacing:-.4px;margin:4px 4px 16px}.brand b{color:#12C75A}
.card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 10px 34px rgba(11,14,20,.10)}
.top{background:#0B0E14;color:#fff;padding:26px 22px 22px;text-align:center}
.av{width:78px;height:78px;border-radius:50%;object-fit:cover;border:3px solid #12D26B;background:#1b2230;display:inline-flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:#12D26B}
.name{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-top:12px;word-wrap:break-word;overflow-wrap:anywhere}
.badge{display:inline-block;margin-top:10px;background:#12D26B;color:#0B0E14;font-size:11px;font-weight:800;letter-spacing:.6px;border-radius:20px;padding:5px 12px}
.rank{color:#9CA3AF;font-size:12px;margin-top:8px}
.tiles{display:flex;gap:10px;padding:18px 18px 6px}
.tile{flex:1;background:#F4F6F8;border-radius:16px;padding:14px 6px;text-align:center}
.tile b{display:block;font-size:26px;font-weight:800;letter-spacing:-.5px}.tile span{display:block;font-size:11px;color:#6B7280;margin-top:2px}
.tile.main{background:#E8FBF0}.tile.main b{color:#0B8F43}
.note{margin:8px 22px 0;font-size:12px;color:#6B7280;line-height:1.5}
h2{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#6B7280;margin:22px 22px 6px}
.list{padding:0 14px}
.item{display:flex;align-items:center;gap:10px;padding:12px 8px;border-bottom:1px solid #EEF0F3;text-decoration:none;color:inherit}
.item:last-child{border-bottom:0}
.item .t{flex:1;font-size:13px;font-weight:600;min-width:0;word-wrap:break-word;overflow-wrap:anywhere}
.item small{display:block;font-weight:500;color:#6B7280;font-size:11px;margin-top:2px}
.item .s{font-size:15px;font-weight:800;white-space:nowrap}
.chip{width:24px;height:24px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex:none}
.chip.hit{background:#12D26B;color:#0B0E14}.chip.miss{background:#FDECEC;color:#B42318}.chip.sealed{background:#E8FBF0;color:#0B8F43}.chip.void{background:#EEF0F3;color:#6B7280}
.empty{padding:6px 22px;font-size:13px;color:#9CA3AF}
.sum{padding:0 22px 4px;font-size:12px;color:#6B7280}
.how{padding:18px 22px 22px;font-size:12px;color:#6B7280;line-height:1.6}
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
  `<div class="card"><div class="top"><div class="badge">${esc(kicker)}</div><p class="rank" style="margin-top:14px">${esc(text)}</p></div></div>`;

const chipFor = (status) =>
  status === 'hit' ? '<span class="chip hit">✓</span>'
  : status === 'miss' ? '<span class="chip miss">✗</span>'
  : status === 'void' ? '<span class="chip void">–</span>'
  : '<span class="chip sealed">●</span>';

router.get('/:username', async (req, res) => {
  const lang = ['es', 'en'].includes(req.query.lang) ? req.query.lang : req.acceptsLanguages('es', 'en') || 'en';
  const L = T[lang];
  const name = String(req.params.username || '').slice(0, 60);

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=60');
  res.set('X-Robots-Tag', 'noindex');

  const fields = 'id, username, avatar_url, rank, is_pro, public_profile';
  let { data: profile } = await supabase.from('profiles').select(fields).eq('username', name).maybeSingle();
  if (!profile) {
    const { data: alt } = await supabase.from('profiles').select(fields).ilike('username', escapeLike(name)).limit(1);
    profile = alt?.[0] || null;
  }

  // Solo se publica si el jugador es PRO y lo ha activado. No se revela si existe o no.
  if (!profile || !profile.is_pro || !profile.public_profile) {
    return res.status(404).send(shell(lang, L.notFound, simpleCard(L.notFound, L.notFoundText)));
  }

  const { stats, capsules } = await buildPublicData(profile);

  const avatar = profile.avatar_url && /^https:\/\//.test(profile.avatar_url)
    ? `<img class="av" src="${esc(profile.avatar_url)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="av">${esc(profile.username.slice(0, 1).toUpperCase())}</div>`;

  const receiptRows = stats.recent.map((r) => {
    const m = r.match_info || {};
    const home = m.homeName || `#${r.fixture_id}`;
    const title = m.awayName ? `${home} – ${m.awayName}` : home;
    const fin = r.final_home !== null && r.final_away !== null ? `<small>${esc(L.final)} ${esc(r.final_home)}–${esc(r.final_away)}</small>` : '';
    return `<a class="item" href="/r/${esc(r.code)}"><span class="t">${esc(title)}${fin}</span><span class="s">${esc(r.predicted_home)}–${esc(r.predicted_away)}</span>${chipFor(r.status)}</a>`;
  }).join('');

  const capRows = capsules.list.map((c) =>
    `<a class="item" href="/c/${esc(c.code)}"><span class="t">“${esc(c.body)}”</span>${chipFor(c.status)}</a>`
  ).join('');

  const accuracyTxt = stats.accuracy === null ? '—' : `${stats.accuracy}%`;

  const inner = `
<article class="card">
  <div class="top">
    ${avatar}
    <div class="name">${esc(profile.username)}</div>
    <div class="badge">✓ ${esc(L.verified)}</div>
    ${profile.rank ? `<div class="rank">${esc(profile.rank)}</div>` : ''}
  </div>
  <div class="tiles">
    <div class="tile main"><b>${esc(accuracyTxt)}</b><span>${esc(L.hitRate)}</span></div>
    <div class="tile"><b>${esc(stats.resolved)}</b><span>${esc(L.resolved)}</span></div>
    <div class="tile"><b>${esc(stats.bestStreak)}</b><span>${esc(L.bestStreak)}</span></div>
  </div>
  ${stats.accuracy === null ? `<p class="note">${esc(L.building)}</p>` : ''}
  ${stats.currentStreak > 0 ? `<p class="note">${esc(L.currentStreak)}: <strong>${esc(stats.currentStreak)}</strong></p>` : ''}

  <h2>${esc(L.recent)}</h2>
  ${receiptRows ? `<div class="list">${receiptRows}</div>` : `<div class="empty">${esc(L.noReceipts)}</div>`}

  <h2>${esc(L.capsules)}</h2>
  ${capRows
    ? `<div class="sum">${esc(L.capSummary(capsules.open, capsules.hit, capsules.miss))}</div><div class="list">${capRows}</div>`
    : `<div class="empty">${esc(L.noCapsules)}</div>`}

  <div class="how">${esc(L.how)}</div>
</article>
<div class="cta">${esc(L.cta)}</div>`;

  const desc = stats.accuracy === null ? L.verified : `${stats.accuracy}% · ${stats.resolved} ${L.resolved.toLowerCase()}`;
  const meta = `<meta property="og:title" content="${esc(profile.username + ' · ' + L.verified)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="profile">`;

  res.send(shell(lang, `${profile.username} · ${L.verified}`, inner, meta));
});

module.exports = router;