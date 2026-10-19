const crypto = require('crypto');
const supabase = require('./supabaseClient');
const { apiSportsFetch } = require('./apiSportsClient');

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://elevenveil-backend.onrender.com';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para que no se confundan
const FIXTURE_TTL_MS = 6 * 60 * 60 * 1000;
const fixtureCache = new Map();

function newCode() {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function receiptUrl(code) {
  return `${PUBLIC_BASE}/r/${code}`;
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Huella SHA-256 de lo que se sella. La página pública la recalcula para demostrar que nada cambió.
function receiptHash(r) {
  const parts = [
    'v1',
    r.code,
    r.user_id,
    r.fixture_id,
    r.predicted_home,
    r.predicted_away,
    r.scorer_id ?? '',
    r.mvp_id ?? '',
    r.starter_id ?? '',
    new Date(r.sealed_at).toISOString(),
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function matchInfoFrom(f) {
  return {
    homeName: f?.teams?.home?.name || null,
    awayName: f?.teams?.away?.name || null,
    homeLogo: f?.teams?.home?.logo || null,
    awayLogo: f?.teams?.away?.logo || null,
    leagueName: f?.league?.name || null,
  };
}

// Una sola llamada a la API por partido (en memoria 6 h). Si la API no responde, devuelve null.
async function getFixtureInfo(fixtureId) {
  const key = String(fixtureId);
  const hit = fixtureCache.get(key);
  if (hit && Date.now() - hit.at < FIXTURE_TTL_MS) return hit.info;
  try {
    const data = await apiSportsFetch(`/fixtures?id=${fixtureId}`);
    const f = data?.response?.[0];
    if (!f?.fixture?.date) return null;
    const info = { kickoff: f.fixture.date, status: f.fixture.status?.short || null, match: matchInfoFrom(f) };
    fixtureCache.set(key, { at: Date.now(), info });
    return info;
  } catch (e) {
    return null;
  }
}

function samePicks(row, p) {
  return (
    row.predicted_home === p.predictedHome &&
    row.predicted_away === p.predictedAway &&
    (row.scorer_id ?? null) === p.scorerId &&
    (row.mvp_id ?? null) === p.mvpId &&
    (row.starter_id ?? null) === p.starterId
  );
}

// Sella la predicción. Si el jugador ya tenía un recibo vigente para este partido:
//  - idéntico  → se devuelve el mismo (no se crea otro)
//  - distinto  → se crea uno nuevo y el anterior queda "reemplazado"
async function createReceipt({ userId, fixtureId, picks, fixtureInfo, clientKickoff }) {
  const fixture_id = Number(fixtureId);
  const p = {
    predictedHome: toIntOrNull(picks.predictedHome),
    predictedAway: toIntOrNull(picks.predictedAway),
    scorerId: toIntOrNull(picks.scorerId),
    mvpId: toIntOrNull(picks.mvpId),
    starterId: toIntOrNull(picks.starterId),
  };
  if (p.predictedHome === null || p.predictedAway === null) return null;

  const { data: activeRows, error: activeErr } = await supabase
    .from('prediction_receipts')
    .select('*')
    .eq('user_id', userId)
    .eq('fixture_id', fixture_id)
    .is('superseded_at', null)
    .order('sealed_at', { ascending: false })
    .limit(1);
  if (activeErr) throw new Error(activeErr.message);
  const active = activeRows?.[0] || null;

  if (active && samePicks(active, p)) return { ...active, url: receiptUrl(active.code), reused: true };

  const sealedAt = new Date().toISOString();
  const kickoff = fixtureInfo?.kickoff || clientKickoff || null;

  let inserted = null;
  for (let attempt = 0; attempt < 4 && !inserted; attempt++) {
    const row = {
      code: newCode(),
      user_id: userId,
      fixture_id,
      predicted_home: p.predictedHome,
      predicted_away: p.predictedAway,
      scorer_id: p.scorerId,
      scorer_name: picks.scorerName || null,
      mvp_id: p.mvpId,
      mvp_name: picks.mvpName || null,
      starter_id: p.starterId,
      starter_name: picks.starterName || null,
      sealed_at: sealedAt,
      kickoff: kickoff ? new Date(kickoff).toISOString() : null,
      kickoff_verified: !!fixtureInfo?.kickoff,
      match_info: fixtureInfo?.match || null,
    };
    row.hash = receiptHash(row);
    const { data, error } = await supabase.from('prediction_receipts').insert(row).select().single();
    if (error) {
      if (error.code === '23505') continue; // código repetido (rarísimo): se prueba con otro
      throw new Error(error.message);
    }
    inserted = data;
  }
  if (!inserted) throw new Error('Could not generate a unique receipt code');

  if (active) {
    await supabase
      .from('prediction_receipts')
      .update({ superseded_at: sealedAt, superseded_by: inserted.id })
      .eq('id', active.id);
  }

  return { ...inserted, url: receiptUrl(inserted.code), reused: false };
}

// Marca el recibo vigente como ✓ (acertó el resultado) o ✗ cuando el partido termina.
async function settleReceipt({ userId, fixtureId, scored, fixture }) {
  const { error } = await supabase
    .from('prediction_receipts')
    .update({
      status: scored.correctResult ? 'hit' : 'miss',
      exact: !!scored.correctScoreline,
      final_home: fixture?.goals?.home ?? null,
      final_away: fixture?.goals?.away ?? null,
      vision_score: scored.visionScore ?? null,
      resolved_at: new Date().toISOString(),
      match_info: matchInfoFrom(fixture),
    })
    .eq('user_id', userId)
    .eq('fixture_id', Number(fixtureId))
    .is('superseded_at', null)
    .eq('status', 'sealed');
  if (error) throw new Error(error.message);
}

module.exports = { createReceipt, settleReceipt, getFixtureInfo, receiptHash, receiptUrl };