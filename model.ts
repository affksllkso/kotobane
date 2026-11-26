import type { Profile } from './analysis';

export type Provider = 'gemini' | 'openai';
export const providerNames = { gemini: 'Gemini', openai: 'OpenAI' };
export type Review = { category: string; status: '維持' | '要確認'; note: string };
export type Revision = {
  before: string; after: string; review: Review[]; terms: string[]; provider: Provider;
  target: number | null; actual: number; partial: boolean;
};
export type History = { id: string; date: string; type: 'analysis' | 'rewrite'; text: string; revision?: Revision };
export type StoredProfile = Profile & { id: string };

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('kotobane:' + key) ?? 'null');
    if (Array.isArray(fallback)) return (Array.isArray(value) ? value : fallback) as T;
    return typeof value === typeof fallback ? value as T : fallback;
  } catch { return fallback; }
}

export function saveLocal(key: string, value: unknown) {
  localStorage.setItem('kotobane:' + key, JSON.stringify(value));
}
