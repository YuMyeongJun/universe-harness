/**
 * **backoffice 은하의 화면 시험 설정** — ⛔ 이 파일은 남의 저장소에 안 들어간다.
 *
 * ## ⛔⛔ 왜 설정이 따로인가
 *
 * `playwright.config.ts` 는 `qa` 은하 자신의 축(`./e2e/*.e2e.ts`)이다. 같은 설정에 넣으면
 * **`qa` 를 잴 때 backoffice 시험까지 돈다** — 그러면 「qa 가 초록이다」가 남의 저장소가
 * 떠 있는지에 매인다. 재는 대상이 섞이면 **어느 것이 빨간지 못 가른다.**
 *
 * ## ⛔ 시험 파일이 **우주에 산다**
 *
 * backoffice 는 **남의 저장소**다(커밋하지 않는다). 그 저장소에 playwright 를 깔지도,
 * 시험 파일을 심지도 않는다. ⇒ 브라우저는 **우주가** 띄우고, 남의 저장소는 **서빙만** 한다.
 * ⚠️ 리포트만 은하 쪽 `.harness/`(그 저장소가 **이미 gitignore 하는 자리**)에 떨어진다.
 *
 * ## ⚠️ `ignoreHTTPSErrors` 를 켠 이유 — 편의가 아니다
 *
 * 그 앱의 `vite.config.ts` 가 `mkcert()` 를 쓴다. 즉 **https 로만 뜨고** 인증서는 로컬
 * 개발용이다. 안 켜면 브라우저가 첫 요청에서 끊고, 그 실패는 「화면이 깨졌다」로 보인다 —
 * ⛔ 실제로는 **못 잰 것**이다. ⚠️ 이 값은 **로컬 개발 서버에만** 옳다.
 */
import { existsSync } from 'node:fs';

import { defineConfig } from '@playwright/test';

/**
 * ⛔ 주소를 코드에 안 박는다(관측 법칙 §9). 안 주면 그 앱의 `vite.config.ts` 가 적어 둔
 * 기본 포트(3000)를 쓴다 — **짐작이 아니라 그 파일에서 읽은 값**이다.
 */
const baseURL = process.env['UNIVERSE_BASE_URL'] ?? 'https://localhost:3000';

const watchSlowMo = Number(process.env['UNIVERSE_WATCH_SLOWMO'] ?? '0');

/**
 * ── ⭐ 사람이 만든 세션을 **물려받는다** ────────────────────────────
 *
 * `universe session <은하>` 가 창을 띄우고, **사람이 직접 로그인하고**, 그 상태를
 * 은하의 `.harness/session.json` 에 적는다. 여기서는 **있으면 쓰고 없으면 안 쓴다.**
 *
 * ⛔⛔ **없다고 시험을 세우지 않는다** — 그러면 「로그인 안 됨」이 「시험이 깨졌다」로 보인다.
 *    대신 로그인 뒤 화면을 재는 시험이 **스스로 ⚪ 로 물러나야** 한다(그건 시험이 할 일이다).
 * ⛔ 이 파일이 계정을 알지 못한다. 아는 것은 **파일이 있는가**뿐이다.
 * ⚠️ 세션은 만료된다 — 시험이 로그인 화면으로 튕기면 `universe session` 을 다시 쳐라.
 */
const sessionFile = process.env['UNIVERSE_SESSION'] ?? '';
const hasSession = sessionFile !== '' && existsSync(sessionFile);

export default defineConfig({
  testDir: './e2e/backoffice',
  testMatch: '**/*.e2e.ts',
  /* ⚠️ `retries: 0` — 재시도를 켜면 `flaky` 가 생기고, 「됐다/안 됐다」가 흐려진다. */
  retries: 0,
  /* ⚠️ 남의 dev 서버는 첫 요청에서 의존성을 최적화하느라 느릴 수 있다(실측 vite 재최적화). */
  timeout: 60_000,
  /**
   * ⭐ **한 건 끝날 때마다 한 줄** — 화면이 보면서 그릴 수 있게(`reporters/ndjson.ts`).
   *
   * ⛔ `json` 리포터를 **대체하지 않는다.** 판정은 여전히 계약 도구가 `json` 산출을 먹고 낸다.
   *    ⚠️ 이 줄들은 **진행**이다. 화면이 이걸로 스스로 채점하기 시작하면 두 자리에서 세게 되고,
   *    갈린 뒤에는 어느 쪽이 사실인지 아무도 모른다.
   * ⚠️ `UNIVERSE_NDJSON` 이 없으면 그 리포터는 **아무것도 안 하고 그렇게 말한다** —
   *    즉 이 설정을 평소처럼 써도 달라지는 것이 없다.
   */
  reporter: [['list'], ['./reporters/ndjson.ts']],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    ...(hasSession ? { storageState: sessionFile } : {}),
    screenshot: 'only-on-failure',
    ...(Number.isFinite(watchSlowMo) && watchSlowMo > 0
      ? { launchOptions: { slowMo: watchSlowMo } }
      : {}),
  },
});
