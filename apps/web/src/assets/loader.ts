// 에셋 로더 — manifest ID 로 이미지를 로드/캐시한다. 장면별 preload 지원.
import { ASSET_MANIFEST } from '@scrap/core';

export interface ImageEntry { id: string; kind: string; url: string; urlLow?: string; w: number; h: number; pivot: [number, number] }

const images = (ASSET_MANIFEST as unknown as { images: Record<string, ImageEntry> }).images;
const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

export const LOW_END = (() => { try { return localStorage.getItem('sc:lowend') === '1'; } catch { return false; } })();

export function assetInfo(id: string): ImageEntry | undefined { return images[id]; }
export function assetUrl(id: string): string {
  const e = images[id];
  if (!e) return '';
  return LOW_END && e.urlLow ? e.urlLow : e.url;
}

export function getImage(id: string): HTMLImageElement | null { return cache.get(id) ?? null; }

export function loadImage(id: string): Promise<HTMLImageElement> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const p = pending.get(id);
  if (p) return p;
  const url = assetUrl(id);
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    if (!url) { reject(new Error('no asset ' + id)); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { cache.set(id, img); pending.delete(id); resolve(img); };
    img.onerror = () => { pending.delete(id); reject(new Error('load fail ' + id)); };
    img.src = url;
  });
  pending.set(id, promise);
  return promise;
}

export async function preload(ids: string[]): Promise<void> {
  await Promise.allSettled(ids.map((id) => loadImage(id)));
}

export const SCENE_ASSETS = {
  entrance: ['BG-01', 'CH-01'],
  lobby: ['BG-02', 'CH-02'],
  build: ['BG-04', 'BG-03', 'RB-01', 'RB-02', 'RB-03', 'DR-01', 'DR-02', 'DR-03', 'MD-01', 'MD-02', 'MD-03', 'MD-04', 'MD-05', 'MD-06', 'MD-07', 'CH-01'],
  intro: ['BG-05', 'CH-02'],
  arena: ['PR-01', 'PR-02', 'PR-03', 'PR-04', 'PR-05', 'PR-06', 'PR-07', 'FX-01', 'FX-02', 'FX-03', 'FX-04', 'FX-05', 'FX-06', 'RB-01', 'RB-02', 'RB-03', 'DR-01', 'DR-02', 'DR-03', 'MD-01', 'MD-02', 'MD-03', 'MD-04', 'MD-05', 'MD-06', 'MD-07'],
  pitstop: ['BG-06', 'CH-01'],
  podium: ['BG-07', 'CH-03', 'CH-02'],
  teacher: ['BG-08'],
};
