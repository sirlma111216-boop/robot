import { describe, it, expect } from 'vitest';
import { parseClientMessage, nicknameSchema } from '../packages/core/src/protocol/messages';
import { validatePlan, commandCost } from '../packages/core/src/rules/commands';
import { validateBuild, PRESETS } from '../packages/core/src/content/parts';

describe('프로토콜/규칙 검증', () => {
  it('메시지 스키마: 올바른 것은 통과, 잘못된 것은 한국어 오류', () => {
    expect(parseClientMessage({ t: 'lockPlan', plan: ['FWD', 'FWD', 'BRAKE'] }).ok).toBe(true);
    expect(parseClientMessage({ t: 'lockPlan', plan: ['FWD', 'FWD'] }).ok).toBe(false);
    expect(parseClientMessage({ t: 'lockPlan', plan: ['FLY', 'FWD', 'BRAKE'] }).ok).toBe(false);
    expect(parseClientMessage({ t: 'teacher:kick', playerId: 'x'.repeat(100) }).ok).toBe(false);
    const bad = parseClientMessage({ t: 'nope' });
    expect(bad.ok).toBe(false); if (!bad.ok) expect(bad.error).toMatch(/잘못된/);
  });
  it('닉네임 규칙', () => {
    expect(nicknameSchema.safeParse('번개민지').success).toBe(true);
    expect(nicknameSchema.safeParse('  ').success).toBe(false);
    expect(nicknameSchema.safeParse('<script>').success).toBe(false);
    expect(nicknameSchema.safeParse('열한글자넘는닉네임입니다').success).toBe(false);
  });
  it('명령 검증: 장치 없는 카드 사용 불가, 에너지 초과 거부, 부스터 1턴 1회', () => {
    const b = { chassis: 'RB-02', drive: 'DR-01', front: 'MD-01', utilities: ['MD-05'] };
    expect(commandCost('UTIL_B', b).cost).toBeNull();
    expect(validatePlan(['UTIL_A', 'UTIL_A', 'FWD'], b, 9).ok).toBe(false);
    expect(validatePlan(['FRONT', 'FRONT', 'FRONT'], b, 5).ok).toBe(false);
    expect(validatePlan(['FRONT', 'UTIL_A', 'FWD'], b, 9).ok).toBe(true);
    const passive = { ...b, utilities: ['MD-06'] };
    const r = commandCost('UTIL_A', passive); expect(r.cost).toBeNull(); if (r.cost === null) expect(r.reason).toMatch(/항상 작동/);
  });
  it('프로토타입 키(toString 등)로는 조립 검증을 통과할 수 없다', () => {
    for (const k of ['toString', 'valueOf', 'constructor', '__proto__']) {
      expect(validateBuild({ chassis: k, drive: 'DR-01', front: 'MD-01', utilities: [] }).ok).toBe(false);
      expect(validateBuild({ chassis: 'RB-02', drive: 'DR-01', front: 'MD-01', utilities: [k] }).ok).toBe(false);
    }
  });
  it('보이지 않는 문자·방향 제어 문자 닉네임 거부', () => {
    expect(nicknameSchema.safeParse('선생\u200b님').success).toBe(false);
    expect(nicknameSchema.safeParse('\u202e님생선').success).toBe(false);
    expect(nicknameSchema.safeParse('민지 2').success).toBe(true);
  });
  it('프리셋 3종은 모두 유효한 빌드', () => {
    for (const p of PRESETS) expect(validateBuild(p.build).ok).toBe(true);
  });
});
