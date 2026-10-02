// 부품 정의 — 화면은 이 데이터를 그리기만 하고, 승패 규칙은 rules/physics 가 이 수치를 읽는다.
// 수치는 상대 단위(무게·힘·접지)이며 SI 실험 시뮬레이터가 아니다.

export type PartKind = 'chassis' | 'drive' | 'front' | 'utility';

export interface PartBase {
  id: string;
  kind: PartKind;
  name: string;
  short: string; // 한 줄 설명(초보용)
  mass: number;
  /** 카드에 보여줄 최대 3개 지표 (라벨, 1~5) */
  gauges: [string, number][];
}

export interface ChassisDef extends PartBase {
  kind: 'chassis';
  radius: number; // 물리 반지름(px, 경기장 1600x900 기준)
  energyMax: number;
  energyRegen: number;
  engineForce: number; // 기본 구동력 (가속 = force/mass)
  turnRate: number; // 회전 응답 (rad/s^2 계열 계수)
  /** 장착 위치 — 트리밍된 섀시 이미지 기준 (0..1) */
  hardpoints: { front: [number, number]; left: [number, number]; right: [number, number]; utilA: [number, number]; utilB: [number, number] };
  /** 섀시 이미지 표시 크기 = radius * spriteScale * 2 */
  spriteScale: number;
}

export interface DriveDef extends PartBase {
  kind: 'drive';
  grip: number; // 종방향 구동 한계 배수
  lateralGrip: number; // 횡방향 미끄럼 감쇠 배수
  forceMul: number; // 엔진 힘 배수
  turnMul: number; // 회전 응답 배수
  wheelScale: number; // 바퀴 이미지 스케일 (섀시 반지름 대비)
}

export interface FrontDef extends PartBase {
  kind: 'front';
  activeCost: number; // '전면 장치' 카드 에너지
  /** 범퍼: 충격량, 플라우: 밀기 배수, 자석: 인력 */
  power: number;
}

export interface UtilityDef extends PartBase {
  kind: 'utility';
  activeCost: number | null; // null 이면 상시(패시브)
  effect: 'brake' | 'boost' | 'stabilize' | 'armor';
  power: number;
}

export type PartDef = ChassisDef | DriveDef | FrontDef | UtilityDef;

export const CHASSIS: Record<string, ChassisDef> = {
  'RB-01': {
    id: 'RB-01', kind: 'chassis', name: '경량 섀시', short: '가볍고 빠르게 돈다. 밀리기 쉽다.',
    mass: 58, radius: 30, energyMax: 10, energyRegen: 4, engineForce: 34000, turnRate: 1.35, spriteScale: 1.18,
    gauges: [['무게', 1], ['에너지', 5], ['회전', 5]],
    hardpoints: { front: [0.5, 0.16], left: [0.14, 0.52], right: [0.86, 0.52], utilA: [0.32, 0.72], utilB: [0.68, 0.72] },
  },
  'RB-02': {
    id: 'RB-02', kind: 'chassis', name: '표준 섀시', short: '균형 잡힌 기본형.',
    mass: 82, radius: 34, energyMax: 9, energyRegen: 3, engineForce: 42000, turnRate: 1.0, spriteScale: 1.22,
    gauges: [['무게', 3], ['에너지', 4], ['회전', 3]],
    hardpoints: { front: [0.5, 0.18], left: [0.12, 0.55], right: [0.88, 0.55], utilA: [0.30, 0.74], utilB: [0.70, 0.74] },
  },
  'RB-03': {
    id: 'RB-03', kind: 'chassis', name: '중량 섀시', short: '무겁고 잘 안 밀린다. 느리게 돈다.',
    mass: 118, radius: 38, energyMax: 8, energyRegen: 3, engineForce: 52000, turnRate: 0.72, spriteScale: 1.28,
    gauges: [['무게', 5], ['에너지', 3], ['회전', 2]],
    hardpoints: { front: [0.5, 0.17], left: [0.10, 0.55], right: [0.90, 0.55], utilA: [0.30, 0.76], utilB: [0.70, 0.76] },
  },
};

export const DRIVES: Record<string, DriveDef> = {
  'DR-01': { id: 'DR-01', kind: 'drive', name: '일반 바퀴', short: '무난한 바퀴.', mass: 10, grip: 1.0, lateralGrip: 1.0, forceMul: 1.0, turnMul: 1.0, wheelScale: 1.05, gauges: [['접지', 3], ['가속', 4], ['회전', 3]] },
  'DR-02': { id: 'DR-02', kind: 'drive', name: '광폭 타이어', short: '접지력이 좋아 덜 미끄러진다.', mass: 16, grip: 1.35, lateralGrip: 1.6, forceMul: 0.92, turnMul: 0.85, wheelScale: 1.12, gauges: [['접지', 5], ['가속', 3], ['회전', 2]] },
  'DR-03': { id: 'DR-03', kind: 'drive', name: '무한궤도', short: '제자리 회전이 빠르고 잘 버틴다.', mass: 22, grip: 1.5, lateralGrip: 2.2, forceMul: 0.85, turnMul: 1.25, wheelScale: 1.0, gauges: [['접지', 5], ['가속', 2], ['회전', 5]] },
};

export const FRONTS: Record<string, FrontDef> = {
  'MD-01': { id: 'MD-01', kind: 'front', name: '용수철 범퍼', short: '가동 중 정면 충돌 시 상대를 강하게 튕긴다. 반동 있음.', mass: 12, activeCost: 3, power: 1.0, gauges: [['타격', 5], ['반동', 3], ['무게', 2]] },
  'MD-02': { id: 'MD-02', kind: 'front', name: '쐐기 플라우', short: '정면 밀기가 강하고 덜 밀린다. 가동하면 돌진.', mass: 16, activeCost: 2, power: 1.0, gauges: [['밀기', 4], ['방어', 4], ['무게', 3]] },
  'MD-03': { id: 'MD-03', kind: 'front', name: '전자석', short: '가동 중 앞쪽 로봇·캡슐을 끌어당긴다. 나도 끌려간다.', mass: 14, activeCost: 3, power: 1.0, gauges: [['인력', 5], ['사거리', 4], ['무게', 3]] },
};

export const UTILITIES: Record<string, UtilityDef> = {
  'MD-04': { id: 'MD-04', kind: 'utility', name: '고정 브레이크', short: '가동 슬롯 동안 바닥을 꽉 잡아 잘 안 밀린다.', mass: 8, activeCost: 2, effect: 'brake', power: 1.0, gauges: [['버티기', 5], ['무게', 1]] },
  'MD-05': { id: 'MD-05', kind: 'utility', name: '단발 부스터', short: '가동 순간 앞으로 폭발적으로 튀어나간다.', mass: 10, activeCost: 4, effect: 'boost', power: 1.0, gauges: [['순간가속', 5], ['에너지', 1]] },
  'MD-06': { id: 'MD-06', kind: 'utility', name: '안정화 장치', short: '상시: 미끄러짐과 충돌 흔들림이 줄어든다.', mass: 9, activeCost: null, effect: 'stabilize', power: 1.0, gauges: [['안정', 4], ['무게', 1]] },
  'MD-07': { id: 'MD-07', kind: 'utility', name: '보강판', short: '상시: 무게가 늘고 충격을 덜 받는다.', mass: 14, activeCost: null, effect: 'armor', power: 1.0, gauges: [['방어', 4], ['무게', 3]] },
};

export const ALL_PARTS: Record<string, PartDef> = { ...CHASSIS, ...DRIVES, ...FRONTS, ...UTILITIES };

/** 유효 조합의 공통 질량 예산 (섀시+주행+전면+보조 합) */
export const MASS_BUDGET = 190;

export interface RobotBuild {
  chassis: string;
  drive: string;
  front: string;
  utilities: string[]; // 0..2, 중복 불가
}

export interface BuildPreset { id: string; name: string; short: string; build: RobotBuild }

export const PRESETS: BuildPreset[] = [
  { id: 'preset-balanced', name: '올라운더', short: '표준 섀시 + 범퍼. 처음이면 이걸로.', build: { chassis: 'RB-02', drive: 'DR-01', front: 'MD-01', utilities: ['MD-06'] } },
  { id: 'preset-tank', name: '불도저', short: '중량 섀시 + 플라우 + 브레이크. 버티면서 밀어낸다.', build: { chassis: 'RB-03', drive: 'DR-03', front: 'MD-02', utilities: ['MD-04'] } },
  { id: 'preset-hunter', name: '자석 사냥꾼', short: '경량 섀시 + 전자석 + 부스터. 끌어서 떨어뜨린다.', build: { chassis: 'RB-01', drive: 'DR-02', front: 'MD-03', utilities: ['MD-05', 'MD-07'] } },
];

export function buildMass(b: RobotBuild): number {
  const c = CHASSIS[b.chassis], d = DRIVES[b.drive], f = FRONTS[b.front];
  if (!c || !d || !f) return Infinity;
  let m = c.mass + d.mass * 2 + f.mass;
  for (const u of b.utilities) { const ud = UTILITIES[u]; if (!ud) return Infinity; m += ud.mass; }
  return m;
}

export function validateBuild(b: RobotBuild): { ok: true } | { ok: false; reason: string } {
  if (!CHASSIS[b.chassis]) return { ok: false, reason: '섀시를 골라야 해요.' };
  if (!DRIVES[b.drive]) return { ok: false, reason: '주행 장치를 골라야 해요.' };
  if (!FRONTS[b.front]) return { ok: false, reason: '전면 장치를 골라야 해요.' };
  if (b.utilities.length > 2) return { ok: false, reason: '보조 장치는 최대 2개예요.' };
  if (new Set(b.utilities).size !== b.utilities.length) return { ok: false, reason: '같은 보조 장치를 두 번 달 수 없어요.' };
  for (const u of b.utilities) if (!UTILITIES[u]) return { ok: false, reason: '알 수 없는 보조 장치예요.' };
  const m = buildMass(b);
  if (m > MASS_BUDGET) return { ok: false, reason: `너무 무거워요 (${m}/${MASS_BUDGET}). 부품을 빼거나 가벼운 섀시로 바꿔요.` };
  return { ok: true };
}
