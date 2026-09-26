import React, { useEffect, useMemo, useState } from 'react';
import { Entrance } from './screens/Entrance';
import { Join } from './screens/Join';
import { Solo } from './screens/Solo';
import { TeacherRoute } from './screens/Teacher';
import { StudentPlay } from './screens/StudentPlay';
import { RotateHint } from './ui/common';

export function navigate(path: string) { history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }

export function usePath(): string {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => { const on = () => setPath(location.pathname + location.search); window.addEventListener('popstate', on); return () => window.removeEventListener('popstate', on); }, []);
  return path;
}

export interface StudentSession { code: string; token: string; playerId: string; nick: string }
export const sessionStore = {
  get(): StudentSession | null { try { const s = localStorage.getItem('sc:session'); return s ? JSON.parse(s) : null; } catch { return null; } },
  set(s: StudentSession | null) { try { if (s) localStorage.setItem('sc:session', JSON.stringify(s)); else localStorage.removeItem('sc:session'); } catch { /* noop */ } },
};

export function App() {
  const path = usePath();
  const url = useMemo(() => new URL(path, location.origin), [path]);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  let screen: React.ReactNode;
  if (p === '/join') screen = <Join code={url.searchParams.get('code') ?? ''} />;
  else if (p === '/solo') screen = <Solo />;
  else if (p === '/teacher' || p.startsWith('/teacher/')) screen = <TeacherRoute />;
  else if (p === '/play') screen = <StudentPlay />;
  else screen = <Entrance />;
  return <>{screen}<RotateHint /></>;
}
