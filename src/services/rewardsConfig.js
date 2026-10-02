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
    { id: 'weekly_correct_3', target: 3, reward: { xp: 150, coins: 250 } },
    { id: 'weekly_scorer_1', target: 1, reward: { xp: 200, coins: 300 } },
  ],
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

function buildPass() {
  const pass = [];
  for (let level = 1; level <= SEASON_LEVELS; level++) {
    pass.push({
      level,
      free: FREE_COSMETICS[level] || { type: 'coins', amount: 50 + level * 10 },
      pro: PRO_COSMETICS[level] || null,
    });
  }
  return pass;
}

const PASS = buildPass();

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

module.exports = { SEASON_LEVELS, XP_PER_LEVEL, MISSIONS, PASS, dayRange, weekRange, levelForXp };
