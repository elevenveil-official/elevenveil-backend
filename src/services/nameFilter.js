// Filtro compartido para nombres de jugador y de ligas.

const RESERVED = [
    'admin', 'administrator', 'moderator', 'mod', 'support', 'staff', 'official', 'system',
    'elevenveil', 'eleven_veil', 'theveil', 'the_veil', 'veil', 'anonymous', 'null', 'undefined', 'root',
  ];
  
  // Palabras ofensivas habituales (se puede ampliar).
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
    return name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[013457]/g, (c) => map[c])
      .replace(/[\s_.\-!]/g, '');
  }
  
  function isNotAllowed(name) {
    const lower = name.toLowerCase();
    if (RESERVED.includes(lower) || RESERVED.includes(lower.replace(/[\s_]/g, ''))) return true;
    const n = normalize(name);
    if (BLOCKED_ANYWHERE.some((w) => n.includes(w))) return true;
    return BLOCKED_EDGES.some((w) => n === w || n.startsWith(w) || n.endsWith(w));
  }
  
  module.exports = { isNotAllowed };
  