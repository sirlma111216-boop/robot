// 규칙 상수 — 시간과 점수는 데이터. 활성 게임은 시작 시점의 rulesVersion 을 고정한다.
export const RULES_VERSION = 'r1';
export const CONTENT_VERSION = 'c1';
export const PHYSICS_VERSION = 'p2';
export const PROTOCOL_VERSION = 1;

export interface TimingSettings {
  buildSeconds: number;
  planSeconds: number;
  introSeconds: number;
  resultSeconds: number;
  pitstopSeconds: number;
  podiumSeconds: number;
}

export const DEFAULT_TIMING: TimingSettings = {
  buildSeconds: 90,
  planSeconds: 25,
  introSeconds: 7,
  resultSeconds: 4,
  pitstopSeconds: 40,
  podiumSeconds: 0,
};

export const SLOT_COUNT = 3;
export const SLOT_SECONDS = 3;
export const BATTLE_SECONDS = SLOT_COUNT * SLOT_SECONDS; // 9
export const TURNS_PER_MATCH = 6;
export const PHYSICS_HZ = 60;
export const KEYFRAME_EVERY = 3; // 20Hz

export const SCORE = {
  crownSole: 3, // 전투 종료 시 왕관 영역 단독 점유
  pushOut: 2, // 상대를 낙하 구역으로 밀어낸 명확한 기여
  capsule: 1, // 고철 캡슐
  fallPenalty: 0, // 스스로 떨어져도 감점 없음(그 턴 휴식이 페널티)
};
export const PUSH_CREDIT_WINDOW_SEC = 2.5;

/** 경기 순위 포인트(인원별). index = 순위-1 */
export const RANK_POINTS: Record<number, number[]> = {
  2: [3, 1],
  3: [4, 2, 1],
  4: [5, 3, 2, 1],
  5: [6, 4, 3, 2, 1],
  6: [7, 5, 4, 3, 2, 1],
};

/** 전투 구간이 끝나면 정비 드론이 모든 로봇의 속도를 같은 비율로 줄인다(공개 규칙). */
export const TURN_END_VELOCITY_KEEP = 0.25;

/** 미제출 시 안전 명령 */
export const SAFE_PLAN = ['BRAKE', 'BRAKE', 'BRAKE'] as const;
