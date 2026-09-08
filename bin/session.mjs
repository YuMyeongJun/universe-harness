#!/usr/bin/env node
/**
 * `universe session <은하>` — **사람이 직접 로그인하고, 그 세션을 시험이 물려받는다.**
 *
 * ## ⛔⛔ 이 도구가 **절대** 하지 않는 것
 *
 * · **아이디·비밀번호를 받지 않는다.** 인자로도, 파일로도, 환경변수로도, 화면으로도.
 *   받는 순간 그 값이 셸 히스토리·프로세스 목록·서버 로그에 남고, 사람은 그걸 **못 지운다.**
 * · **대신 로그인하지 않는다.** SSO·OTP·캡차를 기계가 흉내 내려다 실패하면
 *   **왜 실패했는지도 안 남는다.** ⇒ 창을 띄우고 **비켜선다.**
 * · **저장한 세션을 찍지 않는다.** 파일 **자리**만 말한다. 그 안에는 인증 쿠키가 들어 있다.
 *
 * ## 왜 필요한가 — 실측
 *
 * 로그인 뒤 화면이 본체인 저장소에서, 세션 없이 도는 화면 시험은 **셸만 잰다.**
 * 실제로 backoffice 를 자격 없이 열었더니 「장시간 사용 이력이 없어 자동 로그아웃 되었습니다」
 * 모달이 떴다 — 그 상태로 아무리 초록이 나와도 **로그인 뒤 화면은 한 번도 안 잰 것**이다.
 * ⛔ 그걸 「화면 시험 통과」라고 부르면 그게 이 저장소가 제일 싫어하는 거짓 초록이다.
 *
 * ## 어떻게 도는가
 *
 *  1. 은하가 선언한 `session.loginUrl` 로 **창을 띄운다**(headed).
 *  2. **사람이 로그인한다.** 도구는 기다리기만 하고, **어디까지 갔는지 계속 찍는다**
 *     (2차 인증 화면에 있는지 사람도 보고 알 수 있어야 한다).
 *     ⚠️ **새 창(팝업)으로 뜨는 2차 인증도 본다** — 원래 창만 보면 사람이 끝냈는데도 ⚪ 로 끝난다.
 *  3. 은하가 선언한 **도착 자리**(`session.readyPath`)에 닿으면 그때 세션을 적는다.
 *     ⛔⛔ **전에는 「로그인 자리를 떠났는가」만 봤다 — 실측으로 틀렸다.**
 *       그 저장소는 ID/비번 다음에 **2차 인증(`/factor`)** 이 있다. 그 화면도 로그인 자리가
 *       아니므로, 옛 규칙은 **2차 인증 도중에** 세션을 「됐다」로 저장했다.
 *       ⇒ **반쯤 된 세션**이 저장되고, 다음 주행은 로그인 안 된 채로 돌면서 초록을 낸다.
 *     ⇒ 「어디를 떠났나」가 아니라 **「어디에 닿았나」**로 잰다. 그 자리는 **은하가 선언한다**(§9).
 *  4. 화면 시험 설정이 그 파일이 있으면 **물려서** 돈다.
 *
 * ⚠️ 저장 자리는 은하의 **`.harness/`** 다 — 남의 저장소가 이미 gitignore 하는 자리(보존 법칙).
 *    ⛔ `.data/` 나 우주 안에 두지 않는다: 세션은 **그 저장소의 것**이지 우주의 것이 아니다.
 *
 *   universe session <은하> [--timeout <초>]
 *
 * 종료 코드
 *   0  세션을 적었다
 *   1  사람이 잘못 줬다(은하가 없다 · 선언이 없다 · 모르는 플래그)
 *   3  ⚪ **못 쟀다** — 사람이 안 끝냈다(시간 초과) · 창을 못 띄웠다
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { loadGalaxy } from '../lib/galaxy-load.mjs';
import { requireUniverseHome } from '../lib/home.mjs';

const EXIT_UNMEASURED = 3;

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--timeout', '--universe'], 'universe session');
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const name = argv.find((a) => !a.startsWith('--') && a !== flag('--timeout') && a !== flag('--universe'));

if (name === undefined) {
  console.error('은하를 줘라: universe session <은하> [--timeout <초>]');
  process.exit(1);
}

const rawTimeout = flag('--timeout');
if (rawTimeout !== undefined && !/^[1-9][0-9]*$/.test(String(rawTimeout))) {
  console.error(`⛔ --timeout 은 1 이상의 정수(초)라야 한다: ${rawTimeout}`);
  process.exit(1);
}
/** ⚠️ 넉넉해야 한다 — SSO·OTP 는 사람이 손으로 하고, 조직 계정은 승인이 한 단계 더 붙는다. */
const timeoutMs = Number(rawTimeout ?? 300) * 1000;

/* ⛔ 우주 뿌리를 여기서 짐작하지 않는다 — `home.mjs` 가 그 규약을 갖고 있다(자리가 둘이면 갈린다).
   ⚠️ `packageHome`(패키지 자신)이 아니라 **`requireUniverseHome`** 이다 — 다른 도구들과 같은 자리를 본다:
   `--universe` → `UNIVERSE_HOME` → cwd 에서 위로. 패키지 안을 조용히 보면 소비 저장소에서 엉뚱한 것을 잰다. */
const root = await requireUniverseHome(flag('--universe'));
const loaded = await loadGalaxy(root, name);
if (loaded.problem !== undefined) {
  console.error(`⛔ ${loaded.problem}`);
  process.exit(1);
}
const galaxy = loaded.galaxy;

/**
 * ⛔ **로그인 자리는 은하가 선언해야 한다** — 우주가 짐작하지 않는다(관측 법칙 §9).
 * ⚠️ 선언에는 **주소만** 들어간다. 계정은 어디에도 안 적는다.
 */
const loginUrl = galaxy.session?.loginUrl;
if (typeof loginUrl !== 'string' || loginUrl.trim() === '') {
  console.error(`⛔ 은하 ${name} 이 \`session.loginUrl\` 을 선언하지 않았다 — 어디서 로그인하는지 우주는 모른다.`);
  console.error('   좌표에 적어라 — 예:');
  console.error('     "session": { "loginUrl": "https://localhost:3000/login", "requiresSession": true }');
  console.error('   ⛔ 계정은 적지 마라. 이 도구는 계정을 **받지도 저장하지도 않는다.**');
  process.exit(1);
}

const out = path.join(galaxy.path, '.harness', 'session.json');
mkdirSync(path.dirname(out), { recursive: true });

/** ⛔ playwright 를 남의 저장소에 안 깐다 — 우주의 것을 쓴다(`qa/`). */
const pwRoot = path.resolve(new URL('..', import.meta.url).pathname, 'qa');
let chromium = null;
try {
  ({ chromium } = await import(path.join(pwRoot, 'node_modules', 'playwright', 'index.mjs')));
} catch {
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('⚪ 못 쟀다 — playwright 를 못 찾았다.');
    console.error(`   ${pwRoot} 에서 \`npm install\` 을 먼저 해라.`);
    process.exit(EXIT_UNMEASURED);
  }
}

console.log(`── 세션을 만든다 — 은하 ${name}`);
console.log(`   로그인 자리: ${loginUrl}`);
console.log('   ⛔ 계정은 안 받는다 — **창에서 당신이 직접** 로그인해라. 도구는 기다린다.');
console.log(`   기다리는 상한: ${Math.round(timeoutMs / 1000)}초`);

/** ⚠️ 로컬 개발 서버는 mkcert 등 자체 인증서를 쓴다 — 안 넘기면 첫 요청에서 끊긴다. */
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

/** 경로가 같은가 — **경로만** 본다(쿼리의 `?redirect=` 는 매번 다르다). */
const samePath = (url, target) => {
  try {
    const x = new URL(url);
    const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
    /* `target` 은 전체 주소일 수도 경로일 수도 있다 — 둘 다 받는다. */
    const want = target.startsWith('http') ? new URL(target).pathname : target;
    return norm(x.pathname) === norm(want);
  } catch {
    return false;
  }
};

/**
 * ⭐ **도착 자리를 은하가 선언한다.** 없으면 옛 규칙(로그인 자리를 떠났는가)으로 물러나되,
 * ⚠️ **그 경우 「확인 못 했다」고 크게 말한다** — 2차 인증 같은 중간 화면을 통과로 읽을 수 있다.
 */
const readyPath = galaxy.session?.readyPath;
const hasReady = typeof readyPath === 'string' && readyPath.trim() !== '';
if (!hasReady) {
  console.log('   ⚠️ 이 은하는 `session.readyPath` 를 선언하지 않았다 — **로그인 자리를 떠나면** 저장한다.');
  console.log('      ⛔ 2차 인증(OTP)처럼 **중간 화면**이 있으면 그 상태로 저장될 수 있다.');
} else {
  console.log(`   도착해야 하는 자리: ${readyPath}`);
}

/**
 * ⭐ **컨텍스트의 모든 창을 본다 — `page` 하나만 보지 않는다.**
 *
 * ⛔ 2차 인증이 **새 창(팝업)** 으로 뜨는 앱이 있다. 그때 원래 창의 주소는 영영 안 바뀌므로,
 *    `page.waitForURL` 하나만 걸면 사람이 로그인을 **끝냈는데도** 도구는 계속 기다리다 ⚪ 로 끝난다.
 *    ⇒ 컨텍스트가 든 **모든 페이지**의 주소를 본다. 어느 창이든 도착 자리에 닿으면 된 것이다.
 * ⚠️ 세션(`storageState`)은 **컨텍스트**의 것이라, 어느 창에서 끝냈든 같은 자리에 담긴다.
 */
const reached = () => context.pages().some((one) => {
  const url = one.url();
  return hasReady ? samePath(url, readyPath) : !samePath(url, loginUrl);
});

/** ⛔ 조용히 기다리지 않는다 — 사람이 어디까지 갔는지 **보이게** 찍는다(2차 인증이 그 자리다). */
let lastSeen = '';
const watch = setInterval(() => {
  const now = context.pages().map((one) => one.url()).join(' | ');
  if (now !== lastSeen) {
    lastSeen = now;
    console.log(`   … 지금: ${now}`);
  }
}, 1500);

let arrived = false;
try {
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  /**
   * ⛔ **로그인 자리에 실제로 섰는지 먼저 확인한다.** 앱이 곧바로 다른 데로 튕기면
   *    사람은 로그인 화면을 못 보고, 도구는 그것을 「진행 중」으로 오해한 채 기다린다.
   *    ⚠️ 이때 **지어내지 않는다** — 어디로 갔는지 그대로 찍는다.
   */
  if (!samePath(page.url(), loginUrl)) {
    console.log(`   ⚠️ 로그인 자리에 안 섰다 — 앱이 ${page.url()} 로 보냈다.`);
  }

  const deadline = Date.now() + timeoutMs;
  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    if (reached()) { arrived = true; break; }
    await new Promise((r) => { setTimeout(r, 500); });
  }
  /* eslint-enable no-await-in-loop */
} catch {
  arrived = false;
}
clearInterval(watch);

if (!arrived) {
  const at = context.pages().map((one) => one.url()).join(' | ') || page.url();
  await browser.close().catch(() => undefined);
  console.log('⚪ 못 쟀다 — 로그인이 **안 끝났다**(시간이 지났거나 창을 닫았다).');
  /* ⭐ **어디까지 갔는지 말한다** — 2차 인증에서 멈춘 것과 아예 못 들어간 것은 다른 사실이다. */
  console.error(`   마지막으로 있던 자리: ${at}`);
  console.error('   ⛔ 반쯤 된 세션을 「됐다」로 저장하지 않는다 — 그러면 다음 주행이 로그인 없이 돌면서 초록을 낸다.');
  process.exit(EXIT_UNMEASURED);
}

await context.storageState({ path: out });
const where = context.pages().map((one) => one.url()).find((u) => (hasReady ? samePath(u, readyPath) : true)) ?? page.url();
await browser.close().catch(() => undefined);

/* ⛔ 세션 **내용**을 찍지 않는다 — 자리와 「어디에 도착했나」만 말한다. */
console.log(`\n✅ 세션을 적었다 — ${path.relative(process.cwd(), out)}`);
console.log(`   도착한 자리: ${where}`);
console.log('   ⚠️ 이 파일에는 **인증 쿠키가 들어 있다.** 그 저장소의 `.harness/` 는 gitignore 되는 자리다.');
console.log('   ⚠️ 세션은 **만료된다** — 화면 시험이 로그인 화면으로 튕기면 이 명령을 다시 쳐라.');
process.exit(0);
