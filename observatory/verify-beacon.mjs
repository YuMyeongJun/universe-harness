#!/usr/bin/env node
/**
 * 위키가 낡았는가 — 발행본과 **마지막으로 발행한 것**을 대조한다.
 *
 * ⚠️ 왜: 발행은 사람(또는 에이전트)이 부르는 마지막 단계라 **빼먹기 가장 쉽다.**
 * 저장소는 앞서 나가고 위키는 옛말을 하는데, 그 어긋남을 아무것도 잡지 않았다.
 *
 * ⛔ **이것이 못 잡는 것**: 위키 쪽에서 사람이 직접 고친 것.
 * 이 검사는 「내가 마지막에 보낸 것」과 「지금 렌더 결과」만 본다 — 위키 본문을 읽지 않는다.
 * 위키 본문과의 대조는 발행 도구(MCP)를 통해서만 되고, 그건 이 스크립트의 손이 닿는 곳이 아니다.
 * 그래서 **위키를 고치지 말라**는 규칙이 여전히 규칙으로 남아 있다 — 못 재는 것은 못 잰다고 적는다.
 *
 * 재는 법:
 *   node observatory/verify-beacon.mjs            # 0=위키가 최신 · 1=낡았다
 *   node observatory/verify-beacon.mjs --record   # 방금 발행했다고 기록한다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

rejectUnknownFlags(process.argv.slice(2), ['--universe', '--record', '--no-render', '--local'], 'universe beacon');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/* 배달본에서 직접 부르면 사유를 대고 죽는다 — 생 스택트레이스 대신(R91). */
await requireUniverseSource(ROOT, 'universe beacon');
const ROOT_DIR = ROOT;
const PAGES = join(ROOT, 'beacon/out/pages');
const LEDGER = join(ROOT, 'beacon/published.json');
const record = process.argv.includes('--record');

/* ⚠️⚠️ **먼저 렌더한다.** 이걸 안 했다가 구멍이 났다 — 발행본이 정본보다 낡은 채로
   발행되고, 그 낡은 것에 `--record` 가 「최신」 도장을 찍었다. 그러면 이 검사는
   **낡음을 최신이라고 말한다.** 발행본은 파생물이므로 재기 전에 다시 만든다.
   (갈래가 mtime 을 비교해 이 구멍을 찾아냈다 — 감시자가 못 본 것이다.) */
if (!process.argv.includes('--no-render')) {
  const rendered = await new Promise((res) => {
    const child = spawn(process.execPath, [resolve(ROOT_DIR, 'beacon/render.mjs')], { cwd: ROOT_DIR, stdio: 'ignore' });
    child.on('close', res);
  });
  if (rendered !== 0) {
    console.error(`⛔ 렌더가 실패했다(exit ${rendered}). 발행본을 믿을 수 없으므로 여기서 멈춘다.`);
    process.exit(1);
  }
}

const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

let files;
try {
  files = (await readdir(PAGES)).filter((f) => f.endsWith('.md')).sort();
} catch {
  console.error('⛔ 발행본이 없다. `universe render` 를 먼저 돌려라.');
  process.exit(1);
}

const current = {};
/* ⚠️ **발행본이 무한히 자라지 않는가.** 위키는 뷰지 보관소가 아니다.
   실측: 라운드 평가표를 전부 실었더니 `rounds` 한 장이 22.6KB — 7장 합계의 절반이었고
   라운드마다 1.3KB 씩 늘고 있었다. R60 이면 80KB 다. **그쯤 되면 아무도 안 읽는다.**
   한도는 실측에서 골랐다 — 나머지 여섯 장이 1.8~6.6KB 이므로 그 두 배쯤이 경계다. */
const PAGE_LIMIT = 12 * 1024;
const oversized = [];
for (const file of files) {
  const text = await readFile(join(PAGES, file), 'utf8');
  current[file.replace(/\.md$/, '')] = digest(text);
  /* ⚠️ **글자 수가 아니라 바이트로 잰다.** 처음엔 `text.length` 로 쟀는데 한글은
     UTF-8 에서 3바이트라 **23KB 짜리 파일이 8천 자로 세어져** 한도를 안 넘었다.
     음성 시험이 아니었으면 「한도가 있다」고 믿고 넘어갔을 것이다. */
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > PAGE_LIMIT) { oversized.push(`${file} ${Math.round(bytes / 1024)}KB`); }
}
if (oversized.length > 0) {
  console.error(`⛔ ${Math.round(PAGE_LIMIT / 1024)}KB 를 넘은 발행본: ${oversized.join(' · ')}`);
  console.error('   위키는 **뷰지 보관소가 아니다** — 렌더가 옛것을 잘라 내게 하고 정본은 저장소에 두라.');
  process.exit(1);
}

/**
 * ⚠️ **관문에 걸 수 있는 부분과 없는 부분을 가른다.**
 * 크기 한계는 자격증명 없이 잰다 — 그래서 `round close` 에 걸 수 있다.
 * 발행 신선도는 **실제로 발행해야** 판정되므로 관문이 될 수 없다.
 * 이 둘이 한 명령에 묶여 있어서 **검사 전체가 관문 밖에 있었고**, 그 사이
 * `rounds.md` 가 13KB, `nebula.md` 가 14KB 로 한계를 넘은 채 살았다(R38 에서 발견).
 */
if (process.argv.includes('--local')) {
  console.log(`✅ 발행본 ${Object.keys(current).length}장이 전부 ${PAGE_LIMIT / 1024}KB 아래다 (발행 신선도는 --local 에서 안 본다).`);
  process.exit(0);
}

if (record) {
  await writeFile(LEDGER, `${JSON.stringify({ pages: current }, null, 2)}\n`, 'utf8');
  console.log(`✅ 발행 기록 — ${Object.keys(current).length}장의 지문을 남겼다.`);
  console.log('   ⚠️ 이 기록은 **내가 보낸 것**이지 위키에 있는 것이 아니다. 위키를 직접 고쳤다면 이 기록은 거짓이다.');
  process.exit(0);
}

const ledger = await readFile(LEDGER, 'utf8').then((t) => JSON.parse(t).pages ?? {}).catch(() => null);
if (ledger === null) {
  console.log('── 위키 최신성 — 발행 기록이 없다.');
  console.log('  ⚠️ 한 번도 기록하지 않았다. 발행한 뒤 `universe beacon --record` 를 돌려라.');
  process.exit(1);
}

const stale = Object.keys(current).filter((slug) => current[slug] !== ledger[slug]);
const gone = Object.keys(ledger).filter((slug) => !(slug in current));

console.log(`── 위키 최신성 — 발행본 ${Object.keys(current).length}장`);
if (stale.length === 0 && gone.length === 0) {
  console.log('  ✅ 마지막으로 발행한 것과 같다.');
  process.exit(0);
}
for (const slug of stale) {
  console.log(`  ⛔ ${slug} — 렌더가 바뀌었는데 발행하지 않았다 (${ledger[slug] ?? '기록 없음'} → ${current[slug]})`);
}
for (const slug of gone) {
  console.log(`  ⚠️ ${slug} — 기록에는 있는데 지금 발행본에 없다`);
}
console.log('\n   발행한 뒤 `universe beacon --record` 로 기록을 갱신하라.');
process.exit(1);
