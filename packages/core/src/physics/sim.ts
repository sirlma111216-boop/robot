// 헤드리스 2D 탑다운 물리 — 서버(Durable Object)와 솔로(브라우저)가 같은 코드를 실행한다.
// 로봇은 원형 강체(섀시 반지름) 하나로 계산하고, 전면 장치는 "정면 원뿔" 규칙으로 작동한다.
// 접지 모델(구동 한계·횡방향 미끄럼·제동 저항)은 충돌 마찰과 별개로 구현한다.
import type { ArenaDef, Rect } from '../content/arenas';
import { ARENA_W, ARENA_H } from '../content/arenas';
import { PHYSICS_VERSION, PHYSICS_HZ, KEYFRAME_EVERY, SLOT_COUNT, SLOT_SECONDS, SCORE, PUSH_CREDIT_WINDOW_SEC, TURN_END_VELOCITY_KEEP } from '../content/rules';
import type { Plan, RobotSpec, CommandId } from '../rules/commands';

export interface RobotSimState {
  id: string; // 팀 id
  spec: RobotSpec;
  x: number; y: number; angle: number; // angle: 0 = 위(−y), 시계방향 양수
  vx: number; vy: number; w: number;
  fallen: boolean; // 이번 턴 낙하하여 정비 구역에서 대기 중
  padIndex: number; // 복귀할 출발 패드
}
export interface CapsuleState { id: string; x: number; y: number; vx: number; vy: number; taken: boolean }

export interface SegmentInput {
  arena: ArenaDef;
  turn: number;
  robots: RobotSimState[];
  capsules: CapsuleState[];
  plans: Record<string, Plan>;
  seed: number;
}

export type SimEvent =
  | { t: number; type: 'slot'; index: number }
  | { t: number; type: 'hit'; a: string; b: string; x: number; y: number; impulse: number }
  | { t: number; type: 'wall'; id: string; x: number; y: number; impulse: number }
  | { t: number; type: 'bumper'; id: string; target: string; x: number; y: number }
  | { t: number; type: 'magnet'; id: string; on: boolean }
  | { t: number; type: 'boost'; id: string }
  | { t: number; type: 'brake'; id: string }
  | { t: number; type: 'fall'; id: string; by?: string; x: number; y: number }
  | { t: number; type: 'pickup'; id: string; capsuleId: string; x: number; y: number }
  | { t: number; type: 'crown'; id: string | null; contested: string[] }
  | { t: number; type: 'score'; id: string; delta: number; reason: 'crown' | 'push' | 'capsule' };

export interface Keyframe { t: number; p: number[] }
export interface SegmentResult {
  physicsVersion: string;
  duration: number;
  bodies: { id: string; kind: 'robot' | 'capsule' }[];
  frames: Keyframe[];
  events: SimEvent[];
  robots: RobotSimState[]; // 구간 종료 상태(속도 안정화 적용 후)
  capsules: CapsuleState[];
  scores: Record<string, number>; // 로봇별 이 구간 득점
}

// ---- 상수 (상대 단위) ----
const DT = 1 / PHYSICS_HZ;
const MAX_SPEED = 560;
const A_MAX_GRIP = 330; // grip 1.0 일 때 엔진 가속 상한
const V_ENGINE_MAX = 145; // 엔진만으로 도달하는 최고 속도(부스터·충돌은 초과 가능)
const OVERSPEED_DRAG = 260; // 엔진 최고 속도 초과분 감속
const ROLLING = 95; // 굴림 저항 감속
const BRAKE_DECEL = 900;
const LATERAL_K = 5.5; // 횡방향 미끄럼 감쇠 (×lateralGrip)
const ANG_DAMP = 3.0;
const MAX_ANG_VEL = 4.2;
const RESTITUTION_ROBOT = 0.32;
const RESTITUTION_WALL = 0.36;
const J_BUMPER = 30000;
const MAGNET_RANGE = 320;
const MAGNET_CONE = (55 * Math.PI) / 180;
const MAGNET_K = 3.0e6;
const MAGNET_FMAX = 30000;
const BOOST_DV = 250;
const CAPSULE_R = 18;
const CAPSULE_MASS = 6;
const FRONT_CONE = (48 * Math.PI) / 180;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const fwdX = (a: number) => Math.sin(a);
const fwdY = (a: number) => -Math.cos(a);
const inRect = (x: number, y: number, r: Rect) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(y - r.y) <= r.h / 2;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

interface Live extends RobotSimState {
  cmd: CommandId;
  targetAngle: number;
  bumperArmed: boolean;
  bumperUsed: boolean;
  magnetOn: boolean;
  plowRam: boolean;
  brakeUtil: boolean;
  braking: boolean;
  lastHitBy: string | null;
  lastHitAt: number;
  score: number;
}

export function runSegment(input: SegmentInput): SegmentResult {
  const { arena, plans } = input;
  const rand = mulberry32(input.seed);
  const events: SimEvent[] = [];
  const frames: Keyframe[] = [];
  const robots: Live[] = input.robots.map((r) => ({
    ...r, cmd: 'WAIT', targetAngle: r.angle, bumperArmed: false, bumperUsed: false, magnetOn: false, plowRam: false,
    brakeUtil: false, braking: false, lastHitBy: null, lastHitAt: -99, score: 0,
  }));
  const capsules: CapsuleState[] = input.capsules.map((c) => ({ ...c }));
  const bodies = [
    ...robots.map((r) => ({ id: r.id, kind: 'robot' as const })),
    ...capsules.map((c) => ({ id: c.id, kind: 'capsule' as const })),
  ];
  const bounds = arena.bounds;
  const minX = bounds.x - bounds.w / 2, maxX = bounds.x + bounds.w / 2;
  const minY = bounds.y - bounds.h / 2, maxY = bounds.y + bounds.h / 2;

  const pushFrame = (t: number) => {
    const p: number[] = [];
    for (const r of robots) p.push(r1(r.x), r1(r.y), r3(r.angle));
    for (const c of capsules) p.push(c.taken ? -1000 : r1(c.x), c.taken ? -1000 : r1(c.y));
    frames.push({ t: r3(t), p });
  };

  const addScore = (r: Live, delta: number, reason: 'crown' | 'push' | 'capsule', t: number) => {
    r.score += delta;
    events.push({ t: r3(t), type: 'score', id: r.id, delta, reason });
  };

  const framesPerSlot = SLOT_SECONDS * PHYSICS_HZ;
  let frame = 0;
  pushFrame(0);

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const tSlot = slot * SLOT_SECONDS;
    events.push({ t: tSlot, type: 'slot', index: slot });
    // 슬롯 시작: 명령 적용
    for (const r of robots) {
      if (r.fallen) continue;
      const plan = plans[r.id];
      const cmd: CommandId = plan?.[slot] ?? 'BRAKE';
      r.cmd = cmd;
      r.bumperArmed = false; r.bumperUsed = false; r.plowRam = false; r.brakeUtil = false; r.braking = false;
      if (r.magnetOn) { r.magnetOn = false; events.push({ t: tSlot, type: 'magnet', id: r.id, on: false }); }
      if (cmd === 'LEFT') r.targetAngle = r.angle - Math.PI / 2;
      else if (cmd === 'RIGHT') r.targetAngle = r.angle + Math.PI / 2;
      else r.targetAngle = r.angle;
      if (cmd === 'BRAKE') r.braking = true;
      if (cmd === 'FRONT') {
        if (r.spec.front === 'MD-01') r.bumperArmed = true;
        else if (r.spec.front === 'MD-02') r.plowRam = true;
        else if (r.spec.front === 'MD-03') { r.magnetOn = true; events.push({ t: tSlot, type: 'magnet', id: r.id, on: true }); }
      }
      if (cmd === 'UTIL_A' || cmd === 'UTIL_B') {
        const uid = r.spec.utilities[cmd === 'UTIL_A' ? 0 : 1];
        if (uid === 'MD-04') { r.brakeUtil = true; events.push({ t: tSlot, type: 'brake', id: r.id }); }
        if (uid === 'MD-05') {
          r.vx += fwdX(r.angle) * BOOST_DV; r.vy += fwdY(r.angle) * BOOST_DV;
          events.push({ t: tSlot, type: 'boost', id: r.id });
        }
      }
    }

    for (let f = 0; f < framesPerSlot; f++) {
      const t = frame * DT;
      // ---- 힘/구동 ----
      for (const r of robots) {
        if (r.fallen) continue;
        const slick = arena.slick.some((s) => inRect(r.x, r.y, s));
        const gripMul = slick ? 0.3 : 1;
        const latMul = slick ? 0.22 : 1;
        const rollMul = slick ? 0.2 : 1;
        const fx = fwdX(r.angle), fy = fwdY(r.angle);
        const boostSlot = (r.cmd === 'UTIL_A' && r.spec.utilities[0] === 'MD-05') || (r.cmd === 'UTIL_B' && r.spec.utilities[1] === 'MD-05');
        let drive = 0;
        if (r.cmd === 'FWD' || boostSlot) drive = 1;
        else if (r.cmd === 'BACK') drive = -0.7;
        if (r.plowRam) drive = 1.6;
        if (drive !== 0) {
          let acc = Math.min(r.spec.engineForce / r.spec.mass, A_MAX_GRIP * r.spec.grip * gripMul);
          const vAlong = (r.vx * fx + r.vy * fy) * Math.sign(drive);
          const vmax = V_ENGINE_MAX * Math.min(1.6, Math.abs(drive));
          acc *= drive * Math.max(0, 1 - vAlong / vmax);
          r.vx += fx * acc * DT; r.vy += fy * acc * DT;
        }
        // 회전 (PD, 토크 한계)
        const err = r.targetAngle - r.angle;
        const maxAngAcc = 7.5 * r.spec.turnRate;
        let angAcc = 26 * err - 9 * r.w;
        angAcc = Math.max(-maxAngAcc, Math.min(maxAngAcc, angAcc));
        r.w += angAcc * DT;
        r.w *= Math.max(0, 1 - ANG_DAMP * DT * 0.35);
        r.w = Math.max(-MAX_ANG_VEL, Math.min(MAX_ANG_VEL, r.w));
        // 접지: 종/횡 분해
        const vLong = r.vx * fx + r.vy * fy;
        const lx = -fy, ly = fx; // 좌측 벡터
        let vLat = r.vx * lx + r.vy * ly;
        const latK = LATERAL_K * r.spec.lateralGrip * latMul * (r.brakeUtil ? 3 : 1);
        vLat *= Math.max(0, 1 - latK * DT);
        let vL = vLong;
        let decel = ROLLING * rollMul;
        if (r.braking) decel += BRAKE_DECEL * gripMul;
        if (r.brakeUtil) decel += BRAKE_DECEL * 1.6 * gripMul;
        if (drive === 0 || r.braking) {
          const d = decel * DT;
          if (Math.abs(vL) <= d) vL = 0; else vL -= Math.sign(vL) * d;
        } else if (Math.abs(vL) > V_ENGINE_MAX * 1.7) {
          vL -= Math.sign(vL) * OVERSPEED_DRAG * DT;
        }
        r.vx = fx * vL + lx * vLat; r.vy = fy * vL + ly * vLat;
        // 컨베이어
        for (const c of arena.conveyors) if (inRect(r.x, r.y, c)) {
          r.vx += (c.vx - r.vx) * 2.5 * DT * (r.brakeUtil ? 0.3 : 1);
          r.vy += (c.vy - r.vy) * 2.5 * DT * (r.brakeUtil ? 0.3 : 1);
        }
      }
      // ---- 자석 ----
      for (const r of robots) {
        if (r.fallen || !r.magnetOn) continue;
        const fx = fwdX(r.angle), fy = fwdY(r.angle);
        const pull = (tx: number, ty: number, tmass: number, isCapsule: boolean) => {
          const dx = tx - r.x, dy = ty - r.y; const d = Math.hypot(dx, dy);
          if (d > MAGNET_RANGE || d < 1) return null;
          const cos = (dx * fx + dy * fy) / d;
          if (cos < Math.cos(MAGNET_CONE)) return null;
          const F = Math.min(MAGNET_FMAX, MAGNET_K / Math.max(d, 80));
          const nx = dx / d, ny = dy / d;
          let accT = F / tmass; if (isCapsule) accT = Math.min(accT, 1400);
          const accS = F / r.spec.mass;
          return { nx, ny, accT, accS };
        };
        for (const o of robots) {
          if (o === r || o.fallen) continue;
          const p = pull(o.x, o.y, o.spec.mass * (o.brakeUtil ? 2.2 : 1), false);
          if (!p) continue;
          o.vx -= p.nx * p.accT * DT; o.vy -= p.ny * p.accT * DT;
          r.vx += p.nx * p.accS * DT; r.vy += p.ny * p.accS * DT; // 반작용
          o.lastHitBy = r.id; o.lastHitAt = t;
        }
        for (const c of capsules) {
          if (c.taken) continue;
          const p = pull(c.x, c.y, CAPSULE_MASS, true);
          if (!p) continue;
          c.vx -= p.nx * p.accT * DT; c.vy -= p.ny * p.accT * DT;
        }
      }
      // ---- 속도 상한 & 적분 ----
      for (const r of robots) {
        if (r.fallen) continue;
        const s = Math.hypot(r.vx, r.vy);
        if (s > MAX_SPEED) { r.vx *= MAX_SPEED / s; r.vy *= MAX_SPEED / s; }
        r.x += r.vx * DT; r.y += r.vy * DT; r.angle += r.w * DT;
      }
      for (const c of capsules) {
        if (c.taken) continue;
        c.vx *= 0.9; c.vy *= 0.9;
        c.x += c.vx * DT; c.y += c.vy * DT;
        c.x = Math.max(minX + CAPSULE_R, Math.min(maxX - CAPSULE_R, c.x));
        c.y = Math.max(minY + CAPSULE_R, Math.min(maxY - CAPSULE_R, c.y));
      }
      // ---- 충돌: 로봇-로봇 ----
      for (let i = 0; i < robots.length; i++) {
        const a = robots[i]; if (a.fallen) continue;
        for (let j = i + 1; j < robots.length; j++) {
          const b = robots[j]; if (b.fallen) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy); const minD = a.spec.radius + b.spec.radius;
          if (d >= minD || d === 0) continue;
          const nx = dx / d, ny = dy / d;
          const ma = a.spec.mass * (a.brakeUtil ? 2.2 : 1) * (a.braking ? 1.25 : 1);
          const mb = b.spec.mass * (b.brakeUtil ? 2.2 : 1) * (b.braking ? 1.25 : 1);
          // 분리
          const pen = minD - d; const tot = ma + mb;
          a.x -= nx * pen * (mb / tot); a.y -= ny * pen * (mb / tot);
          b.x += nx * pen * (ma / tot); b.y += ny * pen * (ma / tot);
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const vn = rvx * nx + rvy * ny;
          if (vn > 0) continue; // 이미 분리 중
          let j0 = (-(1 + RESTITUTION_ROBOT) * vn) / (1 / ma + 1 / mb);
          // 정면 판정
          const aFront = fwdX(a.angle) * nx + fwdY(a.angle) * ny > Math.cos(FRONT_CONE);
          const bFront = fwdX(b.angle) * -nx + fwdY(b.angle) * -ny > Math.cos(FRONT_CONE);
          let ja = j0, jb = j0; // a 는 -n, b 는 +n 방향으로 받음
          if (aFront && a.spec.front === 'MD-02') { jb *= 1.25; ja *= 0.7; }
          if (bFront && b.spec.front === 'MD-02') { ja *= 1.25; jb *= 0.7; }
          ja *= a.spec.armorMul; jb *= b.spec.armorMul;
          a.vx -= (nx * ja) / ma; a.vy -= (ny * ja) / ma;
          b.vx += (nx * jb) / mb; b.vy += (ny * jb) / mb;
          const cxp = a.x + nx * a.spec.radius, cyp = a.y + ny * a.spec.radius;
          if (j0 > 900) {
            events.push({ t: r3(t), type: 'hit', a: a.id, b: b.id, x: r1(cxp), y: r1(cyp), impulse: Math.round(j0) });
            a.lastHitBy = b.id; a.lastHitAt = t; b.lastHitBy = a.id; b.lastHitAt = t;
            const jolt = Math.min(1.6, j0 / 22000);
            a.w += (rand() - 0.5) * 2 * jolt * (a.spec.stabilize ? 0.4 : 1);
            b.w += (rand() - 0.5) * 2 * jolt * (b.spec.stabilize ? 0.4 : 1);
          }
          // 범퍼 방출
          if (a.bumperArmed && !a.bumperUsed && aFront) {
            a.bumperUsed = true;
            const J = J_BUMPER * b.spec.armorMul;
            b.vx += (nx * J) / mb; b.vy += (ny * J) / mb;
            a.vx -= (nx * J * 0.45) / ma; a.vy -= (ny * J * 0.45) / ma;
            b.lastHitBy = a.id; b.lastHitAt = t;
            events.push({ t: r3(t), type: 'bumper', id: a.id, target: b.id, x: r1(cxp), y: r1(cyp) });
          }
          if (b.bumperArmed && !b.bumperUsed && bFront) {
            b.bumperUsed = true;
            const J = J_BUMPER * a.spec.armorMul;
            a.vx -= (nx * J) / ma; a.vy -= (ny * J) / ma;
            b.vx += (nx * J * 0.45) / mb; b.vy += (ny * J * 0.45) / mb;
            a.lastHitBy = b.id; a.lastHitAt = t;
            events.push({ t: r3(t), type: 'bumper', id: b.id, target: a.id, x: r1(cxp), y: r1(cyp) });
          }
        }
      }
      // ---- 충돌: 로봇-캡슐(획득) ----
      for (const r of robots) {
        if (r.fallen) continue;
        for (const c of capsules) {
          if (c.taken) continue;
          if (Math.hypot(c.x - r.x, c.y - r.y) < r.spec.radius + CAPSULE_R * 0.6) {
            c.taken = true;
            events.push({ t: r3(t), type: 'pickup', id: r.id, capsuleId: c.id, x: r1(c.x), y: r1(c.y) });
            addScore(r, SCORE.capsule, 'capsule', t);
          }
        }
      }
      // ---- 충돌: 벽/완충벽 ----
      for (const r of robots) {
        if (r.fallen) continue;
        const R = r.spec.radius;
        const m = r.spec.mass;
        const hitWall = (nx: number, ny: number) => {
          const vn = r.vx * nx + r.vy * ny;
          if (vn < 0) {
            const j = -(1 + RESTITUTION_WALL) * vn * m;
            r.vx += nx * j / m; r.vy += ny * j / m;
            if (j > 1800) events.push({ t: r3(t), type: 'wall', id: r.id, x: r1(r.x - nx * R), y: r1(r.y - ny * R), impulse: Math.round(j) });
          }
        };
        if (r.x - R < minX) { r.x = minX + R; hitWall(1, 0); }
        if (r.x + R > maxX) { r.x = maxX - R; hitWall(-1, 0); }
        if (r.y - R < minY) { r.y = minY + R; hitWall(0, 1); }
        if (r.y + R > maxY) { r.y = maxY - R; hitWall(0, -1); }
        for (const b of arena.barriers) {
          const hw = b.w / 2, hh = b.h / 2;
          const qx = Math.max(b.x - hw, Math.min(b.x + hw, r.x));
          const qy = Math.max(b.y - hh, Math.min(b.y + hh, r.y));
          const dx = r.x - qx, dy = r.y - qy; const d = Math.hypot(dx, dy);
          if (d >= R) continue;
          let nx: number, ny: number;
          if (d > 1e-6) { nx = dx / d; ny = dy / d; } else {
            // 중심이 내부: 가장 가까운 면으로 밀어냄
            const px = hw - Math.abs(r.x - b.x), py = hh - Math.abs(r.y - b.y);
            if (px < py) { nx = Math.sign(r.x - b.x) || 1; ny = 0; } else { nx = 0; ny = Math.sign(r.y - b.y) || 1; }
          }
          r.x = qx + nx * R; r.y = qy + ny * R;
          hitWall(nx, ny);
        }
      }
      // ---- 낙하 ----
      for (const r of robots) {
        if (r.fallen) continue;
        for (const p of arena.pits) {
          if (Math.hypot(r.x - p.x, r.y - p.y) < p.r - r.spec.radius * 0.25) {
            r.fallen = true; r.vx = 0; r.vy = 0; r.w = 0;
            const by = r.lastHitBy && t - r.lastHitAt <= PUSH_CREDIT_WINDOW_SEC ? r.lastHitBy : undefined;
            events.push({ t: r3(t), type: 'fall', id: r.id, by, x: r1(p.x), y: r1(p.y) });
            r.x = p.x; r.y = p.y;
            if (by) { const att = robots.find((o) => o.id === by); if (att) addScore(att, SCORE.pushOut, 'push', t); }
            break;
          }
        }
      }
      frame++;
      if (frame % KEYFRAME_EVERY === 0) pushFrame(frame * DT);
    }
  }
  const tEnd = frame * DT;
  if (frame % KEYFRAME_EVERY !== 0) pushFrame(tEnd);
  // ---- 왕관 판정 ----
  const inCrown = robots.filter((r) => !r.fallen && Math.hypot(r.x - arena.crown.x, r.y - arena.crown.y) < arena.crown.r);
  if (inCrown.length === 1) {
    events.push({ t: r3(tEnd), type: 'crown', id: inCrown[0].id, contested: [] });
    addScore(inCrown[0], SCORE.crownSole, 'crown', tEnd);
  } else events.push({ t: r3(tEnd), type: 'crown', id: null, contested: inCrown.map((r) => r.id) });
  // ---- 구간 종료: 정비 드론 안정화(공개 규칙, 전원 동일) ----
  const scores: Record<string, number> = {};
  const outRobots: RobotSimState[] = robots.map((r) => {
    scores[r.id] = r.score;
    return {
      id: r.id, spec: r.spec, x: r.x, y: r.y, angle: r.angle,
      vx: r.vx * TURN_END_VELOCITY_KEEP, vy: r.vy * TURN_END_VELOCITY_KEEP, w: 0,
      fallen: r.fallen, padIndex: r.padIndex,
    };
  });
  return { physicsVersion: PHYSICS_VERSION, duration: r3(tEnd), bodies, frames, events, robots: outRobots, capsules, scores };
}

/** 낙하한 로봇을 다음 턴 시작 시 출발 패드로 복귀시킨다. 패드가 막혀 있으면 가장 가까운 빈 곳. */
export function respawnFallen(arena: ArenaDef, robots: RobotSimState[]): RobotSimState[] {
  return robots.map((r) => {
    if (!r.fallen) return r;
    const pad = arena.startPads[r.padIndex % arena.startPads.length];
    let x = pad.x, y = pad.y;
    const others = robots.filter((o) => o !== r && !o.fallen);
    for (let tries = 0; tries < 12; tries++) {
      const blocked = others.some((o) => Math.hypot(o.x - x, o.y - y) < o.spec.radius + r.spec.radius + 6);
      if (!blocked) break;
      const a = (tries * Math.PI * 2) / 6;
      x = pad.x + Math.cos(a) * 90 * (1 + Math.floor(tries / 6));
      y = pad.y + Math.sin(a) * 90 * (1 + Math.floor(tries / 6));
      x = Math.max(60, Math.min(ARENA_W - 60, x)); y = Math.max(60, Math.min(ARENA_H - 60, y));
    }
    return { ...r, x, y, angle: pad.angle, vx: 0, vy: 0, w: 0, fallen: false };
  });
}

/** 상대 명령이 공개되지 않은 상태에서의 내 예상 경로(점선용). 다른 로봇은 없는 것으로 계산. */
export function previewPath(arena: ArenaDef, robot: RobotSimState, plan: Plan): { x: number; y: number }[] {
  const res = runSegment({ arena, turn: 0, robots: [{ ...robot, fallen: false }], capsules: [], plans: { [robot.id]: plan }, seed: 1 });
  return res.frames.filter((_, i) => i % 2 === 0).map((f) => ({ x: f.p[0], y: f.p[1] }));
}
