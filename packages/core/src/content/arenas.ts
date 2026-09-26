// 경기장 정의 — 배경 이미지와 판정 오브젝트는 분리. 좌표는 논리 크기 1600x900 기준.
export const ARENA_W = 1600;
export const ARENA_H = 900;

export interface Rect { x: number; y: number; w: number; h: number } // 중심 기준
export interface Circle { x: number; y: number; r: number }

export interface ArenaDef {
  id: string;
  name: string;
  subtitle: string;
  bgImage: string; // AR-xx
  /** 플레이 가능한 바닥 사각형(벽은 이 경계) */
  bounds: Rect;
  /** 완충벽(정적 충돌체, PR-01) — angle 0 은 가로 */
  barriers: (Rect & { angle?: 0 | 90 })[];
  /** 낙하 구역(원 센서, PR-02 그림은 사각형이지만 판정은 원) */
  pits: Circle[];
  /** 왕관 코어(점유 원, PR-04) */
  crown: Circle;
  /** 컨베이어(영역, 벨트 속도 벡터 px/s, PR-03) */
  conveyors: (Rect & { vx: number; vy: number })[];
  /** 저마찰 패치(PR-07) */
  slick: Rect[];
  /** 출발 패드 6개 (PR-06). 위치와 초기 각도(라디안, 0=위) */
  startPads: { x: number; y: number; angle: number }[];
  /** 고철 캡슐 생성 규칙: 턴별 생성 위치 */
  capsuleSpawns: { turn: number; x: number; y: number }[];
}

const cx = ARENA_W / 2, cy = ARENA_H / 2;

function ring(n: number, rx: number, ry: number, startDeg = -60): { x: number; y: number; angle: number }[] {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    // 중앙을 바라보게: 화면 좌표에서 0=위(−y), 시계방향 양수
    const toCenter = Math.atan2(cx - x, -(cy - y));
    out.push({ x, y, angle: toCenter });
  }
  return out;
}

const bounds: Rect = { x: cx, y: cy, w: 1360, h: 720 };

export const ARENAS: Record<string, ArenaDef> = {
  'AR-01': {
    id: 'AR-01', name: '폐차장 예선', subtitle: '왕관을 지켜라. 양옆은 낭떠러지다.', bgImage: 'AR-01', bounds,
    barriers: [
      { x: cx, y: cy - 250, w: 280, h: 46 },
      { x: cx, y: cy + 250, w: 280, h: 46 },
    ],
    pits: [
      { x: cx - 600, y: cy, r: 78 },
      { x: cx + 600, y: cy, r: 78 },
    ],
    crown: { x: cx, y: cy, r: 105 },
    conveyors: [], slick: [],
    startPads: ring(6, 400, 250, -60),
    capsuleSpawns: [
      { turn: 1, x: cx - 300, y: cy - 120 }, { turn: 1, x: cx + 300, y: cy + 120 },
      { turn: 3, x: cx - 300, y: cy + 120 }, { turn: 3, x: cx + 300, y: cy - 120 },
      { turn: 5, x: cx, y: cy - 330 }, { turn: 5, x: cx, y: cy + 330 },
    ],
  },
  'AR-02': {
    id: 'AR-02', name: '강철 주조장', subtitle: '컨베이어가 밀고, 바닥은 미끄럽다.', bgImage: 'AR-02', bounds,
    barriers: [
      { x: cx - 420, y: cy, w: 46, h: 220, angle: 90 },
      { x: cx + 420, y: cy, w: 46, h: 220, angle: 90 },
    ],
    pits: [
      { x: cx - 520, y: cy - 250, r: 76 },
      { x: cx + 520, y: cy + 250, r: 76 },
    ],
    crown: { x: cx, y: cy, r: 105 },
    conveyors: [
      { x: cx, y: cy - 315, w: 560, h: 90, vx: 160, vy: 0 },
      { x: cx, y: cy + 315, w: 560, h: 90, vx: -160, vy: 0 },
    ],
    slick: [
      { x: cx - 200, y: cy, w: 170, h: 170 },
      { x: cx + 200, y: cy, w: 170, h: 170 },
    ],
    startPads: ring(6, 400, 250, -90),
    capsuleSpawns: [
      { turn: 1, x: cx, y: cy - 190 }, { turn: 1, x: cx, y: cy + 190 },
      { turn: 3, x: cx - 560, y: cy + 230 }, { turn: 3, x: cx + 560, y: cy - 230 },
      { turn: 5, x: cx - 330, y: cy - 160 }, { turn: 5, x: cx + 330, y: cy + 160 },
    ],
  },
  'AR-03': {
    id: 'AR-03', name: '네온 도크 결승', subtitle: '네 귀퉁이가 바다다. 왕관은 미끄러운 갑판 위.', bgImage: 'AR-03', bounds,
    barriers: [
      { x: cx - 250, y: cy - 200, w: 200, h: 44 },
      { x: cx + 250, y: cy + 200, w: 200, h: 44 },
      { x: cx + 250, y: cy - 200, w: 200, h: 44 },
      { x: cx - 250, y: cy + 200, w: 200, h: 44 },
    ],
    pits: [
      { x: cx - 560, y: cy - 250, r: 74 }, { x: cx + 560, y: cy - 250, r: 74 },
      { x: cx - 560, y: cy + 250, r: 74 }, { x: cx + 560, y: cy + 250, r: 74 },
    ],
    crown: { x: cx, y: cy, r: 105 },
    conveyors: [],
    slick: [{ x: cx, y: cy, w: 260, h: 260 }],
    startPads: ring(6, 400, 250, -90),
    capsuleSpawns: [
      { turn: 1, x: cx - 560, y: cy }, { turn: 1, x: cx + 560, y: cy },
      { turn: 2, x: cx, y: cy - 320 }, { turn: 2, x: cx, y: cy + 320 },
      { turn: 4, x: cx - 330, y: cy }, { turn: 4, x: cx + 330, y: cy },
      { turn: 6, x: cx, y: cy },
    ],
  },
};

/** 챕터 순서 — 3경기 대회 */
export const CHAPTERS = ['AR-01', 'AR-02', 'AR-03'] as const;
