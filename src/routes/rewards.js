const express = require('express');
const supabase = require('../services/supabaseClient');
const { requireSelf } = require('../middleware/auth');
const { getRankForXp } = require('../services/rankEngine');
const crypto = require('crypto');
const {
  SEASON_LEVELS, XP_PER_LEVEL, MISSIONS, PASS, dayRange, weekRange, levelForXp,
  MAX_SHIELDS, SHIELD_CAP_COINS, CHEST_ODDS, CHEST_CONSOLATION_COINS, CHEST_POOL, PRO_DAILY_CHEST_ODDS,
} = require('../services/rewardsConfig');

const router = express.Router();
router.use(express.json()); // lee el cuerpo JSON aunque index.js lo registre después
router.param('userId', requireSelf); // solo el propio jugador puede usar estas rutas

// ---------- Utilidades ----------
async function getActiveSeason() {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('seasons')
    .select('*')
    .lte('starts_at', nowIso)
    .gt('ends_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

async function countRows(table, userId, timeColumn, range, extra) {
  let q = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte(timeColumn, range.start.toISOString())
    .lt(timeColumn, range.end.toISOString());
  if (extra) q = extra(q);
  const { count } = await q;
  return count || 0;
}

// El progreso se calcula al vuelo a partir de las tablas que ya existen.
const PROGRESS = {
  daily_checkin: async () => 1,
  daily_predict: (u, day) => countRows('match_predictions', u, 'submitted_at', day),
  daily_live: (u, day) => countRows('live_predictions', u, 'submitted_at', day),
  weekly_predict_5: (u, _day, week) => countRows('match_predictions', u, 'submitted_at', week),
  weekly_correct_3: (u, _day, week) =>
    countRows('match_predictions', u, 'scored_at', week, (q) => q.eq('correct_result', true)),
  weekly_scorer_1: (u, _day, week) =>
    countRows('match_predictions', u, 'scored_at', week, (q) => q.eq('correct_scorer', true)),
};

function findMission(missionId) {
  for (const type of ['daily', 'weekly']) {
    const mission = MISSIONS[type].find((m) => m.id === missionId);
    if (mission) return { type, mission };
  }
  return null;
}

async function grantXpAndCoins(userId, { xp = 0, coins = 0 }) {
  const { data: p } = await supabase.from('profiles').select('xp, coins').eq('id', userId).single();
  const update = {};
  if (xp) {
    const newXp = (p?.xp || 0) + xp;
    update.xp = newXp;
    update.rank = getRankForXp(newXp);
  }
  if (coins) update.coins = (p?.coins ?? 1000) + coins;
  if (Object.keys(update).length) {
    const { error } = await supabase.from('profiles').update(update).eq('id', userId);
    if (error) throw new Error(`profile_update_failed: ${error.message}`);
  }
}

async function addChest(userId, tier, source) {
  const { error } = await supabase.from('user_chests').insert({ user_id: userId, tier, source });
  if (error) throw new Error(`chest_failed: ${error.message}`);
}

// Devuelve el premio realmente entregado (un escudo se convierte en monedas si ya tienes el máximo)
async function grantShield(userId, amount) {
  const { data: p } = await supabase.from('profiles').select('streak_shields').eq('id', userId).single();
  const current = p?.streak_shields || 0;
  if (current >= MAX_SHIELDS) {
    await grantXpAndCoins(userId, { coins: SHIELD_CAP_COINS });
    return { type: 'coins', amount: SHIELD_CAP_COINS, converted: true };
  }
  const next = Math.min(MAX_SHIELDS, current + amount);
  const { error } = await supabase.from('profiles').update({ streak_shields: next }).eq('id', userId);
  if (error) throw new Error(`shield_failed: ${error.message}`);
  return { type: 'shield', amount: next - current };
}

async function grantReward(userId, reward, source) {
  if (reward.type === 'coins') {
    await grantXpAndCoins(userId, { coins: reward.amount });
    return reward;
  }
  if (reward.type === 'chest') {
    await addChest(userId, reward.tier, source);
    return reward;
  }
  if (reward.type === 'shield') {
    return grantShield(userId, reward.amount);
  }
  await supabase
    .from('user_rewards')
    .upsert({ user_id: userId, reward_key: `${reward.type}:${reward.id}`, source }, { onConflict: 'user_id,reward_key', ignoreDuplicates: true });
  return reward;
}

// ---------- GET: todo el estado de The Vault en una llamada ----------
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const now = new Date();
    const day = dayRange(now);
    const week = weekRange(now);
    const allMissions = [...MISSIONS.daily, ...MISSIONS.weekly];

    const [season, profileRes, ownedRes, missionClaimsRes, waitlistRes, chestsRes, proClaimsRes, progressList] = await Promise.all([
      getActiveSeason(),
      supabase.from('profiles').select('xp, coins, is_pro, active_title, active_banner, active_frame, streak_shields').eq('id', userId).single(),
      supabase.from('user_rewards').select('reward_key').eq('user_id', userId),
      supabase.from('mission_claims').select('mission_id, period_key').eq('user_id', userId).in('period_key', [day.key, week.key]),
      supabase.from('pro_waitlist').select('user_id').eq('user_id', userId).maybeSingle(),
      supabase.from('user_chests').select('id, tier, created_at').eq('user_id', userId).is('opened_at', null).order('created_at', { ascending: true }),
      supabase.from('pro_claims').select('kind, period_key').eq('user_id', userId).in('period_key', [day.key, week.key]),
      Promise.all(allMissions.map((m) => PROGRESS[m.id](userId, day, week))),
    ]);

    const profile = profileRes.data;
    if (!profile) return res.status(404).json({ error: 'profile_not_found' });

    const proClaimed = new Set((proClaimsRes.data || []).map((c) => `${c.kind}:${c.period_key}`));
    const isProUser = !!profile.is_pro;
    const claimedMissions = new Set((missionClaimsRes.data || []).map((c) => c.mission_id));
    const progressById = {};
    allMissions.forEach((m, i) => { progressById[m.id] = progressList[i]; });

    const serializeMission = (m) => {
      const progress = Math.min(progressById[m.id], m.target);
      return { id: m.id, target: m.target, progress, completed: progress >= m.target, claimed: claimedMissions.has(m.id), reward: m.reward };
    };

    let seasonInfo = null;
    let pass = [];
    if (season) {
      const [progRes, passClaimsRes] = await Promise.all([
        supabase.from('season_progress').select('pass_xp').eq('user_id', userId).eq('season_id', season.id).maybeSingle(),
        supabase.from('pass_claims').select('level, track').eq('user_id', userId).eq('season_id', season.id),
      ]);
      const passXp = progRes.data?.pass_xp || 0;
      const level = levelForXp(passXp);
      const claimedPass = new Set((passClaimsRes.data || []).map((c) => `${c.level}:${c.track}`));

      seasonInfo = {
        id: season.id,
        name: season.name,
        endsAt: season.ends_at,
        levels: SEASON_LEVELS,
        xpPerLevel: XP_PER_LEVEL,
        passXp,
        level,
        xpIntoLevel: level >= SEASON_LEVELS ? XP_PER_LEVEL : passXp - level * XP_PER_LEVEL,
      };
      pass = PASS.map((row) => ({
        level: row.level,
        reached: row.level <= level,
        free: { reward: row.free, claimed: claimedPass.has(`${row.level}:free`) },
        pro: row.pro ? { reward: row.pro, claimed: claimedPass.has(`${row.level}:pro`) } : null,
      }));
    }

    res.json({
      season: seasonInfo,
      pass,
      missions: {
        daily: MISSIONS.daily.map(serializeMission),
        weekly: MISSIONS.weekly.map(serializeMission),
        dailyResetsAt: day.end.toISOString(),
        weeklyResetsAt: week.end.toISOString(),
      },
      owned: (ownedRes.data || []).map((r) => r.reward_key),
      active: { title: profile.active_title, banner: profile.active_banner, frame: profile.active_frame },
      isPro: !!profile.is_pro,
      waitlisted: !!waitlistRes.data,
      chests: (chestsRes.data || []).map((c) => ({ id: c.id, tier: c.tier })),
      shields: profile.streak_shields || 0,
      maxShields: MAX_SHIELDS,
      pro: {
        daily: { available: isProUser && !proClaimed.has(`daily_chest:${day.key}`), resetsAt: day.end.toISOString() },
        weeklyShield: {
          available: isProUser && !proClaimed.has(`weekly_shield:${week.key}`) && (profile.streak_shields || 0) < MAX_SHIELDS,
          claimed: proClaimed.has(`weekly_shield:${week.key}`),
          resetsAt: week.end.toISOString(),
        },
      },
      coins: profile.coins,
      xp: profile.xp,
    });
  } catch (e) {
    console.error('[rewards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: cobrar una misión ----------
router.post('/:userId/missions/claim', async (req, res) => {
  try {
    const { userId } = req.params;
    const { missionId } = req.body || {};
    const found = findMission(missionId);
    if (!found) return res.status(400).json({ error: 'unknown_mission' });

    const now = new Date();
    const day = dayRange(now);
    const week = weekRange(now);
    const period = found.type === 'daily' ? day : week;

    const progress = await PROGRESS[missionId](userId, day, week);
    if (progress < found.mission.target) return res.status(400).json({ error: 'not_completed' });

    const { error: claimErr } = await supabase
      .from('mission_claims')
      .insert({ user_id: userId, mission_id: missionId, period_key: period.key });
    if (claimErr) {
      if (claimErr.code !== '23505') console.error('[rewards] claim insert failed', claimErr);
      return res.status(claimErr.code === '23505' ? 409 : 500).json({ error: claimErr.code === '23505' ? 'already_claimed' : claimErr.message });
    }

    try {
      await grantXpAndCoins(userId, found.mission.reward);
      if (found.mission.reward.chest) await addChest(userId, found.mission.reward.chest, `mission:${missionId}`);
    } catch (grantErr) {
      // Si no se pudo dar el premio, se deshace el cobro para que pueda reintentarse
      await supabase.from('mission_claims').delete().eq('user_id', userId).eq('mission_id', missionId).eq('period_key', period.key);
      throw grantErr;
    }
    res.json({ success: true, reward: found.mission.reward });
  } catch (e) {
    console.error('[rewards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: cobrar un premio del pase ----------
router.post('/:userId/pass/claim', async (req, res) => {
  try {
    const { userId } = req.params;
    const body = req.body || {};
    const level = parseInt(body.level, 10);
    const { track } = body;
    if (!(level >= 1 && level <= SEASON_LEVELS) || !['free', 'pro'].includes(track)) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const season = await getActiveSeason();
    if (!season) return res.status(400).json({ error: 'no_active_season' });

    const [{ data: prog }, { data: profile }] = await Promise.all([
      supabase.from('season_progress').select('pass_xp').eq('user_id', userId).eq('season_id', season.id).maybeSingle(),
      supabase.from('profiles').select('is_pro').eq('id', userId).single(),
    ]);
    if (level > levelForXp(prog?.pass_xp || 0)) return res.status(400).json({ error: 'level_locked' });

    const reward = PASS[level - 1][track];
    if (!reward) return res.status(400).json({ error: 'no_reward' });
    if (track === 'pro' && !profile?.is_pro) return res.status(403).json({ error: 'pro_required' });

    const { error: claimErr } = await supabase
      .from('pass_claims')
      .insert({ user_id: userId, season_id: season.id, level, track });
    if (claimErr) {
      if (claimErr.code !== '23505') console.error('[rewards] claim insert failed', claimErr);
      return res.status(claimErr.code === '23505' ? 409 : 500).json({ error: claimErr.code === '23505' ? 'already_claimed' : claimErr.message });
    }

    let delivered = reward;
    try {
      delivered = await grantReward(userId, reward, `pass:${season.id}:${track}:${level}`);
    } catch (grantErr) {
      await supabase.from('pass_claims').delete().eq('user_id', userId).eq('season_id', season.id).eq('level', level).eq('track', track);
      throw grantErr;
    }
    res.json({ success: true, reward: delivered });
  } catch (e) {
    console.error('[rewards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: abrir un cofre ----------
function pickWeighted(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = crypto.randomInt(total);
  for (const e of entries) {
    if (roll < e.weight) return e.value;
    roll -= e.weight;
  }
  return entries[entries.length - 1].value;
}

router.post('/:userId/chests/:chestId/open', async (req, res) => {
  const { userId, chestId } = req.params;
  let opened = false;
  try {
    // Se marca como abierto en una sola operación: dos toques seguidos no pueden abrirlo dos veces
    const { data: marked } = await supabase
      .from('user_chests')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', chestId)
      .eq('user_id', userId)
      .is('opened_at', null)
      .select('id, tier');
    if (!marked || marked.length === 0) return res.status(404).json({ error: 'no_chest' });
    opened = true;
    const tier = marked[0].tier;

    const { data: ownedRows } = await supabase.from('user_rewards').select('reward_key').eq('user_id', userId);
    const owned = new Set((ownedRows || []).map((r) => r.reward_key));
    const available = CHEST_POOL.filter((i) => !owned.has(`${i.type}:${i.id}`));

    let reward;
    if (available.length === 0) {
      reward = { type: 'coins', amount: CHEST_CONSOLATION_COINS[tier] || 100, rarity: 'common' };
      await grantXpAndCoins(userId, { coins: reward.amount });
    } else {
      const odds = CHEST_ODDS[tier] || CHEST_ODDS.bronze;
      const byRarity = {};
      available.forEach((i) => { (byRarity[i.rarity] = byRarity[i.rarity] || []).push(i); });
      // solo cuentan las rarezas de las que aún te queda algo por conseguir
      let entries = Object.keys(byRarity).map((r) => ({ value: r, weight: odds[r] || 0 })).filter((e) => e.weight > 0);
      if (entries.length === 0) entries = Object.keys(byRarity).map((r) => ({ value: r, weight: 1 }));
      const rarity = pickWeighted(entries);
      const pool = byRarity[rarity];
      const item = pool[crypto.randomInt(pool.length)];
      reward = { type: item.type, id: item.id, rarity: item.rarity };
      const { error } = await supabase
        .from('user_rewards')
        .upsert({ user_id: userId, reward_key: `${item.type}:${item.id}`, source: `chest:${chestId}` }, { onConflict: 'user_id,reward_key', ignoreDuplicates: true });
      if (error) throw new Error(`reward_failed: ${error.message}`);
    }
    res.json({ success: true, tier, reward });
  } catch (e) {
    if (opened) {
      // si algo falló después de abrirlo, se deja el cofre otra vez cerrado para poder reintentar
      await supabase.from('user_chests').update({ opened_at: null }).eq('id', chestId).eq('user_id', userId);
    }
    console.error('[rewards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: cofre diario de PRO ----------
async function isProUser(userId) {
  const { data } = await supabase.from('profiles').select('is_pro').eq('id', userId).single();
  return !!data?.is_pro;
}

router.post('/:userId/pro/daily-chest', async (req, res) => {
  const { userId } = req.params;
  const day = dayRange(new Date());
  try {
    if (!(await isProUser(userId))) return res.status(403).json({ error: 'pro_required' });

    const { error: claimErr } = await supabase.from('pro_claims').insert({ user_id: userId, kind: 'daily_chest', period_key: day.key });
    if (claimErr) {
      return res.status(claimErr.code === '23505' ? 409 : 500).json({ error: claimErr.code === '23505' ? 'already_claimed' : claimErr.message });
    }
    const odds = Object.keys(PRO_DAILY_CHEST_ODDS).map((tier) => ({ value: tier, weight: PRO_DAILY_CHEST_ODDS[tier] }));
    const tier = pickWeighted(odds);
    try {
      await addChest(userId, tier, 'pro_daily');
    } catch (grantErr) {
      await supabase.from('pro_claims').delete().eq('user_id', userId).eq('kind', 'daily_chest').eq('period_key', day.key);
      throw grantErr;
    }
    res.json({ success: true, chest: { tier } });
  } catch (e) {
    console.error('[rewards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: escudo semanal de PRO ----------
router.post('/:userId/pro/weekly-shield', async (req, res) => {
  const { userId } = req.params;
  const week = weekRange(new Date());
  try {
    const { data: p } = await supabase.from('profiles').select('is_pro, streak_shields').eq('id', userId).single();
    if (!p?.is_pro) return res.status(403).json({ error: 'pro_required' });
    if ((p.streak_shields || 0) >= MAX_SHIELDS) return res.status(400).json({ error: 'shields_full' });

    const { error: claimErr } = await supabase.from('pro_claims').insert({ user_id: userId, kind: 'weekly_shield', period_key: week.key });
    if (claimErr) {
      return res.status(claimErr.code === '23505' ? 409 : 500).json({ error: claimErr.code === '23505' ? 'already_claimed' : claimErr.message });
    }
    try {
      await grantShield(userId, 1);
    } catch (grantErr) {
      await supabase.from('pro_claims').delete().eq('user_id', userId).eq('kind', 'weekly_shield').eq('period_key', week.key);
      throw grantErr;
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[rewards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- PUT: equipar un cosmético ganado ----------
const SLOT_COLUMN = { title: 'active_title', banner: 'active_banner', frame: 'active_frame' };

router.put('/:userId/equip', async (req, res) => {
  try {
    const { userId } = req.params;
    const { slot, id } = req.body || {};
    if (!SLOT_COLUMN[slot]) return res.status(400).json({ error: 'bad_slot' });
    if (id) {
      const { data } = await supabase
        .from('user_rewards')
        .select('reward_key')
        .eq('user_id', userId)
        .eq('reward_key', `${slot}:${id}`)
        .maybeSingle();
      if (!data) return res.status(403).json({ error: 'not_owned' });
    }
    const { error } = await supabase.from('profiles').update({ [SLOT_COLUMN[slot]]: id || null }).eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, slot, id: id || null });
  } catch (e) {
    console.error('[rewards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: apuntarse a la lista de espera de PRO ----------
router.post('/:userId/waitlist', async (req, res) => {
  const { userId } = req.params;
  try {
    const { error } = await supabase.from('pro_waitlist').insert({ user_id: userId });
    if (error && error.code !== '23505') return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[rewards]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;


