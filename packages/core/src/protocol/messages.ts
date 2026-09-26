// 클라이언트 → 서버 메시지 스키마 (서버에서 검증). 서버 → 클라이언트는 host/types 의 View 타입을 사용.
import { z } from 'zod';
import { COMMAND_IDS } from '../rules/commands';

export const NICK_MIN = 1;
export const NICK_MAX = 10;
export const nicknameSchema = z.string().trim().min(NICK_MIN, '닉네임을 입력해요').max(NICK_MAX, `닉네임은 ${NICK_MAX}자까지예요`).regex(/^[^<>"'`\\]+$/, '사용할 수 없는 문자가 있어요');

export const buildSchema = z.object({
  chassis: z.string().max(8),
  drive: z.string().max(8),
  front: z.string().max(8),
  utilities: z.array(z.string().max(8)).max(2),
});

export const planSchema = z.array(z.enum(COMMAND_IDS as [string, ...string[]])).length(3);

export const EMOTES = ['👍', '🔥', '😱', '🤝', '🎯', '💥'] as const;

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello') }),
  z.object({ t: z.literal('ping'), c: z.number() }),
  z.object({ t: z.literal('joinTeam'), teamId: z.string().max(16) }),
  z.object({ t: z.literal('leaveTeam') }),
  z.object({ t: z.literal('setBuild'), build: buildSchema }),
  z.object({ t: z.literal('suggestPart'), partId: z.string().max(8) }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  z.object({ t: z.literal('proposePlan'), plan: planSchema }),
  z.object({ t: z.literal('votePlan'), proposalId: z.string().max(24) }),
  z.object({ t: z.literal('lockPlan'), plan: planSchema }),
  z.object({ t: z.literal('unlockPlan') }),
  z.object({ t: z.literal('emote'), emote: z.enum(EMOTES) }),
  z.object({ t: z.literal('getSegment'), segmentId: z.string().max(32) }),
  z.object({ t: z.literal('renameTeam'), name: z.string().trim().min(1).max(12) }),
  // ---- 교사 전용 ----
  z.object({ t: z.literal('teacher:setSettings'), settings: z.object({
    matches: z.union([z.literal(1), z.literal(3)]).optional(),
    buildSeconds: z.number().int().min(30).max(300).optional(),
    planSeconds: z.number().int().min(10).max(90).optional(),
    pitstopSeconds: z.number().int().min(15).max(180).optional(),
    maxTeamSize: z.number().int().min(1).max(10).optional(),
    autoAdvance: z.boolean().optional(),
    allowSpectateTeams: z.boolean().optional(),
    botLevel: z.enum(['easy', 'normal', 'hard']).optional(),
  }) }),
  z.object({ t: z.literal('teacher:assignLeader'), playerId: z.string().max(24), teamId: z.string().max(16).optional() }),
  z.object({ t: z.literal('teacher:removeTeam'), teamId: z.string().max(16) }),
  z.object({ t: z.literal('teacher:addBotTeam'), level: z.enum(['easy', 'normal', 'hard']).optional() }),
  z.object({ t: z.literal('teacher:autoAssign') }),
  z.object({ t: z.literal('teacher:movePlayer'), playerId: z.string().max(24), teamId: z.string().max(16).nullable() }),
  z.object({ t: z.literal('teacher:start') }),
  z.object({ t: z.literal('teacher:skipPhase') }),
  z.object({ t: z.literal('teacher:endTournament') }),
  z.object({ t: z.literal('teacher:kick'), playerId: z.string().max(24) }),
  z.object({ t: z.literal('teacher:joinAsLeader'), teamId: z.string().max(16) }),
  z.object({ t: z.literal('teacher:leaveLeader') }),
  z.object({ t: z.literal('teacher:lock'), locked: z.boolean() }),
  z.object({ t: z.literal('teacher:reset') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const MAX_MESSAGE_BYTES = 4096;
export const RATE_LIMIT_PER_10S = 60;

export function parseClientMessage(raw: unknown): { ok: true; msg: ClientMessage } | { ok: false; error: string } {
  const r = clientMessageSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: '잘못된 요청이에요' };
  return { ok: true, msg: r.data };
}
