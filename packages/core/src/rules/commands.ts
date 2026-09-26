import { CHASSIS, DRIVES, FRONTS, UTILITIES, type RobotBuild } from '../content/parts';
import { SLOT_COUNT } from '../content/rules';

export type CommandId = 'FWD' | 'BACK' | 'LEFT' | 'RIGHT' | 'BRAKE' | 'FRONT' | 'UTIL_A' | 'UTIL_B' | 'WAIT';
export type Plan = CommandId[]; // 길이 SLOT_COUNT

export const COMMAND_IDS: CommandId[] = ['FWD', 'BACK', 'LEFT', 'RIGHT', 'BRAKE', 'FRONT', 'UTIL_A', 'UTIL_B', 'WAIT'];

export interface CommandCard { id: CommandId; label: string; hint: string; baseCost: number }

export const COMMAND_CARDS: Record<CommandId, CommandCard> = {
  FWD: { id: 'FWD', label: '전진', hint: '3초 동안 앞으로 민다', baseCost: 1 },
  BACK: { id: 'BACK', label: '후진', hint: '3초 동안 뒤로 민다 (약함)', baseCost: 1 },
  LEFT: { id: 'LEFT', label: '좌회전', hint: '왼쪽으로 90° 돈다', baseCost: 1 },
  RIGHT: { id: 'RIGHT', label: '우회전', hint: '오른쪽으로 90° 돈다', baseCost: 1 },
  BRAKE: { id: 'BRAKE', label: '제동', hint: '멈추고 버틴다', baseCost: 0 },
  FRONT: { id: 'FRONT', label: '전면 장치', hint: '범퍼·플라우·자석을 가동한다', baseCost: 0 },
  UTIL_A: { id: 'UTIL_A', label: '보조 1', hint: '보조 장치 1을 가동한다', baseCost: 0 },
  UTIL_B: { id: 'UTIL_B', label: '보조 2', hint: '보조 장치 2를 가동한다', baseCost: 0 },
  WAIT: { id: 'WAIT', label: '대기', hint: '아무것도 하지 않는다 (관성만)', baseCost: 0 },
};

/** 빌드 기준 명령 비용. 사용할 수 없는 카드는 null (이유 포함) */
export function commandCost(cmd: CommandId, build: RobotBuild): { cost: number } | { cost: null; reason: string } {
  const card = COMMAND_CARDS[cmd];
  if (cmd === 'FRONT') {
    const f = FRONTS[build.front];
    if (!f) return { cost: null, reason: '전면 장치가 없어요' };
    return { cost: f.activeCost };
  }
  if (cmd === 'UTIL_A' || cmd === 'UTIL_B') {
    const u = UTILITIES[build.utilities[cmd === 'UTIL_A' ? 0 : 1] ?? ''];
    if (!u) return { cost: null, reason: cmd === 'UTIL_A' ? '보조 장치 1이 없어요' : '보조 장치 2가 없어요' };
    if (u.activeCost === null) return { cost: null, reason: `${u.name}은(는) 상시 작동이라 카드가 필요 없어요` };
    return { cost: u.activeCost };
  }
  return { cost: card.baseCost };
}

export function planCost(plan: Plan, build: RobotBuild): number {
  let c = 0;
  for (const cmd of plan) { const r = commandCost(cmd, build); if (r.cost === null) return Infinity; c += r.cost; }
  return c;
}

export function validatePlan(plan: unknown, build: RobotBuild, energy: number): { ok: true; plan: Plan } | { ok: false; reason: string } {
  if (!Array.isArray(plan) || plan.length !== SLOT_COUNT) return { ok: false, reason: `명령은 ${SLOT_COUNT}개여야 해요` };
  for (const c of plan) if (!COMMAND_IDS.includes(c as CommandId)) return { ok: false, reason: '알 수 없는 명령이 있어요' };
  const p = plan as Plan;
  for (const c of p) { const r = commandCost(c, build); if (r.cost === null) return { ok: false, reason: r.reason }; }
  // 단발 부스터는 한 턴에 한 번만
  const boostIdx = build.utilities.findIndex((u) => u === 'MD-05');
  if (boostIdx >= 0) {
    const key: CommandId = boostIdx === 0 ? 'UTIL_A' : 'UTIL_B';
    if (p.filter((c) => c === key).length > 1) return { ok: false, reason: '단발 부스터는 한 턴에 한 번만 쓸 수 있어요' };
  }
  const cost = planCost(p, build);
  if (cost > energy) return { ok: false, reason: `에너지가 부족해요 (${cost}/${energy})` };
  return { ok: true, plan: p };
}

/** 로봇 파생 성능 (물리·봇·화면이 공통으로 사용) */
export interface RobotSpec {
  build: RobotBuild;
  mass: number;
  radius: number;
  inertia: number;
  engineForce: number;
  turnRate: number;
  grip: number;
  lateralGrip: number;
  energyMax: number;
  energyRegen: number;
  front: 'MD-01' | 'MD-02' | 'MD-03';
  utilities: string[];
  armorMul: number; // 받는 충격 배수
  stabilize: boolean;
}

export function deriveSpec(build: RobotBuild): RobotSpec {
  const c = CHASSIS[build.chassis], d = DRIVES[build.drive], f = FRONTS[build.front];
  let mass = c.mass + d.mass * 2 + f.mass;
  let armorMul = 1;
  let stabilize = false;
  let lateralGrip = d.lateralGrip;
  let turnRate = c.turnRate * d.turnMul;
  for (const u of build.utilities) {
    const ud = UTILITIES[u];
    mass += ud.mass;
    if (ud.effect === 'armor') armorMul *= 0.8;
    if (ud.effect === 'stabilize') { stabilize = true; lateralGrip *= 1.4; turnRate *= 1.1; }
  }
  if (f.id === 'MD-02') armorMul *= 0.9;
  return {
    build, mass, radius: c.radius, inertia: 0.5 * mass * c.radius * c.radius,
    engineForce: c.engineForce * d.forceMul, turnRate, grip: d.grip, lateralGrip,
    energyMax: c.energyMax, energyRegen: c.energyRegen,
    front: f.id as RobotSpec['front'], utilities: [...build.utilities], armorMul, stabilize,
  };
}
