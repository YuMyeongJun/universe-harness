/**
 * 기동 — 127.0.0.1 에만 바인딩한다. 이건 **로컬 도구**이고, 계정 정보를 다루므로
 * 네트워크에 열지 않는다.
 */
import { HARNESS_ROOT } from './paths.js';
import { createApp } from './server.js';

const PORT = Number(process.env['PORT'] ?? 8788);

const app = createApp();
app.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`지식 실측 콘솔 — http://127.0.0.1:${PORT}\n`);
  /* ⚠️ 전에는 이 줄이 **형제 폴더의 남의 저장소** 경로를 찍었다. 끊었다 —
     이 콘솔이 읽는 정본은 우주 자신이다. 어디를 읽는지는 계속 찍는다:
     경로를 안 찍으면 「어느 우주에 붙었는지」를 사람이 확인할 방법이 없다. */
  process.stdout.write(`우주: ${HARNESS_ROOT}\n`);
});

/**
 * ⚠️ 전에는 여기서 **열린 브라우저를 닫았다**(수집이 Chromium 을 띄웠다). 그 길을 지웠으므로
 *    닫을 것도 없어졌다 — 그래서 종료를 **즉시** 끝낸다.
 * ⛔ 핸들러 자체는 안 지웠다: `node --watch` 가 SIGTERM 을 보내는데 받는 사람이 없으면
 *    종료가 기본 동작에 맡겨지고, 그때 「옛 코드가 계속 서빙되는」 자리를 다시 만들 수 있다.
 */
const shutdown = (signal: string): void => {
  process.stdout.write(`\n${signal} — 종료합니다.\n`);
  process.exit(0);
};

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => shutdown(sig));
