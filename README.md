# 스크랩 크라운 — 고철 도시 챔피언십 (SCRAP CROWN)

학급용 **팀 대항 고철 로봇 웹게임**. 팀마다 고철 부품으로 로봇 한 대를 조립하고, 매 턴 3개 명령을 미리 정한 뒤, 최대 6팀의 로봇이 **동시에** 움직이며 충돌한다. 튕겨 다니는 왕관 곁에 혼자 남으면 3점, 상대를 낙하 구역으로 밀면 2점, 고철 캡슐 1점.

- 학생: 링크/QR + 닉네임만으로 입장 (로그인 없음)
- 교사: 아이디 `teacher` + 비밀번호 (서버 비밀값)로 관제실 입장, 팀장 지정·봇 추가·시작·관전·직접 참가
- 서버 물리만 승패를 결정하고, 모든 참가자는 같은 궤적을 같은 시각에 본다
- 혼자 연습 모드는 같은 게임 코어를 브라우저 안에서 실행한다

## 실행 명령

```bash
npm install            # 의존성 (lockfile 고정)
npm run assets         # assets-source/images → apps/web/public/assets (WebP + manifest)
npm run typecheck      # core / web / worker 타입 검사
npm test               # vitest: 물리·상태기계·프로토콜
npm run build          # 웹 빌드 (apps/web/dist)
npm run dev            # 빌드 후 wrangler dev (http://127.0.0.1:8787, DO+WS 포함)
npm run dev:web        # Vite 개발 서버(핫리로드, /api·/ws 는 8787 로 프록시)
npm run deploy         # 빌드 후 Cloudflare Workers 배포 (production)
```

로컬 비밀값: `.dev.vars` 에 `TEACHER_PASSWORD=...` (예제: `.dev.vars.example`). 배포 환경은 `npx wrangler secret put TEACHER_PASSWORD`.

## 구조

```text
apps/web/        React 19 + Vite 8, Canvas 2D 렌더러, 10개 장면 (도시 입구·격납고·정비소·경매장·터널·전술실·중계·피트스톱·시상대·관제실)
apps/worker/     Cloudflare Worker: 정적 자산 + /api + /ws, 교사 인증(HMAC 쿠키), ClassSessionDO (SQLite DO, Hibernation WS, alarm)
packages/core/   content(부품·경기장·팀·규칙) / physics(헤드리스 2D 물리) / rules(명령·빌드 검증) / host(ClassHost 상태기계) / bots / protocol(zod) / assets(manifest)
scripts/         build-assets.mjs (sharp: 트리밍·리사이즈·WebP·manifest)
assets-source/   공급받은 원본 이미지 41장 (ID = 이미지 명세서 ID)
tests/           vitest
docs/            기획서, 계획, 운영 가이드, 아키텍처 결정, 에셋 감사, 테스트 결과
```

선택한 버전(lockfile 고정): TypeScript 5.9, Vite 8.3, React 19.3, zod 4.6, vitest 5.0, wrangler 4.141, sharp 0.35, Node 24.

## 기획서와 다른 점 (의도적 결정)

| 항목 | 기획서 | 구현 | 이유 |
|---|---|---|---|
| 운영 모델 | 6개 방 × 5명 개인전 | **팀 대항전**: 팀장 지정 → 팀 자동 생성, 한 팀 = 로봇 1대, 한 경기장 2~6팀 | 사용자 요구. 팀원은 부품 추천·명령안 제안·투표, 팀장이 확정 |
| 렌더러 | Phaser | 직접 작성한 Canvas 2D 렌더러 | 서버 궤적 재생 + 연출만 필요. 번들 −1MB, React 통합 단순 |
| 물리 엔진 | Matter.js 래핑 | 직접 작성한 원형 강체 + 접지 모델 (`packages/core/src/physics/sim.ts`) | 결정적·경량(9초 구간 계산 수 ms), workerd 호환 확실, 접지 모델을 1급으로 구현 |
| DO 구성 | ClassSessionDO + GameRoomDO | **ClassSessionDO 하나**가 클래스·팀·경기를 모두 담당 | 팀 모델에서는 클래스당 경기장 1개. 분산 트랜잭션 문제 제거. 7팀 이상/다중 경기장은 확장 항목 |
| 부품 드래프트 | 우선순위 드래프트로 희소 부품 배분 | 모든 팀이 같은 부품 목록에서 질량 예산 내 자유 조립 | 첫 버전 단순화. 조립 차별화는 질량·에너지 예산과 장치 상성으로 확보 |
| 패키지 분리 | 7개 패키지 | `packages/core` 1개 안에 폴더로 경계 | 작은 파일을 위한 과도한 분리 회피(기획서 9장 원칙) |

## 교사 운영 (요약)

1. `/teacher` 로그인 → 클래스 만들기 → QR/코드를 학생에게 보여준다.
2. 학생이 들어오면 명단에서 **팀장 지정** (팀 자동 생성, 최대 6팀). 나머지는 스스로 팀을 고르거나 **자동 배정**.
3. 필요하면 **봇 팀** 추가(난도 선택). 경기 수(빠른 1경기 / 표준 3경기)와 시간 설정.
4. **대회 시작**. 교사는 기본 관전, 팀 카드의 "팀장으로 참가"를 누르면 직접 플레이.
5. 각 단계는 시간 마감 또는 전원 준비 시 자동 진행. 관제(우하단 🎓)에서 단계 넘기기·대회 종료·다시 하기.

자세한 내용: `docs/10_운영가이드.md`.

## 배포

- 주 경로: 로컬 `npm run deploy` (wrangler OAuth). GitHub Actions 는 push 시 검사·빌드, 배포는 `workflow_dispatch` 수동 실행(중복 배포 방지). CI 배포에는 저장소 시크릿 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 가 필요하다.
- `wrangler.jsonc`: Static Assets(SPA fallback) + DO 바인딩 `CLASS` + SQLite migration `v1`. staging 환경은 `--env staging`.
- 비밀값은 git·빌드 산출물·브라우저에 넣지 않는다.

## 상태와 한계 (정직한 체크리스트)

완료·검증됨(로컬): 물리 결정성·점수 판정 테스트, 3경기 봇 대회 상태기계 테스트, workerd 위 실제 DO/WebSocket 스모크(교사 로그인·위조 거부·입장·알람 진행·구간 방송·재접속), 두 브라우저 탭(교사+학생) 동기 재생 육안 확인, 41장 에셋 통합.

미검증·외부 대기: 30인 실제 교실 부하, 100~200ms RTT 조건, 저사양 기기 fps, 음악(미제작, manifest 자리만), 7팀 이상 다중 경기장, 접근성 정밀 검수. `docs/40_테스트_결과.md` 참고.
