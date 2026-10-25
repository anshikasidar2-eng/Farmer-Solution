import { config } from './config.js';
import { CROPS } from './advice.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const nz = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const asList = (v) => (Array.isArray(v) ? v.map(String) : []);

const SETUP_HELP = [
  'Set ANTHROPIC_API_KEY on the server (see README). Until then no photo result is shown.',
];

const ADVICE_FORMAT = '{"symptoms":[],"causes":[],"treatment":[],"prevention":[],"nutrients":"","care":"","expert":""}';

async function askClaude(content) {
  const r = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.anthropicModel, max_tokens: 1200, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new HttpError(502, `Claude API error (${r.status}).`);
  const text = (await r.json()).content?.map((b) => b.text || '').join('') || '';
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new HttpError(502, 'Claude returned an unreadable answer.');
  return JSON.parse(text.slice(a, b + 1));
}

const contextText = (ctx) =>
  `Context: saved crop ${ctx.cropName || 'unknown'}; location ${ctx.village}, ${ctx.district}, ${ctx.state}, India; season ${ctx.season}; ` +
  `temperature ${ctx.weather.temp ?? 'unknown'} C; humidity ${ctx.weather.humidity ?? 'unknown'}%; rain expected ${ctx.weather.rain ?? 'unknown'}. ` +
  'Use simple English, say "possible", prefer safe label-directed treatments, and never guess a disease.';

function shape(provider, o) {
  return {
    provider, clear: o.clear !== false, message: o.message || '', plant: o.plant || 'unknown', condition: o.condition || '',
    confidence: o.confidence || 'low', top: o.top || undefined, symptoms: asList(o.symptoms), causes: asList(o.causes),
    treatment: asList(o.treatment), prevention: asList(o.prevention), nutrients: o.nutrients || '', care: o.care || '',
    expert: o.expert || 'Consult an agricultural expert if symptoms spread quickly or treatment does not help.', warnings: o.warnings || [],
  };
}

async function viaClaude(buf, mime, ctx) {
  const prompt = `You help Indian farmers. Look at the attached plant photo. ${contextText(ctx)} If the image is blurry, not a plant, or you cannot tell, set clear=false and explain how to retake it. ` +
    `Reply ONLY JSON {"clear":true,"message":"","plant":"","condition":"possible disease, pest, deficiency or healthy","confidence":"low|medium|high",...} using the keys ${ADVICE_FORMAT} as well.`;
  const o = await askClaude([{ type: 'image', source: { type: 'base64', media_type: mime, data: buf.toString('base64') } }, { type: 'text', text: prompt }]);
  o.warnings = ['This result comes from a general AI model reading the photo, not a trained plant-disease classifier. Confirm serious problems with an expert.'];
  return shape('Claude vision', o);
}

export async function analyzeImage(buf, mime, ctx) {
  ctx.cropName = CROPS[ctx.crop]?.n;
  if (config.diseaseProvider === 'claude') return viaClaude(buf, mime, ctx);
  throw new HttpError(503, 'Disease detection is not configured yet, so no result is shown.', { setup: SETUP_HELP });
}

export function imageType(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', 'png'];
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return ['image/webp', 'webp'];
  return null;
}
