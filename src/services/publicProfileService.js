const supabase = require('./supabaseClient');

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://elevenveil-backend.onrender.com';
const MIN_RESOLVED = 5; // el porcentaje solo se muestra a partir de este número de recibos resueltos

function profileUrl(username) {
  return `${PUBLIC_BASE}/p/${encodeURIComponent(username)}`;
}

// Todo se calcula SOLO con recibos sellados y vigentes (los reemplazados no cuentan).
function computeStats(rows) {
  const resolved = (rows || [])
    .filter((r) => r.status === 'hit' || r.status === 'miss')
    .sort((a, b) => {
      const ta = new Date(a.kickoff || a.resolved_at || a.sealed_at).getTime();
      const tb = new Date(b.kickoff || b.resolved_at || b.sealed_at).getTime();
      return tb - ta; // más reciente primero
    });

  const total = resolved.length;
  const hits = resolved.filter((r) => r.status === 'hit').length;
  const exact = resolved.filter((r) => r.exact).length;

  let currentStreak = 0;
  for (const r of resolved) {
    if (r.status === 'hit') currentStreak++;
    else break;
  }
  let bestStreak = 0;
  let run = 0;
  for (const r of [...resolved].reverse()) {
    if (r.status === 'hit') {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  return {
    resolved: total,
    hits,
    exact,
    accuracy: total >= MIN_RESOLVED ? Math.round((hits / total) * 100) : null,
    currentStreak,
    bestStreak,
    recent: resolved.slice(0, 10),
  };
}

const RECEIPT_FIELDS =
  'code, fixture_id, predicted_home, predicted_away, status, exact, final_home, final_away, kickoff, sealed_at, resolved_at, match_info';

async function fetchActiveReceipts(userId) {
  const { data } = await supabase
    .from('prediction_receipts')
    .select(RECEIPT_FIELDS)
    .eq('user_id', userId)
    .is('superseded_at', null)
    .limit(1000);
  return data || [];
}

// Datos completos para la página pública
async function buildPublicData(profile) {
  const receipts = await fetchActiveReceipts(profile.id);
  const stats = computeStats(receipts);

  const { data: caps } = await supabase
    .from('prediction_capsules')
    .select('code, body, resolves_on, status, resolution_note, sealed_at')
    .eq('user_id', profile.id)
    .eq('hidden', false)
    .order('sealed_at', { ascending: false })
    .limit(50);

  const capsules = caps || [];
  return {
    stats,
    sealedTotal: receipts.length,
    capsules: {
      open: capsules.filter((c) => c.status === 'sealed').length,
      hit: capsules.filter((c) => c.status === 'hit').length,
      miss: capsules.filter((c) => c.status === 'miss').length,
      list: capsules.slice(0, 10),
    },
  };
}

// Datos ligeros para la pantalla de ajustes de la app
async function getSettings(userId) {
  const { data: p } = await supabase
    .from('profiles')
    .select('username, is_pro, public_profile')
    .eq('id', userId)
    .maybeSingle();

  const receipts = await fetchActiveReceipts(userId);
  const stats = computeStats(receipts);

  return {
    enabled: !!p?.public_profile,
    isPro: !!p?.is_pro,
    username: p?.username || null,
    url: p?.username ? profileUrl(p.username) : null,
    resolved: stats.resolved,
    accuracy: stats.accuracy,
    minResolved: MIN_RESOLVED,
    sealedTotal: receipts.length,
  };
}

module.exports = { computeStats, buildPublicData, getSettings, profileUrl, MIN_RESOLVED };