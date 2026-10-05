const express = require('express');
const supabase = require('../services/supabaseClient');

// Comprueba que quien hace la petición es de verdad el jugador al que dice representar.
// La app manda su "token de sesión" en la cabecera Authorization; aquí lo verificamos con Supabase.
//
// MODO DE PRUEBA: mientras la variable de entorno ENFORCE_AUTH no valga "true", NO se bloquea nada:
// solo se escribe un aviso en los Logs de Render. Así se puede comprobar que la app funciona antes de activarlo.

const cache = new Map(); // token -> { id, exp }
const TTL_MS = 60 * 1000;

const enforcing = () => process.env.ENFORCE_AUTH === 'true';

async function userFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.id;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    if (cache.size > 500) cache.clear();
    cache.set(token, { id: data.user.id, exp: Date.now() + TTL_MS });
    return data.user.id;
  } catch (e) {
    return null;
  }
}

function deny(req, res, next, status, code) {
  if (enforcing()) return res.status(status).json({ error: code });
  console.warn(`[auth] ${code} — NO bloqueado porque ENFORCE_AUTH no está activo: ${req.method} ${req.originalUrl.split('?')[0]}`);
  return next();
}

// Para usar con router.param('userId', requireSelf): protege toda ruta que lleve :userId en la dirección.
async function requireSelf(req, res, next, value) {
  const id = await userFromRequest(req);
  if (!id) return deny(req, res, next, 401, 'unauthorized');
  if (id !== value) return deny(req, res, next, 403, 'forbidden');
  next();
}

// Para peticiones que mandan "userId" dentro del cuerpo (por ejemplo al guardar una predicción).
const bodyGuard = [
  express.json(),
  async (req, res, next) => {
    const claimed = req.body && typeof req.body === 'object' ? req.body.userId : undefined;
    if (claimed === undefined || claimed === null) return next();
    const id = await userFromRequest(req);
    if (!id) return deny(req, res, next, 401, 'unauthorized');
    if (id !== claimed) return deny(req, res, next, 403, 'forbidden');
    next();
  },
];

module.exports = { requireSelf, bodyGuard };