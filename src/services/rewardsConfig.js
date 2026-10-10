// Configuración central de misiones y pase de temporada.
// Para ajustar dificultad o premios, solo hay que tocar este archivo.

const SEASON_LEVELS = 30;
const XP_PER_LEVEL = 200;

const MISSIONS = {
  daily: [
    { id: 'daily_checkin', target: 1, reward: { xp: 10, coins: 50 } },
    { id: 'daily_predict', target: 1, reward: { xp: 25, coins: 75 } },
    { id: 'daily_live', target: 1, reward: { xp: 25, coins: 75 } },
  ],
  weekly: [
    { id: 'weekly_predict_5', target: 5, reward: { xp: 100, coins: 200 } },
    { id: 'weekly_correct_3', target: 3, reward: { xp: 150, coins: 250, chest: 'bronze' } },
    { id: 'weekly_scorer_1', target: 1, reward: { xp: 200, coins: 300, chest: 'silver' } },
  ],
};

const FREE_EXTRAS = {
  4: { type: 'chest', tier: 'bronze' },
  7: { type: 'shield', amount: 1 },
  11: { type: 'chest', tier: 'bronze' },
  15: { type: 'chest', tier: 'silver' },
  17: { type: 'shield', amount: 1 },
  22: { type: 'chest', tier: 'silver' },
  26: { type: 'chest', tier: 'bronze' },
  28: { type: 'chest', tier: 'silver' },
};

const FREE_COSMETICS = {
  3: { type: 'title', id: 'fresh_boots' },
  5: { type: 'banner', id: 'kickoff' },
  8: { type: 'title', id: 'sharp_eye' },
  10: { type: 'banner', id: 'floodlights' },
  13: { type: 'title', id: 'matchday_mind' },
  18: { type: 'banner', id: 'golden_hour' },
  20: { type: 'frame', id: 's1_chalk' },
  23: { type: 'title', id: 'closer' },
  30: { type: 'title', id: 'season_one_veteran' },
};

// La pista PRO es 100% cosmética: nada que dé ventaja en clasificaciones.
const PRO_COSMETICS = {
  1: { type: 'title', id: 'veil_initiate' },
  3: { type: 'banner', id: 'veil_night' },
  5: { type: 'frame', id: 's1_gold' },
  8: { type: 'title', id: 'oracles_eye' },
  10: { type: 'banner', id: 'nebula' },
  12: { type: 'frame', id: 's1_aurora' },
  15: { type: 'title', id: 'untouchable' },
  18: { type: 'banner', id: 'eclipse' },
  21: { type: 'frame', id: 's1_ember' },
  24: { type: 'title', id: 'season_one_legend' },
  27: { type: 'banner', id: 'supernova' },
  30: { type: 'frame', id: 's1_legend' },
};

const PRO_EXTRAS = {
  2: { type: 'chest', tier: 'bronze' },
  4: { type: 'shield', amount: 1 },
  6: { type: 'chest', tier: 'bronze' },
  7: { type: 'chest', tier: 'silver' },
  9: { type: 'shield', amount: 1 },
  11: { type: 'chest', tier: 'bronze' },
  13: { type: 'chest', tier: 'silver' },
  14: { type: 'shield', amount: 1 },
  16: { type: 'chest', tier: 'bronze' },
  17: { type: 'chest', tier: 'silver' },
  19: { type: 'shield', amount: 1 },
  20: { type: 'chest', tier: 'bronze' },
  22: { type: 'chest', tier: 'silver' },
  23: { type: 'shield', amount: 1 },
  25: { type: 'chest', tier: 'gold' },
  26: { type: 'chest', tier: 'bronze' },
  28: { type: 'chest', tier: 'silver' },
  29: { type: 'chest', tier: 'gold' },
};

function buildPass() {
  const pass = [];
  for (let level = 1; level <= SEASON_LEVELS; level++) {
    pass.push({
      level,
      free: FREE_COSMETICS[level] || FREE_EXTRAS[level] || { type: 'coins', amount: 50 + level * 10 },
      pro: PRO_COSMETICS[level] || PRO_EXTRAS[level] || null,
    });
  }
  return pass;
}

const PASS = buildPass();

// ---------- Cofres ----------
const MAX_SHIELDS = 3;
const SHIELD_CAP_COINS = 150; // si ya tienes el máximo de escudos, el premio se convierte en monedas

// Probabilidad (en %) de cada rareza según el tipo de cofre
const CHEST_ODDS = {
  bronze: { common: 75, rare: 22, epic: 3, legendary: 0 },
  silver: { common: 45, rare: 40, epic: 13, legendary: 2 },
  gold: { common: 10, rare: 45, epic: 35, legendary: 10 },
};
// Probabilidad (en %) del tipo de cofre diario de PRO
const PRO_DAILY_CHEST_ODDS = { bronze: 80, silver: 17, gold: 3 };

// Si ya lo tienes todo, el cofre da monedas
const CHEST_CONSOLATION_COINS = { bronze: 100, silver: 250, gold: 600 };

// Cosméticos que SOLO salen de cofres (los del pase son exclusivos del pase)
const CHEST_POOL = [
  { type: 'title', id: 'rookie_dreamer', rarity: 'common' },
  { type: 'title', id: 'late_bloomer', rarity: 'common' },
  { type: 'banner', id: 'pitch_lines', rarity: 'common' },
  { type: 'banner', id: 'night_match', rarity: 'rare' },
  { type: 'title', id: 'hat_trick_hero', rarity: 'rare' },
  { type: 'frame', id: 'chest_mint', rarity: 'rare' },
  { type: 'title', id: 'crystal_ball', rarity: 'epic' },
  { type: 'banner', id: 'derby_day', rarity: 'epic' },
  { type: 'frame', id: 'chest_neon', rarity: 'epic' },
  { type: 'banner', id: 'golden_boot', rarity: 'legendary' },
  { type: 'frame', id: 'chest_prism', rarity: 'legendary' },
];

// ---------- Periodos (UTC) ----------
function dayRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, key: start.toISOString().slice(0, 10) };
}

function weekRange(now = new Date()) {
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - sinceMonday));
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end, key: start.toISOString().slice(0, 10) };
}

function levelForXp(passXp) {
  return Math.min(SEASON_LEVELS, Math.floor(passXp / XP_PER_LEVEL));
}

module.exports = {
  SEASON_LEVELS, XP_PER_LEVEL, MISSIONS, PASS, dayRange, weekRange, levelForXp,
  MAX_SHIELDS, SHIELD_CAP_COINS, CHEST_ODDS, CHEST_CONSOLATION_COINS, CHEST_POOL, PRO_DAILY_CHEST_ODDS,
};
