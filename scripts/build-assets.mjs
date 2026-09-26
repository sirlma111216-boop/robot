// 에셋 빌드: assets-source/images/*.{webp,png} → apps/web/public/assets/images/**
// - 배경/경기장: 1600px, 1024px 두 해상도 WebP
// - 투명 모듈(로봇 부품·오브젝트·인물·효과): 알파 트리밍 후 크기 축소, 알파 보존 WebP
// - 알파가 없는(흰 배경) 효과 이미지는 밝기 기반으로 알파를 생성
// - 결과 manifest: packages/core/src/assets/manifest.json (id, kind, url, w, h, pivot, trim)
import sharp from 'sharp';
import { mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'assets-source/images';
const OUT = 'apps/web/public/assets/images';
const MANIFEST = 'packages/core/src/assets/manifest.json';

/** @type {Record<string, {kind:string, max?:number, pivot?:[number,number], dir:string, lum?:boolean}>} */
const SPEC = {
  // 배경(원근) — 장면별 로딩
  'BG-01': { kind: 'bg', dir: 'bg' }, 'BG-02': { kind: 'bg', dir: 'bg' }, 'BG-03': { kind: 'bg', dir: 'bg' },
  'BG-04': { kind: 'bg', dir: 'bg' }, 'BG-05': { kind: 'bg', dir: 'bg' }, 'BG-06': { kind: 'bg', dir: 'bg' },
  'BG-07': { kind: 'bg', dir: 'bg' }, 'BG-08': { kind: 'bg', dir: 'bg' },
  // 경기장 바닥(탑다운)
  'AR-01': { kind: 'arena', dir: 'arena' }, 'AR-02': { kind: 'arena', dir: 'arena' }, 'AR-03': { kind: 'arena', dir: 'arena' },
  // 로봇 모듈 — pivot 은 트리밍된 이미지 기준 (0..1)
  'RB-01': { kind: 'chassis', max: 320, dir: 'parts' }, 'RB-02': { kind: 'chassis', max: 320, dir: 'parts' }, 'RB-03': { kind: 'chassis', max: 320, dir: 'parts' },
  'DR-01': { kind: 'drive', max: 256, dir: 'parts' }, 'DR-02': { kind: 'drive', max: 256, dir: 'parts' }, 'DR-03': { kind: 'drive', max: 256, dir: 'parts' },
  'MD-01': { kind: 'front', max: 256, dir: 'parts', pivot: [0.5, 0.97] }, 'MD-02': { kind: 'front', max: 256, dir: 'parts', pivot: [0.5, 0.97] }, 'MD-03': { kind: 'front', max: 256, dir: 'parts', pivot: [0.5, 0.97] },
  'MD-04': { kind: 'utility', max: 200, dir: 'parts' }, 'MD-05': { kind: 'utility', max: 200, dir: 'parts' }, 'MD-06': { kind: 'utility', max: 200, dir: 'parts' }, 'MD-07': { kind: 'utility', max: 200, dir: 'parts' },
  // 경기장 오브젝트
  'PR-01': { kind: 'prop', max: 512, dir: 'props' }, 'PR-02': { kind: 'prop', max: 384, dir: 'props' }, 'PR-03': { kind: 'prop', max: 512, dir: 'props' },
  'PR-04': { kind: 'prop', max: 192, dir: 'props' }, 'PR-05': { kind: 'prop', max: 128, dir: 'props' }, 'PR-06': { kind: 'prop', max: 256, dir: 'props' }, 'PR-07': { kind: 'prop', max: 384, dir: 'props' },
  // 인물
  'CH-01': { kind: 'char', max: 560, dir: 'chars' }, 'CH-02': { kind: 'char', max: 560, dir: 'chars' }, 'CH-03': { kind: 'char', max: 560, dir: 'chars' },
  // 효과 — 흰 배경이면 밝기→알파
  'FX-01': { kind: 'fx', max: 384, dir: 'fx', lum: true }, 'FX-02': { kind: 'fx', max: 256, dir: 'fx', lum: true }, 'FX-03': { kind: 'fx', max: 384, dir: 'fx', lum: true },
  'FX-04': { kind: 'fx', max: 384, dir: 'fx', lum: true }, 'FX-05': { kind: 'fx', max: 320, dir: 'fx', lum: true }, 'FX-06': { kind: 'fx', max: 256, dir: 'fx', lum: true },
};

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

/** 흰 배경 이미지에서 밝기 기반 알파 생성(글로우 효과용). 이미 유효한 알파가 있으면 그대로 둔다. */
async function ensureAlpha(img, id) {
  const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 250) transparent++;
  if (transparent / n > 0.05) return { img: img.ensureAlpha(), derived: false };
  // 흰 배경 → 알파: a = 1 - min(r,g,b)/255, 색은 un-premultiply 대신 원색 유지(글로우는 additive 로 그림)
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const mn = Math.min(r, g, b);
    let a = 255 - mn;
    if (a < 6) a = 0;
    // 밝은 회색(먼지)도 살리기 위해 채도 고려
    const mx = Math.max(r, g, b);
    const sat = mx - mn;
    a = Math.min(255, Math.round(a * 1.15 + sat * 0.25));
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  console.log(`  ${id}: 흰 배경 감지 → 밝기 기반 알파 생성`);
  return { img: sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }), derived: true };
}

async function main() {
  const files = (await readdir(SRC)).filter((f) => /\.(webp|png)$/i.test(f));
  const manifest = { version: 1, generatedAt: new Date().toISOString(), images: {} };
  for (const f of files.sort()) {
    const id = f.replace(/\.(webp|png)$/i, '');
    const spec = SPEC[id];
    if (!spec) { if (id !== 'ART-REF-01') console.log(`  건너뜀(명세 없음): ${id}`); continue; }
    const srcPath = path.join(SRC, f);
    const outDir = path.join(OUT, spec.dir);
    await mkdir(outDir, { recursive: true });
    const base = id.toLowerCase();
    const meta = await sharp(srcPath).metadata();
    if (spec.kind === 'bg' || spec.kind === 'arena') {
      const variants = {};
      for (const w of [1600, 1024]) {
        const outPath = path.join(outDir, `${base}-${w}.webp`);
        if (!(await exists(outPath))) await sharp(srcPath).resize({ width: w }).webp({ quality: w === 1600 ? 82 : 76 }).toFile(outPath);
        variants[w] = `/assets/images/${spec.dir}/${base}-${w}.webp`;
      }
      manifest.images[id] = { id, kind: spec.kind, url: variants[1600], urlLow: variants[1024], w: 1600, h: Math.round((meta.height / meta.width) * 1600), pivot: [0.5, 0.5] };
      console.log(`${id}: bg ${meta.width}x${meta.height} → 1600/1024`);
      continue;
    }
    let img = sharp(srcPath);
    let derived = false;
    if (spec.lum) { const r = await ensureAlpha(img, id); img = r.img; derived = r.derived; } else img = img.ensureAlpha();
    // 트리밍: 알파 기준
    const trimmed = await img.trim({ threshold: 8 }).png().toBuffer({ resolveWithObject: true });
    const tw = trimmed.info.width, th = trimmed.info.height;
    const trimOff = trimmed.info.trimOffsetLeft !== undefined ? [Math.abs(trimmed.info.trimOffsetLeft), Math.abs(trimmed.info.trimOffsetTop)] : [0, 0];
    const scale = Math.min(1, spec.max / Math.max(tw, th));
    const ow = Math.max(1, Math.round(tw * scale)), oh = Math.max(1, Math.round(th * scale));
    const outPath = path.join(outDir, `${base}.webp`);
    await sharp(trimmed.data).resize({ width: ow, height: oh }).webp({ quality: 88, alphaQuality: 95 }).toFile(outPath);
    manifest.images[id] = {
      id, kind: spec.kind, url: `/assets/images/${spec.dir}/${base}.webp`, w: ow, h: oh,
      pivot: spec.pivot ?? [0.5, 0.5],
      source: { w: meta.width, h: meta.height, trim: [trimOff[0], trimOff[1], tw, th] },
      alphaDerived: derived || undefined,
    };
    console.log(`${id}: ${meta.width}x${meta.height} → trim ${tw}x${th} → ${ow}x${oh}`);
  }
  await mkdir(path.dirname(MANIFEST), { recursive: true });
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${Object.keys(manifest.images).length}개 → ${MANIFEST}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
