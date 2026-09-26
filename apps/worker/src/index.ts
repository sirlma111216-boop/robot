// Worker 진입점: 정적 자산 + /api HTTP + /ws WebSocket 업그레이드(→ ClassSessionDO)
import { ClassSessionDO, type Env } from './ClassSessionDO';
import { signTeacherToken, verifyTeacherToken, readCookie, cookieHeader, timingSafeEqual, TEACHER_COOKIE, TEACHER_TTL_MS } from './auth';

export { ClassSessionDO };

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TEACHER_ID = 'teacher';
const failedLogins = new Map<string, { n: number; at: number }>();

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return true; // 브라우저 외 호출·same-origin GET 은 통과
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  let s = ''; for (const x of b) s += CODE_CHARS[x % CODE_CHARS.length];
  return s;
}

function classStub(env: Env, code: string) {
  return env.CLASS.get(env.CLASS.idFromName(code.toUpperCase()));
}

async function isTeacher(req: Request, env: Env): Promise<boolean> {
  return verifyTeacherToken(env.TEACHER_PASSWORD, readCookie(req, TEACHER_COOKIE));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const secure = url.protocol === 'https:';

    if (path.startsWith('/api/') || path.startsWith('/ws/')) {
      if (request.method !== 'GET' && !sameOrigin(request)) return json({ ok: false, error: '허용되지 않은 출처예요.' }, 403);
      if (!env.TEACHER_PASSWORD) return json({ ok: false, error: '서버에 교사 비밀번호(TEACHER_PASSWORD)가 설정되지 않았어요.' }, 500);

      // ---- 교사 인증 ----
      if (path === '/api/teacher/login' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
        const f = failedLogins.get(ip);
        const now = Date.now();
        if (f && now - f.at < 60_000 && f.n >= 8) return json({ ok: false, error: '시도가 너무 많아요. 1분 뒤 다시 해요.' }, 429);
        const body = await request.json<{ id?: string; password?: string }>().catch(() => ({} as { id?: string; password?: string }));
        const okId = (body.id ?? '') === TEACHER_ID;
        const okPw = typeof body.password === 'string' && timingSafeEqual(body.password, env.TEACHER_PASSWORD);
        if (!okId || !okPw) {
          failedLogins.set(ip, { n: (f && now - f.at < 60_000 ? f.n : 0) + 1, at: now });
          await new Promise((r) => setTimeout(r, 700));
          return json({ ok: false, error: '아이디 또는 비밀번호가 맞지 않아요.' }, 401);
        }
        failedLogins.delete(ip);
        const token = await signTeacherToken(env.TEACHER_PASSWORD, TEACHER_TTL_MS);
        return json({ ok: true }, 200, { 'set-cookie': cookieHeader(token, TEACHER_TTL_MS / 1000, secure) });
      }
      if (path === '/api/teacher/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0, secure) });
      if (path === '/api/teacher/me') return json({ ok: await isTeacher(request, env) });

      // ---- 클래스 ----
      if (path === '/api/class' && request.method === 'POST') {
        if (!(await isTeacher(request, env))) return json({ ok: false, error: '선생님 로그인이 필요해요.' }, 401);
        const code = newCode();
        const res = await classStub(env, code).fetch(new Request('https://do/init', { method: 'POST', body: JSON.stringify({ code }) }));
        return json(await res.json(), res.status);
      }
      const m = path.match(/^\/(api\/class|ws)\/([A-Za-z0-9]{4,8})(?:\/(\w+))?$/);
      if (m) {
        const kind = m[1], code = m[2].toUpperCase(), sub = m[3] ?? '';
        const stub = classStub(env, code);
        if (kind === 'ws') {
          // 학생 토큰이 있으면 학생으로 취급(교사가 같은 브라우저로 학생 화면을 열어도 안전)
          const teacher = !url.searchParams.get('token') && (await isTeacher(request, env));
          const headers = new Headers(request.headers);
          headers.set('x-teacher', teacher ? '1' : '0');
          const target = new URL('https://do/ws'); target.search = url.search;
          return stub.fetch(new Request(target.toString(), { headers, method: 'GET' }));
        }
        if (sub === '' && request.method === 'GET') return stub.fetch(new Request('https://do/info'));
        if (sub === 'join' && request.method === 'POST') return stub.fetch(new Request('https://do/join', { method: 'POST', body: await request.text(), headers: { 'content-type': 'application/json' } }));
        if (sub === 'delete' && request.method === 'POST') {
          if (!(await isTeacher(request, env))) return json({ ok: false, error: '선생님 로그인이 필요해요.' }, 401);
          return stub.fetch(new Request('https://do/delete', { method: 'POST' }));
        }
      }
      return json({ ok: false, error: '없는 주소예요.' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
