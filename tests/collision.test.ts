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
    const res = runSegment({ arena, turn: 1, robots: [R('a', 0, 500, 330, Math.PI / 2), R('b', 0, 800, 370, 0)], capsules: [], plans: { a: ['FWD', 'WAIT', 'WAIT'], b: ['WAIT', 'WAIT', 'WAIT'] } as any, seed: 3 });
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
});
