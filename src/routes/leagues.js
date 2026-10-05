const express = require('express');
const crypto = require('crypto');
const supabase = require('../services/supabaseClient');
const { requireSelf } = require('../middleware/auth');
const { isNotAllowed } = require('../services/nameFilter');

const router = express.Router();
router.use(express.json());
router.param('userId', requireSelf); // solo el propio jugador puede usar estas rutas

const MAX_LEAGUES_PER_USER = 10;
const MAX_MEMBERS = 30;
const NAME_PATTERN = /^[\p{L}\p{N} ._\-!]{3,24}$/u;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0, O, 1, I para evitar confusiones

function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

async function getActiveSeason() {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('seasons').select('*').lte('starts_at', nowIso).gt('ends_at', nowIso)
    .order('starts_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

// La clasificación de cada liga se hace con el XP de la temporada actual (si no hay temporada, XP total).
async function loadStandings(leagueIds, season) {
  const result = {};
  leagueIds.forEach((id) => { result[id] = []; });
  if (!leagueIds.length) return result;

  const { data: members } = await supabase
    .from('league_members').select('league_id, user_id, joined_at').in('league_id', leagueIds);
  const userIds = [...new Set((members || []).map((m) => m.user_id))];
  if (!userIds.length) return result;

  const [profilesRes, progressRes] = await Promise.all([
    supabase.from('profiles').select('id, username, rank, xp, active_title').in('id', userIds),
    season
      ? supabase.from('season_progress').select('user_id, pass_xp').eq('season_id', season.id).in('user_id', userIds)
      : Promise.resolve({ data: [] }),
  ]);
  const profileById = {};
  (profilesRes.data || []).forEach((p) => { profileById[p.id] = p; });
  const passXpById = {};
  (progressRes.data || []).forEach((p) => { passXpById[p.user_id] = p.pass_xp; });

  (members || []).forEach((m) => {
    const p = profileById[m.user_id];
    if (!p) return;
    result[m.league_id].push({
      id: m.user_id,
      username: p.username,
      rank: p.rank,
      title: p.active_title,
      score: season ? (passXpById[m.user_id] || 0) : (p.xp || 0),
      joinedAt: m.joined_at,
    });
  });
  Object.values(result).forEach((list) =>
    list.sort((a, b) => b.score - a.score || String(a.joinedAt).localeCompare(String(b.joinedAt))));
  return result;
}

async function countMemberships(userId) {
  const { count } = await supabase
    .from('league_members').select('league_id', { count: 'exact', head: true }).eq('user_id', userId);
  return count || 0;
}

// ---------- GET: mis ligas ----------
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: mine } = await supabase.from('league_members').select('league_id').eq('user_id', userId);
    const ids = (mine || []).map((m) => m.league_id);
    if (!ids.length) return res.json({ leagues: [] });

    const [{ data: leagues }, season] = await Promise.all([
      supabase.from('leagues').select('id, name, code, owner_id').in('id', ids),
      getActiveSeason(),
    ]);
    const standings = await loadStandings(ids, season);

    res.json({
      leagues: (leagues || []).map((l) => {
        const list = standings[l.id] || [];
        return {
          id: l.id,
          name: l.name,
          code: l.code,
          memberCount: list.length,
          position: list.findIndex((m) => m.id === userId) + 1,
          isOwner: l.owner_id === userId,
        };
      }).sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (e) {
    console.error('[leagues]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- GET: detalle de una liga ----------
router.get('/:userId/:leagueId', async (req, res) => {
  try {
    const { userId, leagueId } = req.params;
    const { data: membership } = await supabase
      .from('league_members').select('user_id').eq('league_id', leagueId).eq('user_id', userId).maybeSingle();
    if (!membership) return res.status(403).json({ error: 'not_member' });

    const [{ data: league }, season] = await Promise.all([
      supabase.from('leagues').select('id, name, code, owner_id').eq('id', leagueId).single(),
      getActiveSeason(),
    ]);
    if (!league) return res.status(404).json({ error: 'not_found' });
    const standings = (await loadStandings([leagueId], season))[leagueId];

    res.json({
      league: { id: league.id, name: league.name, code: league.code, isOwner: league.owner_id === userId, memberCount: standings.length },
      metric: season ? 'season' : 'total',
      seasonName: season?.name || null,
      standings: standings.map((m, i) => ({
        position: i + 1, id: m.id, username: m.username, rank: m.rank, title: m.title, score: m.score, isMe: m.id === userId,
      })),
    });
  } catch (e) {
    console.error('[leagues]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: crear liga ----------
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const name = String((req.body || {}).name ?? '').trim().replace(/\s+/g, ' ');
    if (!NAME_PATTERN.test(name)) return res.status(400).json({ error: 'invalid_name' });
    if (isNotAllowed(name)) return res.status(400).json({ error: 'not_allowed' });
    if ((await countMemberships(userId)) >= MAX_LEAGUES_PER_USER) return res.status(400).json({ error: 'too_many_leagues' });

    const id = crypto.randomUUID();
    let code = null;
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = generateCode();
      const { error } = await supabase.from('leagues').insert({ id, name, code: candidate, owner_id: userId });
      if (!error) code = candidate;
      else if (error.code !== '23505') throw new Error(error.message);
    }
    if (!code) return res.status(500).json({ error: 'code_generation_failed' });

    const { error: memberErr } = await supabase.from('league_members').insert({ league_id: id, user_id: userId });
    if (memberErr) {
      await supabase.from('leagues').delete().eq('id', id);
      throw new Error(memberErr.message);
    }
    res.json({ success: true, league: { id, name, code } });
  } catch (e) {
    console.error('[leagues]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: unirse con código ----------
router.post('/:userId/join', async (req, res) => {
  try {
    const { userId } = req.params;
    const code = String((req.body || {}).code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return res.status(404).json({ error: 'not_found' });

    const { data: league } = await supabase.from('leagues').select('id, name, code').eq('code', code).maybeSingle();
    if (!league) return res.status(404).json({ error: 'not_found' });

    const { count } = await supabase
      .from('league_members').select('user_id', { count: 'exact', head: true }).eq('league_id', league.id);
    if ((count || 0) >= MAX_MEMBERS) return res.status(400).json({ error: 'league_full' });
    if ((await countMemberships(userId)) >= MAX_LEAGUES_PER_USER) return res.status(400).json({ error: 'too_many_leagues' });

    const { error } = await supabase.from('league_members').insert({ league_id: league.id, user_id: userId });
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'already_member', league });
      throw new Error(error.message);
    }
    res.json({ success: true, league });
  } catch (e) {
    console.error('[leagues]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST: salir de una liga ----------
router.post('/:userId/:leagueId/leave', async (req, res) => {
  try {
    const { userId, leagueId } = req.params;
    const { error } = await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', userId);
    if (error) throw new Error(error.message);

    const { data: rest } = await supabase
      .from('league_members').select('user_id, joined_at').eq('league_id', leagueId).order('joined_at', { ascending: true });
    if (!rest || rest.length === 0) {
      await supabase.from('leagues').delete().eq('id', leagueId); // liga vacía: se borra
    } else {
      const { data: league } = await supabase.from('leagues').select('owner_id').eq('id', leagueId).single();
      if (league && league.owner_id === userId) {
        const next = [...rest].sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)))[0];
        await supabase.from('leagues').update({ owner_id: next.user_id }).eq('id', leagueId); // el miembro más antiguo hereda la liga
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[leagues]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- DELETE: borrar una liga (solo quien la administra) ----------
router.delete('/:userId/:leagueId', async (req, res) => {
  try {
    const { userId, leagueId } = req.params;
    const { data: league } = await supabase.from('leagues').select('owner_id').eq('id', leagueId).single();
    if (!league) return res.status(404).json({ error: 'not_found' });
    if (league.owner_id !== userId) return res.status(403).json({ error: 'not_owner' });
    await supabase.from('leagues').delete().eq('id', leagueId);
    res.json({ success: true });
  } catch (e) {
    console.error('[leagues]', req.method, req.path, e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
