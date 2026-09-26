// 교사 세션: 서버 비밀값(TEACHER_PASSWORD)으로 HMAC 서명한 짧은 토큰을 HttpOnly 쿠키로 발급한다.
const enc = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode('scrap-crown:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signTeacherToken(secret: string, ttlMs: number): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ exp: Date.now() + ttlMs, r: b64url(crypto.getRandomValues(new Uint8Array(8))) })));
  const sig = b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload)));
  return `${payload}.${sig}`;
}

export async function verifyTeacherToken(secret: string, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload)));
  if (!timingSafeEqual(expected, sig)) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' && json.exp > Date.now();
  } catch { return false; }
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function readCookie(req: Request, name: string): string | null {
  const c = req.headers.get('Cookie') ?? '';
  for (const part of c.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export const TEACHER_COOKIE = 'sc_teacher';
export const TEACHER_TTL_MS = 8 * 60 * 60 * 1000;

export function cookieHeader(value: string, maxAgeSec: number, secure: boolean): string {
  return `${TEACHER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}
