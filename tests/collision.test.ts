import { describe, it, expect } from 'vitest';
import { runSegment, type RobotSimState } from '../packages/core/src/physics/sim';
import { ARENAS } from '../packages/core/src/content/arenas';
import { deriveSpec } from '../packages/core/src/rules/commands';
import { PRESETS } from '../packages/core/src/content/parts';

const arena = ARENAS['AR-01'];
const R = (id: string, p: number, x: number, y: number, a: number): RobotSimState => ({ id, spec: deriveSpec(PRESETS[p].build), x, y, angle: a, vx: 0, vy: 0, w: 0, fallen: false, padIndex: 0 });
const speedAt = (res: ReturnType<typeof runSegment>, bodyIdx: number, i: number) => {
  const a = res.frames[i].p, b = res.frames[i + 1].p, dt = res.frames[i + 1].t - res.frames[i].t;
  return Math.hypot(b[bodyIdx * 3] - a[bodyIdx * 3], b[bodyIdx * 3 + 1] - a[bodyIdx * 3 + 1]) / dt;
};

describe('충돌: 운동량·충격량·탄성', () => {
  it('달려온 로봇이 정지한 같은 질량 로봇의 옆구리를 치면: 맞은 쪽은 크게 밀려나고 친 쪽은 거의 멈춘다', () => {
    const res = runSegment({ arena, turn: 1, robots: [R('a', 0, 500, 620, Math.PI / 2), R('b', 0, 800, 620, 0)], capsules: [], plans: { a: ['FWD', 'BRAKE', 'BRAKE'], b: ['WAIT', 'WAIT', 'WAIT'] } as any, seed: 1 });
    const hit = res.events.find((e) => e.type === 'hit') as any;
    const fi = res.frames.findIndex((f) => f.t >= hit.t);
    const bx0 = res.frames[fi].p[3];
    const pushed = res.robots[1].x - bx0;
    const vA_after = speedAt(res, 0, fi + 1), vB_after = speedAt(res, 1, fi + 1), vA_before = speedAt(res, 0, fi - 3);
    console.log(`충격량 ${hit.impulse} · a 속력 ${vA_before.toFixed(0)}→${vA_after.toFixed(0)} · b 속력 0→${vB_after.toFixed(0)} · b 가 밀린 거리 ${pushed.toFixed(0)}px`);
    expect(pushed).toBeGreaterThan(95); // 이전 구현: 43px
    expect(vB_after).toBeGreaterThan(vA_after * 2); // 운동량이 넘어감
    expect(res.events.some((e) => e.type === 'skid' && (e as any).id === 'b' && (e as any).on)).toBe(true);
  });
  it('운동량 보존: 충돌 직전·직후 두 로봇의 운동량 합이 같다(마찰 없는 순간)', () => {
    // 저마찰 영향 없이 충돌 한 프레임만 비교하기 위해 서로 마주 달리게 한다
    const res = runSegment({ arena, turn: 1, robots: [R('h', 1, 560, 620, Math.PI / 2), R('l', 2, 900, 620, -Math.PI / 2)], capsules: [], plans: { h: ['FWD', 'WAIT', 'WAIT'], l: ['FWD', 'WAIT', 'WAIT'] } as any, seed: 2 });
    const hit = res.events.find((e) => e.type === 'hit') as any;
    const fi = res.frames.findIndex((f) => f.t >= hit.t);
    const mh = res.robots[0].spec.mass, ml = res.robots[1].spec.mass;
    const vx = (b: number, i: number) => (res.frames[i + 1].p[b * 3] - res.frames[i].p[b * 3]) / (res.frames[i + 1].t - res.frames[i].t);
    const before = mh * vx(0, fi - 3) + ml * vx(1, fi - 3), after = mh * vx(0, fi + 1) + ml * vx(1, fi + 1);
    console.log(`무거운 쪽 ${mh} 가벼운 쪽 ${ml} · 운동량 합 ${before.toFixed(0)} → ${after.toFixed(0)} · 가벼운 쪽 속도 ${vx(1, fi - 3).toFixed(0)} → ${vx(1, fi + 1).toFixed(0)} · 무거운 쪽 ${vx(0, fi - 3).toFixed(0)} → ${vx(0, fi + 1).toFixed(0)}`);
    expect(Math.abs(after - before)).toBeLessThan(Math.abs(before) * 0.25 + 1500); // 20Hz 표본·바닥 마찰 오차 허용
    expect(vx(1, fi + 1)).toBeGreaterThan(60); // 가벼운 쪽이 튕겨 나간다(진행 방향 반대)
  });
  it('빗맞으면 스핀이 걸린다', () => {
    const res = runSegment({ arena, turn: 1, robots: [R('a', 0, 900, 330, Math.PI / 2), R('b', 0, 1200, 370, 0)], capsules: [], plans: { a: ['FWD', 'WAIT', 'WAIT'], b: ['WAIT', 'WAIT', 'WAIT'] } as any, seed: 3 });
    const hit = res.events.find((e) => e.type === 'hit') as any;
    const fi = res.frames.findIndex((f) => f.t >= hit.t);
    const turned = Math.abs(res.frames[Math.min(res.frames.length - 1, fi + 16)].p[5] - res.frames[fi].p[5]);
    console.log(`빗맞은 뒤 0.8초 동안 b 회전 ${(turned * 180 / Math.PI).toFixed(0)}°`);
    expect(turned).toBeGreaterThan(0.25);
  });
  it('완충벽은 잘 튕긴다', () => {
    const res = runSegment({ arena, turn: 1, robots: [R('a', 0, 800, 520, Math.PI)], capsules: [], plans: { a: ['FWD', 'WAIT', 'WAIT'] } as any, seed: 4 });
    const wall = res.events.find((e) => e.type === 'wall') as any;
    expect(wall).toBeTruthy();
    const fi = res.frames.findIndex((f) => f.t >= wall.t);
    const vy = (res.frames[fi + 2].p[1] - res.frames[fi + 1].p[1]) / 0.05;
    console.log(`완충벽 충돌 뒤 되튐 속도 ${vy.toFixed(0)}px/s`);
    expect(vy).toBeLessThan(-40);
  });
  it('왕관은 로봇에 부딪히면 튕겨 나가고 벽에 반사된다', () => {
    const res = runSegment({ arena, turn: 1, robots: [R('a', 0, 620, 640, Math.atan2(180, 190))], capsules: [], plans: { a: ['FWD', 'FWD', 'BRAKE'] } as any, seed: 5 });
    const hit = res.events.find((e) => e.type === 'crownHit') as any;
    expect(hit).toBeTruthy();
    const moved = Math.hypot(res.crown!.x - 800, res.crown!.y - 450);
    const walls = res.events.filter((e) => e.type === 'crownWall' || e.type === 'crownReset').length;
    console.log(`왕관 충격량 ${hit.impulse} · 이동 ${moved.toFixed(0)}px · 벽 반사/재배치 ${walls}회 · 최종 (${res.crown!.x.toFixed(0)}, ${res.crown!.y.toFixed(0)})`);
    expect(moved).toBeGreaterThan(150);
    // 로봇과 겹치지 않는다
    const a = res.robots[0];
    expect(Math.hypot(a.x - res.crown!.x, a.y - res.crown!.y)).toBeGreaterThanOrEqual(a.spec.radius + 29);
  });
  it('여러 대가 한꺼번에 부딪히면 연쇄로 더 크게 튕긴다(운동량 합은 보존)', () => {
    const maxOut = (n: number) => {
      // n 대가 한 점(1100,330)을 향해 사방에서 돌진
      const robots = Array.from({ length: n }, (_, i) => { const ang = (i / n) * Math.PI * 2; const x = 1100 + Math.cos(ang) * 230, y = 330 + Math.sin(ang) * 230; return R('r' + i, 0, x, y, Math.atan2(1100 - x, -(330 - y))); });
      const plans: any = {}; for (const r of robots) plans[r.id] = ['FWD', 'WAIT', 'WAIT'];
      const res = runSegment({ arena, turn: 1, robots, capsules: [], plans, seed: 6, crown: null });
      const hits = res.events.filter((e) => e.type === 'hit') as any[];
      const fi = res.frames.findIndex((f) => f.t >= hits[0].t);
      let vmax = 0, px = 0, py = 0;
      for (let k = fi + 2; k < Math.min(res.frames.length - 1, fi + 10); k++) for (let b = 0; b < n; b++) {
        const dt = res.frames[k + 1].t - res.frames[k].t; const vx = (res.frames[k + 1].p[b * 3] - res.frames[k].p[b * 3]) / dt, vy = (res.frames[k + 1].p[b * 3 + 1] - res.frames[k].p[b * 3 + 1]) / dt;
        vmax = Math.max(vmax, Math.hypot(vx, vy)); if (k === fi + 3) { px += vx; py += vy; }
      }
      return { vmax, combo: Math.max(...hits.map((h) => h.combo)), p: Math.hypot(px, py) };
    };
    const two = maxOut(2), four = maxOut(4);
    console.log(`2대 정면: 최대 되튐 ${two.vmax.toFixed(0)}px/s (연쇄 ${two.combo}) · 4대 집결: 최대 되튐 ${four.vmax.toFixed(0)}px/s (연쇄 ${four.combo}) · 4대 운동량 합 ${four.p.toFixed(0)}`);
    expect(four.combo).toBeGreaterThanOrEqual(2);
    expect(four.vmax).toBeGreaterThan(two.vmax * 1.15);
    expect(four.p).toBeLessThan(60); // 대칭 집결이므로 합은 0 근처
  });
});
