import type { Care, CropRec, Disease, HistoryItem, Meta, ModelResult, Profile, Report, Weather, YieldEst } from './types';

const KEY = 'agrismart_token';
export const getToken = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t: string | null): void => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

export class ApiError extends Error {
  status: number; extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) { super(message); this.status = status; this.extra = extra; }
}

async function request<T>(method: string, url: string, body?: unknown, image?: File): Promise<T> {
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  let payload: BodyInit | undefined;
  if (image) { headers['content-type'] = image.type; payload = image; }
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  let res: Response;
  try { res = await fetch(url, { method, headers, body: payload }); }
  catch { throw new ApiError(0, 'Cannot reach the server. Check your internet connection.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && t) { setToken(null); window.dispatchEvent(new Event('auth-expired')); }
    const { error, ...extra } = data as { error?: string };
    throw new ApiError(res.status, error || 'Something went wrong.', extra);
  }
  return data as T;
}

export async function imageUrl(id: number): Promise<string> {
  const t = getToken();
  const r = await fetch(`/api/analyses/${id}/image`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (!r.ok) throw new ApiError(r.status, 'Could not load the image.');
  return URL.createObjectURL(await r.blob());
}

export const api = {
  meta: () => request<Meta>('GET', '/api/meta'),
  signup: (email: string, password: string) => request<{ token: string }>('POST', '/api/auth/signup', { email, password }),
  login: (email: string, password: string) => request<{ token: string }>('POST', '/api/auth/login', { email, password }),
  me: () => request<{ email: string; profile: Profile | null }>('GET', '/api/me'),
  saveProfile: (p: Omit<Profile, 'crop' | 'place'>) => request<{ profile: Profile }>('PUT', '/api/profile', p),
  setCrop: (crop: string) => request<{ crop: string }>('PUT', '/api/crop', { crop }),
  weather: (refresh = false) => request<Weather>('GET', `/api/weather${refresh ? '?refresh=1' : ''}`),
  manualWeather: (w: { temp: string; humidity: string; rain: string }) => request<{ ok: boolean }>('PUT', '/api/weather/manual', w),
  recommendations: () => request<{ season: string; disclaimer: string; crops: CropRec[] }>('GET', '/api/recommendations'),
  modelCrop: (v: Record<string, string>) => request<ModelResult>('POST', '/api/model/crop', v),
  fertMatch: (n: string, p: string, k: string) => request<{ product: string; farFromExamples: boolean; note: string }>('POST', '/api/fertilizer/match', { n, p, k }),
  care: () => request<Care>('GET', '/api/care'),
  yield: () => request<YieldEst>('GET', '/api/yield'),
  disease: (file: File) => request<Disease>('POST', '/api/disease', undefined, file),
  analyses: () => request<Disease[]>('GET', '/api/analyses'),
  report: () => request<Report>('GET', '/api/report'),
  history: () => request<HistoryItem[]>('GET', '/api/history'),
};
