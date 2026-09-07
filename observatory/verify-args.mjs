#!/usr/bin/env node
/**
 * 인자 관측 — 받는 것 · 광고하는 것 · 문서가 적는 것이 셋 다 같은가.
 *
 * ⚠️ 왜: `universe round close --dry-run` 은 **구현돼 있는데 거부됐다.** §7 집행자
 * (`rejectUnknownFlags`)의 목록에서 빠져 있었고, 도구 자신의 사용법 문구는 그것을
 * 계속 광고하고 있었다. 시키는 대로 치면 「모르는 플래그」로 죽는다 — 기능이 산 채로
 * 묻혀 있었다. 문서가 낡은 것이 아니라 **가드가 기능을 죽인 것**이라 층이 다르다.
 *
 * 세 출처를 대조한다.
 *   A 받는다   §7 집행자에게 넘긴 목록 (lib/flags.mjs)          ← 진짜 동작
 *   B 광고한다  그 파일의 사용법·머리말에 적힌 `--플래그`     ← 도구가 하는 말
 *   C 문서가 적는다  docs/*.md · README.md                   ← 사용자가 읽는 것
 *
 * 판정
 *   B ⊄ A · C ⊄ A → ⛔ 시키는 대로 치면 죽는다
 *   A \ (B ∪ C)    → ⚠️ 숨은 플래그. 문서에 적거나 명부(args-internal.json)에 사유와 함께 올려라
 *   명부에 있는데 A 에 없다 → ⛔ 명부가 낡았다
 *
 * 재는 법: `node observatory/verify-args.mjs`
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { requireUniverseHome, requireUniverseSource } from '../lib/home.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe'], 'universe args');
const flagValue = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const ROOT = await requireUniverseHome(flagValue('--universe'));
await requireUniverseSource(ROOT, 'universe args');

const CALL = /rejectUnknownFlags\(\s*[^,]+,\s*\[([\s\S]*?)\]\s*,\s*'([^']+)'\s*\)/;

/* ⛔ **손으로 적은 폴더 목록이었다(R99).** `['bin','observatory','beacon','bigbang']` 이라
   `lib/` 이 빠졌는데, 배분표는 `parts → lib/selftest.mjs` 를 가리킨다 — 그 명령의 플래그는
   **아무도 안 봤다.** R91 이 진입점 목록에서 겪은 것과 같은 §9다.
   그래서 **배분표에서 찾는다** — 사용자가 칠 수 있는 명령이 곧 재야 할 대상이다. */
const routerSrc = await readFile(join(ROOT, 'bin/universe.mjs'), 'utf8');
const routerBlock = routerSrc.slice(routerSrc.indexOf('const SUBCOMMANDS'),
  routerSrc.indexOf('};', routerSrc.indexOf('const SUBCOMMANDS')));
const routed = [...routerBlock.matchAll(/^\s*([a-z-]+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]);
if (routed.length === 0) {
  console.error('⛔ 배분표를 못 읽었다 — 잴 대상이 0개가 된다. 통과가 아니다(§8).');
  process.exit(1);
}

/** A · B — 각 명령이 받는 것과 그 파일이 광고하는 것. */
const commands = new Map();
{
  for (const [routeName, file] of routed) {
    const src = await readFile(join(ROOT, file), 'utf8').catch(() => null);
    if (src === null) {
      continue;
    }
    /* ⛔ **첫 호출을 잡으면 안 된다(R99).** `lib/selftest.mjs` 는 §7 집행자 자체를 시험하려고
       `rejectUnknownFlags(['--check'], ['--check'], 'x')` 를 먼저 부른다 — 그것을 선언으로
       읽어 「`parts --check` 를 받는다」는 없는 사실을 만들어 냈다. **이름이 맞는 호출**만 본다. */
    const wanted = new RegExp(
      /* `]` 를 못 넘게 한다 — 넘으면 앞 호출부터 늘어나 **남의 목록을 읽는다**(실측). */
      `rejectUnknownFlags\\(\\s*[^,]+,\\s*\\[([^\\]]*)\\]\\s*,\\s*'(?:universe|bigbang)\\s+${routeName}'\\s*\\)`);
    const m = src.match(wanted) ?? src.match(CALL);
    if (!m) {
      continue;
    }
    const name = routeName;
    const accepts = new Set([...m[1].matchAll(/'--([a-z-]+)'/g)].map((x) => x[1]));
    /* 광고: 사용법 줄과 머리말 주석. 목록 자체(A)를 다시 읽지 않도록 그 줄은 뺀다. */
    const ads = new Set();
    for (const line of src.split('\n')) {
      if (line.includes('rejectUnknownFlags') || /^\s*\*?\s*'--/.test(line)) {
        continue;
      }
      /* ⛔ **「사용법」이란 낱말이 있으면 광고로 봤다(R99).** `lib/selftest.mjs` 의
         「그중 하나(`verify --stage`)는 **사용법 문서가 광고**하고 있었다」는 **과거를 설명하는
         주석**인데 광고로 잡혔다 — 산문을 데이터로 읽는 그 부류다.
         광고는 **그 명령을 실제로 부르는 꼴**로만 인정한다. */
      if (!new RegExp(`(?:universe|bigbang)\\s+${routeName}\\b`).test(line)) {
        continue;
      }
      for (const g of line.matchAll(/--([a-z-]+)/g)) {
        ads.add(g[1]);
      }
    }
    commands.set(name, { file, accepts, ads });
  }
}

/** C — 문서. 이어지는 줄(`└`·표)은 앞 명령의 문맥을 잇는다. */
const docFiles = ['README.md'];
for (const f of await readdir(join(ROOT, 'docs')).catch(() => [])) {
  if (f.endsWith('.md')) {
    docFiles.push(`docs/${f}`);
  }
}
const documented = new Map();
for (const file of docFiles) {
  const text = await readFile(join(ROOT, file), 'utf8').catch(() => '');
  let context = [];
  for (const line of text.split('\n')) {
    /* ⚠️ 한 줄이 명령을 여럿 댈 수 있다 — 첫 것만 세면 나머지는 「문서에 없다」가 된다. */
    const named = [...line.matchAll(/universe\s+([a-z]+)/g)].map((m) => m[1]);
    if (named.length > 0) {
      context = named;
    } else if (!/^\s*(└|\|)/.test(line)) {
      context = [];
    }
    for (const cmd of context) {
      if (!documented.has(cmd)) {
        documented.set(cmd, new Set());
      }
      for (const g of line.matchAll(/--([a-z-]+)/g)) {
        documented.get(cmd).add(g[1]);
      }
    }
  }
}

const registry = JSON.parse(
  await readFile(join(ROOT, 'observatory/args-internal.json'), 'utf8').catch(() => '{}'),
);

console.log(`── 인자 관측 — 명령 ${commands.size}개`);
const dead = [];
const wrongDoc = [];
const unjudged = [];
const staleRegistry = [];

for (const [cmd, { file, accepts, ads }] of commands) {
  const doc = documented.get(cmd) ?? new Set();
  for (const f of ads) {
    if (f !== 'universe' && !accepts.has(f)) {
      dead.push(`${cmd} --${f} — ${file} 이 광고하는데 거부한다`);
    }
  }
  for (const f of doc) {
    if (f !== 'universe' && !accepts.has(f)) {
      wrongDoc.push(`${cmd} --${f} — 문서가 적는데 거부한다`);
    }
  }
  for (const f of accepts) {
    if (f === 'universe' || doc.has(f) || ads.has(f) || registry[`${cmd} --${f}`]) {
      continue;
    }
    unjudged.push(`${cmd} --${f}`);
  }
}
for (const [key, reason] of Object.entries(registry)) {
  if (!key.includes(' --')) {
    continue;   /* 명부 머리말 */
  }
  if (typeof reason !== 'string' || reason.trim().length < 10) {
    staleRegistry.push(`${key} — 사유가 없다. 사유를 못 쓰면 문서에 적어야 한다는 뜻이다`);
    continue;
  }
  const [cmd, flag] = key.split(' --');
  if (!commands.get(cmd)?.accepts.has(flag)) {
    staleRegistry.push(`${key} — 명부에 있는데 이제 안 받는다`);
  }
}

const say = (mark, label, list) => {
  console.log(`  ${list.length === 0 ? '✅' : mark} ${label} ${list.length}건`);
  for (const x of list) {
    console.log(`     ${x}`);
  }
};
say('⛔', '광고하는데 거부한다', dead);
say('⛔', '문서가 적는데 거부한다', wrongDoc);
say('⛔', '명부가 낡았다', staleRegistry);
say('⚠️ ', '판단하지 않은 숨은 플래그', unjudged);

if (dead.length + wrongDoc.length + staleRegistry.length + unjudged.length > 0) {
  console.log('\n⛔ 시키는 대로 쳤을 때 죽는 자리가 있거나, 판단하지 않은 플래그가 있다.');
  console.log('   문서에 적거나 observatory/args-internal.json 에 **사유와 함께** 올려라.');
  process.exit(1);
}
console.log(`\n✅ 받는 것 · 광고하는 것 · 문서가 셋 다 맞고, 숨은 플래그는 전부 판단됐다 (내부용 ${Object.keys(registry).length}개).`);
