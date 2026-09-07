#!/usr/bin/env node
/**
 * **이 은하는 끝났는가** — 사람이 반복을 멈춰도 되는지 한 줄로 말한다.
 *
 * ## 사람이 하려던 것
 *
 *   재고 → TC → 화면 시험(Playwright) → **fail 목록** → 사람이 판정 → 다시 → **fail 0 까지**
 *
 * ⛔ 그런데 종료 조건은 **「fail 0」이 아니라 「판단하지 않은 fail 0」**이다(`qa/src/run/contract.ts`).
 * 「fail 0」을 목표로 두면 **가장 싼 해법이 단정을 약하게 만드는 것**이 된다.
 *
 * ## ⛔ 이 도구가 하지 않는 것
 *
 *  · **판정을 만들지 않는다.** 「끝났는가」의 답은 `qa` 의 계약이 낸다 — 여기는 **나른다**.
 *    두 자리에서 판정하면 화면은 「판정 3건 붙였다」인데 관문은 「판단하지 않은 fail 3건」이 된다.
 *  · **화면 시험을 대신 돌리지 않는다.** 은하가 `commands.e2e` 로 **선언해야** 돈다.
 *    선언이 없으면 ⚪ **못 쟀다**다 — 「화면이 멀쩡하다」가 아니다.
 *  · **모델을 부르지 않는다.**
 *
 *   node observatory/loop-state.mjs --galaxy <이름> [--report <파일>]
 *
 * 종료코드: 0 = 판단하지 않은 fail 0(멈춰도 된다) · 1 = 남았다 · 3 = **못 쟀다**
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { findGalaxyFile, resolveGalaxyPath } from '../lib/galaxy-load.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--galaxy', '--report'], 'universe loop');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const root = await requireUniverseHome(flag('--universe'));
const config = JSON.parse(await readFile(path.join(root, 'universe.config.json'), 'utf8'));
const name = flag('--galaxy') ?? config.galaxies?.[0];

console.log('── 이 은하는 끝났는가 — **판단하지 않은 fail** 로 잰다');

const unmeasured = (why, how) => {
  console.log(`\n⚪ **못 쟀다** — ${why}`);
  console.log(`   ${how}`);
  console.log('   ⛔ 이것은 「화면이 멀쩡하다」가 아니다(§8).');
  process.exit(EXIT_UNMEASURED);
};

const file = await findGalaxyFile(root, name);
if (!file) {
  console.error(`⛔ 없는 은하: ${name}\n   등록된 것: ${(config.galaxies ?? []).join(' · ') || '(없음)'}`);
  process.exit(1);
}
const galaxy = resolveGalaxyPath(root, JSON.parse(await readFile(file, 'utf8')));
console.log(`   은하 ${name} — ${galaxy.path}`);

/** ⛔ 계약을 여기서 다시 구현하지 않는다 — `qa` 의 것을 부른다. */
const runner = path.join(root, 'qa/dist/run/cli.js');
if (!existsSync(runner)) {
  unmeasured('TC 계약(`qa/dist`)이 안 지어져 있다.', 'npm --prefix qa install && npm --prefix qa run build');
}

/**
 * **화면 시험 결과를 어디서 받는가.**
 * ⛔ 은하가 `commands.e2e` 를 선언하면 그걸 돌린다. 없으면 ⚪ — **지어내지 않는다.**
 * ⚠️ `--report` 로 이미 있는 리포트를 줄 수도 있다(관문이 그렇게 쓴다 — 브라우저 없이 잰다).
 */
const given = flag('--report');
let report = given ? path.resolve(given) : null;

if (!report) {
  const e2e = galaxy.commands?.e2e;
  if (!e2e) {
    unmeasured(`은하 ${name} 이 \`commands.e2e\` 를 선언하지 않았다 — 화면 시험이 **안 돈다**.`,
      `${path.basename(file)} 의 \`commands\` 에 적어라 — 예: "e2e": "npx playwright test --reporter=json > .universe/e2e.json"`);
  }
  console.log(`   화면 시험을 돌린다 — ${e2e}`);
  const code = await new Promise((done) => {
    const child = spawn(e2e, { cwd: galaxy.path, shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('close', (c) => done(c ?? 1));
    child.on('error', () => done(127));
  });
  /* ⚠️ 화면 시험이 **실패로 끝나는 것은 정상**이다 — fail 을 찾으러 돌리는 것이다.
     못 돌아간 것(127)만 ⚪ 로 가른다. */
  if (code === 127) {
    unmeasured('화면 시험 명령을 못 불렀다.', `은하에서 직접 쳐 보라: ${e2e}`);
  }
  report = path.join(galaxy.path, galaxy.e2eReport ?? '.universe/e2e.json');
  if (!existsSync(report)) {
    unmeasured(`화면 시험이 리포트를 안 남겼다: ${path.relative(galaxy.path, report)}`,
      '은하의 `commands.e2e` 가 JSON 리포터로 그 자리에 쓰게 하라(`e2eReport` 로 자리를 바꿀 수 있다).');
  }
}

if (!existsSync(report)) {
  unmeasured(`그런 리포트가 없다: ${report}`, '`--report <파일>` 을 다시 보라.');
}

/**
 * ⛔ **두 가지 입력을 받는다 — 그리고 짐작하지 않고 모양을 본다.**
 *  · Playwright 리포트 → 판정이 **늘 비어 있다**(`fromPlaywrightJson` 이 `verdict: null` 로 만든다).
 *    그래서 이것만으로는 **영원히 「판단하지 않은 fail」**이다. 그게 옳다 — 아무도 안 봤으니까.
 *  · 콘솔이 **판정을 붙여 저장한 주행** → 그대로 넘긴다. 「끝났다」는 이쪽에서만 나온다.
 * ⚠️ 이 갈래가 없으면 「끝났다」 갈래는 **닿을 수 없는 코드**가 된다 — 그건 없는 것과 같다.
 */
/* ⛔ **못 읽는 입력은 ⚪ 다 — 날 스택이 아니다.** 실측: JSON 이 아닌 파일을 주니
   `JSON.parse` 가 그대로 터져 **스택만** 남았다(exit 1). 사람은 그 화면에서 아무것도 못 한다.
   ⚠️ 그리고 그건 「끝났는가」의 답이 아니라 **「못 쟀다」**다. */
let raw = null;
try {
  raw = JSON.parse(await readFile(report, 'utf8'));
} catch (error) {
  unmeasured(`리포트를 못 읽었다: ${path.relative(process.cwd(), report)}`,
    `${error.message.split('\n')[0]} — Playwright 의 **JSON 리포터** 결과나 콘솔이 저장한 주행이어야 한다.`);
}
const isPlaywright = Boolean(raw && typeof raw === 'object' && Array.isArray(raw.suites) && raw.config);
console.log(`   입력 — ${isPlaywright ? 'Playwright 리포트(판정은 비어 있다)' : '판정이 붙은 주행'}`);

const origins = path.join(root, 'qa/e2e/origins.json');
const args = [runner, report, '--json'];
if (isPlaywright) { args.push('--from-playwright'); }
if (existsSync(origins) && isPlaywright) { args.push('--origins', origins); }

const out = await new Promise((done) => {
  const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  let err = '';
  child.stdout.on('data', (d) => { text += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => done({ code, text, err }));
  child.on('error', (error) => done({ code: 127, text: '', err: String(error.message) }));
});

let parsed = null;
try {
  parsed = JSON.parse(out.text);
} catch {
  parsed = null;
}
/* ⛔ 계약의 답을 못 읽었으면 **통과가 아니다** — 「끝났다」를 지어내지 않는다(§8). */
if (parsed === null) {
  unmeasured('TC 계약이 낸 답을 못 읽었다(JSON 이 아니다).', (out.err || out.text).split('\n').slice(-3).join(' '));
}

const stats = parsed.stats ?? {};
console.log(`\n   화면 시험 — 전체 ${stats.total ?? '?'} · 기대대로 ${stats.expected ?? '?'} · 어긋남 ${stats.unexpected ?? '?'} · 비켜섬 ${stats.skipped ?? '?'}`);
/* ⚠️ 비켜섬은 **통과가 아니다** — 종료코드에 안 나오는 자리라 여기서 수로 말한다. */
if ((stats.skipped ?? 0) > 0) {
  console.log(`   ⚠️ 비켜선 것 ${stats.skipped}건 — **통과가 아니다.** 왜 비켜서는지 보라.`);
}

const done = parsed.done ?? {};
const unjudged = done.unjudged ?? [];
if (done.done === true) {
  console.log('\n✅ **판단하지 않은 fail 0** — 이 은하는 이 회전에서 멈춰도 된다.');
  console.log('   ⛔ 「fail 0」이 아니다. 실패가 있어도 **사람이 판단했으면** 끝난 것이다.');
  process.exit(0);
}
console.error(`\n⛔ ${done.reason ?? '판단하지 않은 fail 이 남았다'}`);
for (const row of unjudged) {
  console.error(`   · ${row.id} — ${row.reason ?? '판단하지 않았다'} (귀속: ${row.attribution ?? '모름'})`);
}
console.error('\n   → 콘솔에서 판정을 붙여라(`universe console` 이 그 화면이 서는지 잰다).');
console.error('   ⛔ 단정을 약하게 만들어 fail 을 없애지 마라 — 그래서 종료 조건이 「fail 0」이 아니다.');
process.exit(1);
