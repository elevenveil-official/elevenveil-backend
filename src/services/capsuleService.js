const crypto = require('crypto');
const supabase = require('./supabaseClient');

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://elevenveil-backend.onrender.com';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FREE_MAX_OPEN = 3;
const PRO_MAX_OPEN = 10;
const MAX_DAYS_AHEAD = 400;

function newCode() {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function capsuleUrl(code) {
  return `${PUBLIC_BASE}/c/${code}`;
}

// Huella SHA-256 de lo que se sella. La página pública la recalcula para demostrar que nada cambió.
function capsuleHash(c) {
  const canonical = JSON.stringify(['v1c', c.code, c.user_id, c.body, c.resolves_on, new Date(c.sealed_at).toISOString()]);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function fail(status, message, extra) {
  const e = new Error(message);
  e.status = status;
  e.extra = extra || null;
  return e;
}

async function getLimits(userId) {
  const { data: profile } = await supabase.from('profiles').select('is_pro').eq('id', userId).maybeSingle();
  const isPro = !!profile?.is_pro;
  const { count } = await supabase
    .from('prediction_capsules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sealed');
  return { isPro, maxOpen: isPro ? PRO_MAX_OPEN : FREE_MAX_OPEN, openCount: count || 0 };
}

async function createCapsule({ userId, body, resolvesOn }) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 140) throw fail(400, 'invalid_text');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(resolvesOn || ''))) throw fail(400, 'invalid_date');
  const target = new Date(`${resolvesOn}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) throw fail(400, 'invalid_date');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days < 1 || days > MAX_DAYS_AHEAD) throw fail(400, 'invalid_date');

  const limits = await getLimits(userId);
  if (limits.openCount >= limits.maxOpen) {
    throw fail(403, 'limit', { isPro: limits.isPro, maxOpen: limits.maxOpen, openCount: limits.openCount });
  }

  const sealedAt = new Date().toISOString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = {
      code: newCode(),
      user_id: userId,
      body: text,
      resolves_on: resolvesOn,
      sealed_at: sealedAt,
    };
    row.hash = capsuleHash(row);
    const { data, error } = await supabase.from('prediction_capsules').insert(row).select().single();
    if (error) {
      if (error.code === '23505') continue; // código repetido (rarísimo)
      throw fail(500, error.message);
    }
    return { ...data, url: capsuleUrl(data.code) };
  }
  throw fail(500, 'Could not generate a unique capsule code');
}

module.exports = { createCapsule, getLimits, capsuleHash, capsuleUrl };