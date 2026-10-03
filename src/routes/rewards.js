const express = require('express');
const supabase = require('../services/supabaseClient');
const { getRankForXp } = require('../services/rankEngine');
const {
  SEASON_LEVELS, XP_PER_LEVEL, MISSIONS, PASS, dayRange, weekRange, levelForXp,
} = require('../services/rewardsConfig');

const router = express.Router();

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

async function grantReward(userId, reward, source) {
  if (reward.type === 'coins') {
    await grantXpAndCoins(userId, { coins: reward.amount });
  } else {
    await supabase
      .from('user_rewards')
      .upsert({ user_id: userId, reward_key: `${reward.type}:${reward.id}`, source }, { onConflict: 'user_id,reward_key', ignoreDuplicates: true });
  }
}

// ---------- GET: todo el estado de The Vault en una llamada ----------
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const now = new Date();
    const day = dayRange(now);
    const week = weekRange(now);
    const allMissions = [...MISSIONS.daily, ...MISSIONS.weekly];

    const [season, profileRes, ownedRes, missionClaimsRes, waitlistRes, progressList] = await Promise.all([
      getActiveSeason(),
      supabase.from('profiles').select('xp, coins, is_pro, active_title, active_banner, active_frame').eq('id', userId).single(),
      supabase.from('user_rewards').select('reward_key').eq('user_id', userId),
      supabase.from('mission_claims').select('mission_id, period_key').eq('user_id', userId).in('period_key', [day.key, week.key]),
      supabase.from('pro_waitlist').select('user_id').eq('user_id', userId).maybeSingle(),
      Promise.all(allMissions.map((m) => PROGRESS[m.id](userId, day, week))),
    ]);

    const profile = profileRes.data;
    if (!profile) return res.status(404).json({ error: 'profile_not_found' });

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

    try {
      await grantReward(userId, reward, `pass:${season.id}:${track}:${level}`);
    } catch (grantErr) {
      await supabase.from('pass_claims').delete().eq('user_id', userId).eq('season_id', season.id).eq('level', level).eq('track', track);
      throw grantErr;
    }
    res.json({ success: true, reward });
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

