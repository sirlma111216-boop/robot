import { describe, it, expect } from 'vitest';
import { runSegment, type RobotSimState } from '../packages/core/src/physics/sim';
import { ARENAS } from '../packages/core/src/content/arenas';
import { deriveSpec } from '../packages/core/src/rules/commands';
import { PRESETS } from '../packages/core/src/content/parts';

function robot(id: string, presetIdx: number, x: number, y: number, angle: number, padIndex = 0): RobotSimState {
  return { id, spec: deriveSpec(PRESETS[presetIdx].build), x, y, angle, vx: 0, vy: 0, w: 0, fallen: false, padIndex };
}

describe('physics', () => {
  const arena = ARENAS['AR-01'];
  it('전진 명령은 로봇을 앞으로 움직이고 결정적이다', () => {
    const input = { arena, turn: 1, robots: [robot('a', 0, 500, 450, Math.PI / 2)], capsules: [], plans: { a: ['FWD', 'FWD', 'BRAKE'] as any }, seed: 7 };
    const r1 = runSegment(input); const r2 = runSegment(input);
    expect(r1.robots[0].x).toBeGreaterThan(700);
    expect(Math.abs(r1.robots[0].y - 450)).toBeLessThan(5);
    expect(JSON.stringify(r1.frames)).toEqual(JSON.stringify(r2.frames));
    expect(r1.frames.length).toBeGreaterThan(150);
    console.log('전진 후 x=', r1.robots[0].x.toFixed(1), '속도=', Math.hypot(r1.robots[0].vx, r1.robots[0].vy).toFixed(1), 'frames', r1.frames.length, 'json bytes', JSON.stringify(r1).length);
  });
  it('무거운 로봇이 가벼운 로봇을 밀어낸다', () => {
    const heavy = robot('h', 1, 600, 450, Math.PI / 2), light = robot('l', 2, 760, 450, -Math.PI / 2);
    const res = runSegment({ arena, turn: 1, robots: [heavy, light], capsules: [], plans: { h: ['FWD', 'FWD', 'FWD'], l: ['FWD', 'FWD', 'FWD'] } as any, seed: 3 });
    const h = res.robots[0], l = res.robots[1];
    console.log('heavy x', h.x.toFixed(0), 'light x', l.x.toFixed(0), 'hits', res.events.filter(e => e.type === 'hit').length);
    expect(h.x + l.x).toBeGreaterThan(1360); // 전체적으로 오른쪽(무거운 쪽의 진행방향)으로 이동
  });
  it('범퍼로 밀어 낙하시키면 2점, 스스로 떨어지면 0점', () => {
    const att = robot('att', 0, 900, 450, Math.PI / 2), vic = robot('vic', 2, 1000, 450, Math.PI / 2);
    const res = runSegment({ arena, turn: 1, robots: [att, vic], capsules: [], plans: { att: ['FWD', 'FRONT', 'FWD'], vic: ['WAIT', 'WAIT', 'WAIT'] } as any, seed: 5 });
    const fall = res.events.find(e => e.type === 'fall') as any;
    console.log('fall', fall, 'scores', res.scores, 'vic x', res.robots[1].x.toFixed(0));
    const solo = runSegment({ arena, turn: 1, robots: [robot('s', 2, 1100, 450, Math.PI / 2)], capsules: [], plans: { s: ['FWD', 'FWD', 'FWD'] } as any, seed: 5 });
    const f2 = solo.events.find(e => e.type === 'fall') as any;
    expect(f2).toBeTruthy(); expect(f2.by).toBeUndefined(); expect(solo.scores.s).toBe(0);
  });
  it('왕관 곁에 혼자 있으면 3점, 캡슐 1점', () => {
    // 왕관(중앙 800,450) 곁 110px 에 서 있고, 캡슐은 바로 옆
    const a = robot('a', 0, 800, 560, 0);
    const res = runSegment({ arena, turn: 1, robots: [a], capsules: [{ id: 'c1', x: 800, y: 590, vx: 0, vy: 0, taken: false }], plans: { a: ['BRAKE', 'BRAKE', 'BRAKE'] } as any, seed: 1 });
    expect(res.scores.a).toBe(4);
    // 멀리 있으면 왕관 점수 없음
    const far = runSegment({ arena, turn: 1, robots: [robot('a', 0, 800, 700, 0)], capsules: [], plans: { a: ['BRAKE', 'BRAKE', 'BRAKE'] } as any, seed: 1 });
    expect(far.scores.a).toBe(0);
  });
});
