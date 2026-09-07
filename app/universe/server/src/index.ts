/**
 * 기동 — 127.0.0.1 에만 바인딩한다. 이건 **로컬 도구**이고, 계정 정보를 다루므로
 * 네트워크에 열지 않는다.
 */
import { closeBrowser } from './collect.js';
import { locate, workflowRoot } from './paths.js';
import { createApp } from './server.js';

const PORT = Number(process.env['PORT'] ?? 8788);

const app = createApp();
app.listen(PORT, '127.0.0.1', () => {
  const found = locate();
  process.stdout.write(`지식 실측 콘솔 — http://127.0.0.1:${PORT}\n`);
  process.stdout.write(`지식 저장소: ${workflowRoot()}${found.ok ? '' : '  ⚠️ 못 찾음'}\n`);
  if (!found.ok) process.stdout.write(`  ${found.hint}\n`);
});

/**
 * ⚠️ **열린 브라우저는 프로세스를 붙잡는다.** 닫아 주지 않으면 종료가 안 끝나고,
 *    `node --watch` 는 "Waiting for graceful termination" 에서 멈춘 채 **옛 코드가 계속 서빙된다** —
 *    고친 코드가 안 도는데 화면은 멀쩡해 보이는, 시간을 가장 많이 버리는 자리다.
 *    떠도는 Chromium 이 남는 것도 막는다.
 */
const shutdown = (signal: string): void => {
  process.stdout.write(`\n${signal} — 브라우저를 닫고 종료합니다.\n`);
  void closeBrowser().then(
    () => process.exit(0),
    () => process.exit(1),
  );
  // 브라우저가 응답하지 않아도 매달려 있지 않는다.
  setTimeout(() => process.exit(1), 5_000).unref();
};

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => shutdown(sig));
