import crypto from 'node:crypto';
import { config } from './config.js';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [s, h] = String(stored).split(':');
  if (!s || !h) return false;
  const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const b64 = (x) => Buffer.from(x).toString('base64url');
const mac = (x) => crypto.createHmac('sha256', config.secret).update(x).digest('base64url');

export function signToken(uid, days = 7) {
  const body = b64(JSON.stringify({ uid, exp: Date.now() + days * 864e5 }));
  return `${body}.${mac(body)}`;
}
export function verifyToken(t) {
  const [body, sig] = String(t || '').split('.');
  if (!body || !sig) return null;
  const good = mac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p.uid : null;
  } catch { return null; }
}
