// 로봇 합성 그리기 — 실제 조립 모듈(섀시·바퀴·전면·보조)을 하드포인트에 맞춰 캔버스에 그린다.
// 팀 식별은 외곽 링 + 번호 + 문양으로 표현하고 이미지를 통째로 tint 하지 않는다.
import { CHASSIS, DRIVES, TEAM_STYLES, type RobotBuild } from '@scrap/core';
import { getImage, assetInfo } from '../assets/loader';

export interface RobotDrawOptions {
  x: number; y: number; angle: number; radius: number;
  build: RobotBuild;
  styleIndex: number;
  number: number;
  scale?: number; // 추가 스케일
  alpha?: number;
  highlight?: boolean; // 내 로봇 추적 링
  wheelPhase?: number; // 바퀴 회전 표현(px)
  bumperCompress?: number; // 0..1
  shadow?: boolean;
  label?: string;
}

function drawImgCentered(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, targetH: number, opts?: { mirror?: boolean; pivot?: [number, number]; targetW?: number; rot?: number }) {
  const img = getImage(id); const info = assetInfo(id);
  if (!img || !info) return;
  const ratio = info.w / info.h;
  const h = opts?.targetW ? opts.targetW / ratio : targetH;
  const w = h * ratio;
  const pv = opts?.pivot ?? [0.5, 0.5];
  ctx.save();
  ctx.translate(cx, cy);
  if (opts?.rot) ctx.rotate(opts.rot);
  if (opts?.mirror) ctx.scale(-1, 1);
  ctx.drawImage(img, -w * pv[0], -h * pv[1], w, h);
  ctx.restore();
}

export function drawPattern(ctx: CanvasRenderingContext2D, pattern: string, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1.5, r * 0.09);
  switch (pattern) {
    case 'stripe': for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.9 + i * r * 0.28); ctx.lineTo(r * 0.6, r * 0.9 + i * r * 0.28); ctx.stroke(); } break;
    case 'dots': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((i - 1) * r * 0.42, r * 0.92, r * 0.09, 0, Math.PI * 2); ctx.fill(); } break;
    case 'ring': ctx.beginPath(); ctx.arc(0, r * 0.92, r * 0.16, 0, Math.PI * 2); ctx.stroke(); break;
    case 'chevron': ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.78); ctx.lineTo(0, r * 1.02); ctx.lineTo(r * 0.4, r * 0.78); ctx.stroke(); break;
    case 'cross': ctx.beginPath(); ctx.moveTo(-r * 0.22, r * 0.72); ctx.lineTo(r * 0.22, r * 1.12); ctx.moveTo(r * 0.22, r * 0.72); ctx.lineTo(-r * 0.22, r * 1.12); ctx.stroke(); break;
    default: break;
  }
  ctx.restore();
}

export function drawRobot(ctx: CanvasRenderingContext2D, o: RobotDrawOptions) {
  const c = CHASSIS[o.build.chassis]; const d = DRIVES[o.build.drive];
  if (!c || !d) return;
  const s = o.scale ?? 1;
  const R = o.radius * s;
  const style = TEAM_STYLES[o.styleIndex % TEAM_STYLES.length];
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.translate(o.x, o.y);
  // 공통 바닥 그림자(부품별 그림자 없음)
  if (o.shadow !== false) {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(R * 0.12, R * 0.16, R * 1.32, R * 1.18, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // 팀 링(회전하지 않음)
  ctx.save();
  ctx.lineWidth = Math.max(2, R * 0.13);
  ctx.strokeStyle = style.color; ctx.beginPath(); ctx.arc(0, 0, R * 1.42, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, R * 0.05); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(0, 0, R * 1.42 + R * 0.09, 0, Math.PI * 2); ctx.stroke();
  if (o.highlight) { ctx.setLineDash([R * 0.25, R * 0.18]); ctx.lineWidth = Math.max(2, R * 0.09); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, R * 1.68, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  ctx.rotate(o.angle);
  const chH = R * 2 * c.spriteScale;
  const chInfo = assetInfo(o.build.chassis);
  const chW = chInfo ? chH * (chInfo.w / chInfo.h) : chH;
  const hp = c.hardpoints;
  const px = (h: [number, number]) => (h[0] - 0.5) * chW;
  const py = (h: [number, number]) => (h[1] - 0.5) * chH;
  // 바퀴(우측 원본, 좌측 미러)
  const wheelH = R * 2 * d.wheelScale * 0.92;
  const wInfo0 = assetInfo(o.build.drive); const wheelW = wInfo0 ? wheelH * (wInfo0.w / wInfo0.h) : R * 0.8;
  // 바퀴는 섀시 옆에 붙는다: 섀시 폭 기준으로 배치(하드포인트는 높이만 사용)
  const wheelX = chW / 2 + wheelW * 0.28;
  drawImgCentered(ctx, o.build.drive, -wheelX, py(hp.left), wheelH, { mirror: true });
  drawImgCentered(ctx, o.build.drive, wheelX, py(hp.right), wheelH);
  // 바퀴 회전 표현: 간단한 줄무늬 오버레이
  if (o.wheelPhase) {
    const wInfo = assetInfo(o.build.drive); const ww = wInfo ? wheelH * (wInfo.w / wInfo.h) : R * 0.8;
    ctx.save(); ctx.globalAlpha *= 0.28; ctx.fillStyle = '#000';
    for (const hx of [-wheelX, wheelX]) {
      const step = wheelH / 6; const off = ((o.wheelPhase % step) + step) % step;
      for (let y = -wheelH / 2 + off; y < wheelH / 2; y += step) ctx.fillRect(hx - ww * 0.36, py(hp.left) + y, ww * 0.72, Math.max(1, step * 0.12));
    }
    ctx.restore();
  }
  // 섀시
  drawImgCentered(ctx, o.build.chassis, 0, 0, chH);
  // 문양 (섀시 뒤쪽 위에 그림)
  drawPattern(ctx, style.pattern, R, style.color);
  // 전면 장치: 연결점(이미지 하단 중앙)이 앞 하드포인트에 오도록
  const compress = o.bumperCompress ?? 0;
  drawImgCentered(ctx, o.build.front, px(hp.front), py(hp.front) + compress * R * 0.25, 0, { targetW: R * 1.75, pivot: assetInfo(o.build.front)?.pivot ?? [0.5, 0.97] });
  // 보조 장치
  const hps = [hp.utilA, hp.utilB];
  o.build.utilities.forEach((u, i) => { const h = hps[i]; if (h) drawImgCentered(ctx, u, px(h), py(h), 0, { targetW: R * 0.78 }); });
  // 방향 표시(앞쪽 작은 삼각형)
  ctx.save(); ctx.fillStyle = style.color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -R * 1.62); ctx.lineTo(-R * 0.22, -R * 1.34); ctx.lineTo(R * 0.22, -R * 1.34); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.restore();
  // 번호 배지(회전하지 않음)
  ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
  const bx = o.x + R * 1.15, by = o.y - R * 1.15;
  ctx.fillStyle = style.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(bx, by, Math.max(8, R * 0.42), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0b1424'; ctx.font = `900 ${Math.max(10, R * 0.5)}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(o.number), bx, by + 1);
  if (o.label) {
    ctx.font = `700 ${Math.max(10, R * 0.42)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.strokeText(o.label, o.x, o.y + R * 1.95); ctx.fillText(o.label, o.x, o.y + R * 1.95);
  }
  ctx.restore();
}

/** 로봇 미리보기 캔버스용 */
export function renderRobotPreview(canvas: HTMLCanvasElement, build: RobotBuild, styleIndex: number, number: number, angle = 0) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 240, h = canvas.clientHeight || 240;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const r = Math.min(w, h) / 4.6;
  drawRobot(ctx, { x: w / 2, y: h / 2, angle, radius: r, build, styleIndex, number, shadow: true });
}
