import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Tiny .env loader (project root), so no extra packages or Node flags are needed.
try {
  for (const line of fs.readFileSync(path.join(import.meta.dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* no .env file: fine */ }

const prod = process.env.NODE_ENV === 'production';
let secret = process.env.JWT_SECRET || '';
if (!secret) {
  if (prod) throw new Error('JWT_SECRET must be set in production (use a long random string).');
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set: using a temporary one (logins reset on restart).');
}

export const config = {
  prod,
  port: Number(process.env.PORT || 8080),
  secret,
  dataDir: path.resolve(process.env.DATA_DIR || path.join(import.meta.dirname, '..', 'storage')),
  dbFile: process.env.DB_FILE || 'agrismart.db',
  clientDist: path.resolve(process.env.CLIENT_DIST || path.join(import.meta.dirname, '..', '..', 'client', 'dist')),
  maxImageBytes: 8 * 1024 * 1024,
  // Photo disease check uses the Anthropic API when a key is set; otherwise it is reported as not configured.
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
};
config.diseaseProvider = config.anthropicKey ? 'claude' : 'none';
