const express = require('express');
const supabase = require('../services/supabaseClient');

const router = express.Router();
router.use(express.json());

const PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const COOLDOWN_DAYS = 30;

// Nombres que nadie puede usar para hacerse pasar por el equipo o la app
const RESERVED = [
  'admin', 'administrator', 'moderator', 'mod', 'support', 'staff', 'official', 'system',
  'elevenveil', 'eleven_veil', 'theveil', 'the_veil', 'veil', 'anonymous', 'null', 'undefined', 'root',
];

// Palabras ofensivas habituales (se puede ampliar). Se comparan sin números parecidos a letras ni guiones bajos.
const BLOCKED_ANYWHERE = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'nazi', 'hitler',
  'mierda', 'cabron', 'gilipollas', 'pendejo', 'maricon', 'follar',
  'merde', 'salope', 'connard', 'putain', 'encule',
  'scheisse', 'fotze', 'wichser',
  'cazzo', 'merda', 'stronzo', 'vaffanculo',
];
// Palabras cortas: solo se bloquean si el nombre empieza o termina así (evita falsos positivos como "reputation")
const BLOCKED_EDGES = ['puta', 'puto', 'zorra', 'arsch', 'hure', 'troia', 'negro'];

function normalize(name) {
  const map = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };
  return name.toLowerCase().replace(/[013457]/g, (c) => map[c]).replace(/_/g, '');
}

function isNotAllowed(name) {
  const lower = name.toLowerCase();
  if (RESERVED.includes(lower) || RESERVED.includes(lower.replace(/_/g, ''))) return true;
  const n = normalize(name);
  if (BLOCKED_ANYWHERE.some((w) => n.includes(w))) return true;
  return BLOCKED_EDGES.some((w) => n === w || n.startsWith(w) || n.endsWith(w));
}

router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const raw = String((req.body || {}).username ?? '').trim();

    if (!PATTERN.test(raw)) return res.status(400).json({ error: 'invalid' });
    if (isNotAllowed(raw)) return res.status(400).json({ error: 'not_allowed' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('username_changed_at')
      .eq('id', userId)
      .single();
    if (!profile) return res.status(404).json({ error: 'profile_not_found' });

    if (profile.username_changed_at) {
      const days = (Date.now() - new Date(profile.username_changed_at).getTime()) / 86400000;
      if (days < COOLDOWN_DAYS) {
        return res.status(429).json({ error: 'too_soon', retryAfterDays: Math.ceil(COOLDOWN_DAYS - days) });
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ username: raw, username_changed_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'taken' });
      console.error('[username]', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true, username: raw });
  } catch (e) {
    console.error('[username]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
