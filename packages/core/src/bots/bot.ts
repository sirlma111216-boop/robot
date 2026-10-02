// 봇: 공개 상태만 보고 제한된 후보 명령을 같은 물리로 평가하는 휴리스틱. 외부 API 없음.
import type { ArenaDef } from '../content/arenas';
import { runSegment, CROWN_ZONE_R, type RobotSimState, type CapsuleState, type CrownState } from '../physics/sim';
import { planCost, type Plan, type CommandId } from '../rules/commands';
import { PRESETS, type RobotBuild } from '../content/parts';

export type BotLevel = 'easy' | 'normal' | 'hard';

export interface BotContext {
  arena: ArenaDef;
  turn: number;
  me: RobotSimState;
  others: RobotSimState[];
  capsules: CapsuleState[];
  crown?: CrownState;
  energy: number;
  seed: number;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const CURATED: Plan[] = [
  ['FWD', 'FWD', 'FWD'], ['FWD', 'BRAKE', 'BRAKE'], ['FWD', 'FWD', 'BRAKE'], ['LEFT', 'FWD', 'FWD'], ['RIGHT', 'FWD', 'FWD'],
  ['FWD', 'LEFT', 'FWD'], ['FWD', 'RIGHT', 'FWD'], ['BRAKE', 'BRAKE', 'BRAKE'], ['BACK', 'BRAKE', 'BRAKE'], ['LEFT', 'LEFT', 'FWD'],
  ['RIGHT', 'RIGHT', 'FWD'], ['FWD', 'FRONT', 'BRAKE'], ['FRONT', 'FWD', 'BRAKE'], ['FWD', 'FWD', 'FRONT'], ['LEFT', 'FWD', 'FRONT'],
  ['RIGHT', 'FWD', 'FRONT'], ['UTIL_A', 'FWD', 'BRAKE'], ['FWD', 'UTIL_A', 'BRAKE'], ['BRAKE', 'UTIL_A', 'UTIL_A'], ['FWD', 'UTIL_B', 'BRAKE'],
  ['UTIL_B', 'FWD', 'BRAKE'], ['FRONT', 'FRONT', 'BRAKE'], ['BACK', 'LEFT', 'FWD'], ['BACK', 'RIGHT', 'FWD'], ['WAIT', 'FWD', 'BRAKE'],
];

function legalPlans(build: RobotBuild, energy: number, r: () => number, extra: number): Plan[] {
  const out: Plan[] = [];
  const seen = new Set<string>();
  const push = (p: Plan) => { const k = p.join(','); if (seen.has(k)) return; if (planCost(p, build) <= energy) { seen.add(k); out.push(p); } };
  for (const p of CURATED) push(p);
  const pool: CommandId[] = ['FWD', 'BACK', 'LEFT', 'RIGHT', 'BRAKE', 'FRONT', 'UTIL_A', 'UTIL_B', 'WAIT'];
  for (let i = 0; i < extra * 3 && out.length < CURATED.length + extra; i++) {
    push([pool[Math.floor(r() * pool.length)], pool[Math.floor(r() * pool.length)], pool[Math.floor(r() * pool.length)]]);
  }
  return out;
}

function evaluate(ctx: BotContext, plan: Plan, otherPlans: Record<string, Plan>): number {
  const robots = [ctx.me, ...ctx.others].map((x) => ({ ...x }));
  const res = runSegment({ arena: ctx.arena, turn: ctx.turn, robots, capsules: ctx.capsules.map((c) => ({ ...c })), plans: { [ctx.me.id]: plan, ...otherPlans }, seed: ctx.seed, crown: ctx.crown ? { ...ctx.crown } : undefined });
  const me = res.robots.find((x) => x.id === ctx.me.id)!;
  let s = (res.scores[ctx.me.id] ?? 0) * 10;
  if (me.fallen) s -= 24;
  const cx = res.crown?.x ?? ctx.arena.crown.x, cy = res.crown?.y ?? ctx.arena.crown.y;
  const dCrown = Math.hypot(me.x - cx, me.y - cy);
  s -= Math.min(6, dCrown / 90);
  // 왕관 안에 있는데 경합이면 약간 감점(밀어내기 유도)
  const crown = res.events.find((e) => e.type === 'crown') as { contested: string[] } | undefined;
  if (crown && crown.contested.includes(ctx.me.id)) s -= 1.5;
  // 낙하 구역 근접 회피 / 상대 근접 유도
  let myPit = Infinity;
  for (const p of ctx.arena.pits) myPit = Math.min(myPit, Math.hypot(me.x - p.x, me.y - p.y) - p.r);
  if (myPit < 120) s -= (120 - myPit) / 30;
  for (const o of res.robots) {
    if (o.id === ctx.me.id) continue;
    if (o.fallen) { s += 2; continue; }
    let d = Infinity;
    for (const p of ctx.arena.pits) d = Math.min(d, Math.hypot(o.x - p.x, o.y - p.y) - p.r);
    if (d < 160) s += (160 - d) / 80;
    const oc = Math.hypot(o.x - cx, o.y - cy);
    if (oc < CROWN_ZONE_R) s -= 1.2;
  }
  s += (ctx.energy - planCost(plan, ctx.me.spec.build)) * 0.25;
  return s;
}

/** 봇 명령 결정. 계산 예산: 후보 수를 난도별로 제한. */
export function planForBot(level: BotLevel, ctx: BotContext): Plan {
  const r = rng(ctx.seed ^ 0x9e3779b9);
  const build = ctx.me.spec.build;
  const extra = level === 'easy' ? 6 : level === 'normal' ? 14 : 20;
  const cands = legalPlans(build, ctx.energy, r, extra);
  if (cands.length === 0) return ['BRAKE', 'BRAKE', 'BRAKE'];
  // 상대 예측: 어려움은 상대의 "정지 기준 최선"을 1단계 예측, 그 외는 대기로 가정
  const otherPlans: Record<string, Plan> = {};
  for (const o of ctx.others) otherPlans[o.id] = ['WAIT', 'WAIT', 'WAIT'];
  if (level === 'hard') {
    for (const o of ctx.others) {
      if (o.fallen) continue;
      const octx: BotContext = { ...ctx, me: o, others: [ctx.me, ...ctx.others.filter((x) => x !== o)], energy: 6, seed: ctx.seed + 17 };
      const oc = legalPlans(o.spec.build, 6, rng(ctx.seed + 3), 0).slice(0, 10);
      let best = oc[0], bs = -Infinity;
      const frozen: Record<string, Plan> = {};
      for (const x of octx.others) frozen[x.id] = ['WAIT', 'WAIT', 'WAIT'];
      for (const p of oc) { const v = evaluate(octx, p, frozen); if (v > bs) { bs = v; best = p; } }
      otherPlans[o.id] = best;
    }
  }
  const scored = cands.map((p) => ({ p, v: evaluate(ctx, p, otherPlans) })).sort((a, b) => b.v - a.v);
  if (level === 'easy') {
    if (r() < 0.3) return cands[Math.floor(r() * cands.length)];
    return scored[Math.min(scored.length - 1, Math.floor(r() * 4))].p;
  }
  if (level === 'normal' && r() < 0.15) return scored[Math.min(scored.length - 1, 1)].p;
  return scored[0].p;
}

/** 봇 빌드: 프리셋 순환 + 난도별 약간의 변형 */
export function buildForBot(index: number, level: BotLevel): RobotBuild {
  const base = PRESETS[index % PRESETS.length].build;
  const b: RobotBuild = { ...base, utilities: [...base.utilities] };
  if (level === 'easy' && b.utilities.length > 1) b.utilities = [b.utilities[0]];
  return b;
}

export const BOT_NAMES = ['고철 드론', '러스티', '스파크', '볼트 주니어', '너트크래커', '틴캔'];
