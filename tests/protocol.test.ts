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
    const r = commandCost('UTIL_A', passive); expect(r.cost).toBeNull(); if (r.cost === null) expect(r.reason).toMatch(/상시/);
  });
  it('프리셋 3종은 모두 유효한 빌드', () => {
    for (const p of PRESETS) expect(validateBuild(p.build).ok).toBe(true);
  });
});
