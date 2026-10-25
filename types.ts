export interface Profile {
  name: string; state: string; district: string; village: string; farmSize: number; unit: 'acre' | 'ha';
  soil: string; irrigation: string; ph: number | null; nLevel: string | null; pLevel: string | null; kLevel: string | null;
  crop: string | null; place: string | null;
}
export interface Meta {
  states: string[]; districts: string[]; season: string; diseaseProvider: 'claude' | 'none';
  crops: Record<string, { name: string; perennial: boolean; aiModelOnly: boolean }>;
}
export interface Weather {
  nasa: { temp: number; humidity: number; rain30: number; place: string; period: string; source: string; stale?: boolean } | null;
  nasaError?: string;
  manual: { temp: number | null; humidity: number | null; rain: string | null } | null;
  effective: { temp: number | null; humidity: number | null; rain: string | null };
}
export interface CropRec {
  crop: string; name: string; score: number; reasons: string[]; sowing: string; duration: string; conditions: string; typicalYield: [number, number] | null;
}
export interface ModelResult {
  top: { crop: string; name: string; score: number; hasCareData: boolean }[]; unusual: boolean; note: string;
}
export interface Care {
  crop: string; name: string;
  fertilizer: { available: boolean; preliminary: boolean; message: string; guidance: string;
    rows: { nutrient: string; kgPerHa: number; kgPerAcre: number; note: string }[] };
  irrigation: string[]; weatherPrecautions: string[];
}
export interface YieldEst {
  crop: string; name: string; unavailable?: boolean; message?: string; unit?: string;
  perHa?: { low: number; mid: number; high: number };
  areaHa?: number; production?: { low: number; mid: number; high: number; unit: string };
  districtBased?: boolean; source?: string; factors?: string[]; improve?: string[]; note?: string;
}
export interface Disease {
  id?: number; provider: string; clear: boolean; message: string; plant: string; condition: string; confidence: string;
  symptoms: string[]; causes: string[]; treatment: string[]; prevention: string[]; nutrients: string; care: string; expert: string;
  warnings: string[]; createdAt?: string; crop?: string;
}
export interface Report {
  profile: Profile; season: string; weather: Weather; crop: { key: string; name: string } | null;
  care: Care | null; yield: YieldEst | null; lastAnalysis: Disease | null;
}
export interface HistoryItem { kind: string; summary: string; createdAt: string }
