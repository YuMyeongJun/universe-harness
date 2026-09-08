#!/usr/bin/env node
/**
 * **TC 입구가 계약과 같은 칸을 쓰는가** — 양식·업로드 입구(`qa/src/tc/`)의 관문.
 *
 * ## ⛔ 왜 있는가 — 양식은 **계약과 두 벌이 되는 순간** 조용히 갈린다
 *
 * 사람이 내려받아 채우는 표와, 그 표를 판정하는 계약(`qa/src/run/contract.ts`)이 갈리면
 * **아무도 안 죽는다.** 사람은 계약이 안 읽는 칸을 정성껏 채우고, 도구는 「읽었다」고 말한다.
 * 계약이 `attribution` 을 하나 늘려도 양식은 모르고, 늘어난 그 값을 적은 줄은 거부된다.
 * ⚠️ R47·R91 이 잡은 그 모양이다 — **같은 지식이 두 자리에 있으면 한 자리만 고쳐진다.**
 *
 * ## ⛔ 질문은 **계약에서** 만들고, 답은 **도구를 돌려서** 받는다
 *
 * 이 검사가 칸 이름을 자기 안에 적어 두면 **대조가 아니라 순환**이다(같은 손이 양쪽을 적는다).
 *   질문 — `qa/src/run/contract.ts` 를 읽어 **필드와 값 어휘**를 뽑는다
 *   답   — `tc-form --emit` 을 **실제로 돌려** 나온 양식을 읽는다
 * ⚠️ 옆 검사(`verify-qa`)가 「질문을 답과 같은 자리에서 만들지 않는다」로 배운 것과 같다.
 *
 * ## 못 잡는 것 (§8 — 적어 둔다)
 *   · `qa/` 가 없거나 **빌드가 없으면 못 잰다**(⚪ 3). 통과가 아니다.
 *   · 칸의 **뜻**이 바뀐 것(이름은 같고 의미가 다른 것)은 못 본다.
 *   · 양식이 **읽히는지**는 여기서 안 잰다 — 그것은 `observatory/probe-tc.sh` 가 돌려 본다.
 *
 * 재는 법: `node observatory/verify-tc.mjs`
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';

/**
 * ⛔ 이름을 `universe tc` 라고 적지 **않는다** — 배분표(`bin/universe.mjs`)에 아직 없는 명령이라
 * 그렇게 적으면 **없는 명령을 치라는 처방**이 된다(`lib/selftest.mjs` 가 그것을 옳게 문다).
 * ⚠️ 부모가 배분표에 등재하면 그때 이름을 그 명령으로 바꿔라 — 지금은 부르는 법 그대로 적는다.
 */
rejectUnknownFlags(process.argv.slice(2), ['--universe'], 'observatory/verify-tc.mjs');

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const QA = path.join(ROOT, 'qa');
const CONTRACT = path.join(QA, 'src/run/contract.ts');
const CLI = path.join(QA, 'dist/tc/cli.js');
const TEMPLATES = path.join(QA, 'templates');

console.log('── TC 입구 — 양식이 계약과 같은 칸을 쓰는가');

if (!existsSync(QA) || !existsSync(CONTRACT)) {
  console.log('\n⏭  `qa/` 가 없다 — 배달본이다. 못 쟀다.');
  process.exit(0);
}
/* ⛔ 빌드가 없으면 **못 쟀다**이지 통과가 아니다(§8). */
if (!existsSync(CLI)) {
  console.log(`\n⚠️ **못 쟀다** — ${path.relative(ROOT, CLI)} 가 없다. \`npm --prefix qa run build\` 를 먼저 돌려라.`);
  console.log('   ⛔ 이것은 「양식이 계약과 같다」가 아니다.');
  process.exit(EXIT_UNMEASURED);
}

/* ── 질문 — 계약에서 뽑는다 ───────────────────────────────────────────── */

const contractSrc = readFileSync(CONTRACT, 'utf8');

/** `export type X = 'a' | 'b';` 의 값들. */
const unionOf = (name) => {
  const m = new RegExp(`export type ${name} =([^;]+);`).exec(contractSrc);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

/** `export interface X {` 블록의 필드 이름들. 중첩 객체는 없다(계약이 평평하게 쓴다). */
const fieldsOf = (name) => {
  const start = contractSrc.indexOf(`export interface ${name} {`);
  if (start === -1) return null;
  const open = contractSrc.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < contractSrc.length; i += 1) {
    if (contractSrc[i] === '{') depth += 1;
    if (contractSrc[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  const body = contractSrc.slice(open + 1, end);
  /* 주석 줄을 먼저 지운다 — 주석 안의 `id:` 를 필드로 읽으면 없는 칸을 요구하게 된다. */
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return [...new Set([...clean.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]))];
};

/**
 * 양식이 비추는 계약의 타입들. ⛔ 이름이 하나라도 계약에 없으면 **질문이 낡은 것**이므로
 * 통과시키지 않고 ⚪ 로 죽는다 — 「없는 것을 안 물어서 조용히 초록」이 이 검사의 최악이다.
 */
const CASE_TYPE = 'ICaseInput';
const NESTED = { evidence: 'IEvidence', verdict: 'IVerdict' };
const PRECONDITION_TYPE = 'IPrecondition';
const UNIONS = { origin: 'CaseOrigin', status: 'CaseStatus', attribution: 'Attribution', 'verdict.kind': 'VerdictKind' };

const wantedCaseColumns = [];
const caseFields = fieldsOf(CASE_TYPE);
const preFields = fieldsOf(PRECONDITION_TYPE);
const missingTypes = [];
if (caseFields === null) missingTypes.push(CASE_TYPE);
if (preFields === null) missingTypes.push(PRECONDITION_TYPE);
for (const [key, type] of Object.entries(NESTED)) {
  if (fieldsOf(type) === null) missingTypes.push(type);
}
for (const type of Object.values(UNIONS)) {
  if (unionOf(type) === null) missingTypes.push(type);
}
if (missingTypes.length > 0) {
  console.error(`\n⚠️ **못 쟀다** — 계약에서 못 찾은 타입: ${missingTypes.join(' · ')}`);
  console.error('   ⛔ 계약이 바뀌어 **질문이 낡았다.** 통과가 아니다 — 이 검사를 계약에 다시 맞춰라.');
  process.exit(EXIT_UNMEASURED);
}
for (const field of caseFields) {
  if (NESTED[field]) {
    for (const sub of fieldsOf(NESTED[field])) wantedCaseColumns.push(`${field}.${sub}`);
    continue;
  }
  wantedCaseColumns.push(field);
}

/* §8 — 0개를 뽑고 통과하지 않는다. 훑개가 눈이 멀면 여기서 드러난다. */
if (wantedCaseColumns.length === 0 || preFields.length === 0) {
  console.error('\n⚠️ **못 쟀다** — 계약에서 필드를 0개 뽑았다(훑개가 눈멀었다). 통과가 아니다.');
  process.exit(EXIT_UNMEASURED);
}
console.log(`   질문 — 계약이 아는 칸: 케이스 ${wantedCaseColumns.length}개 · 전제 ${preFields.length}개`);

/* ── 답 — 도구를 **실제로 돌려서** 받는다 ─────────────────────────────── */

const workdir = mkdtempSync(path.join(tmpdir(), 'verify-tc-'));
const emitted = {};
let failed = false;
const say = (line) => { console.error(line); failed = true; };

try {
  for (const format of ['tsv', 'csv']) {
    const out = path.join(workdir, format);
    const run = spawnSync(process.execPath, [CLI, '--emit', out, '--format', format], { encoding: 'utf8' });
    if (run.status !== 0) {
      console.error(`\n⚠️ **못 쟀다** — 양식을 못 내줬다(${format}, 종료코드 ${run.status}):\n${run.stderr}`);
      process.exit(EXIT_UNMEASURED);
    }
    emitted[format] = {
      cases: readFileSync(path.join(out, `tc-cases.${format}`), 'utf8'),
      preconditions: readFileSync(path.join(out, `tc-preconditions.${format}`), 'utf8'),
    };
  }

  /** 양식의 **머리 줄**(주석이 아닌 첫 줄)을 칸으로 가른다. */
  const headerOf = (text, delimiter) => {
    const line = text.split('\n').find((l) => l.trim() !== '' && !l.startsWith('#'));
    return line === undefined ? [] : line.split(delimiter).map((c) => c.replace(/^"|"$/g, ''));
  };
  const caseHeader = headerOf(emitted.tsv.cases, '\t');
  const preHeader = headerOf(emitted.tsv.preconditions, '\t');

  console.log(`   답   — 양식이 든 칸: 케이스 ${caseHeader.length}개 · 전제 ${preHeader.length}개`);

  /* ① 계약의 칸이 전부 양식에 있는가 */
  const lostCase = wantedCaseColumns.filter((name) => !caseHeader.includes(name));
  const lostPre = preFields.filter((name) => !preHeader.includes(name));
  if (lostCase.length > 0 || lostPre.length > 0) {
    say(`\n⛔ **양식이 계약의 칸을 잃었다** — 사람이 그 칸을 못 채운다(그리고 아무도 안 죽는다):`);
    for (const name of lostCase) say(`   · 케이스 ${name}`);
    for (const name of lostPre) say(`   · 전제 ${name}`);
    say('   ⇒ `qa/src/tc/schema.ts` 를 계약에 맞춰라.');
  }

  /* ② 계약의 값 어휘가 전부 양식의 설명에 있는가 — 사람이 그 값을 고를 수 있어야 한다 */
  const valuesInTemplate = new Map();
  for (const line of emitted.tsv.cases.split('\n').concat(emitted.tsv.preconditions.split('\n'))) {
    const m = /^#\s+(\S+)[^—]*—.*값:\s*(.+)$/.exec(line);
    if (m) valuesInTemplate.set(m[1], m[2].split('|').map((v) => v.trim()));
  }
  for (const [column, type] of Object.entries(UNIONS)) {
    const wanted = unionOf(type);
    const got = valuesInTemplate.get(column) ?? [];
    const lost = wanted.filter((v) => !got.includes(v));
    if (lost.length > 0) {
      say(`\n⛔ **양식이 계약의 값을 안 알려 준다** — ${column} (${type}): ${lost.join(' · ')}`);
      say(`   양식이 말하는 값: ${got.join(' | ') || '(없다)'}`);
    }
  }

  /* ③ 저장소에 커밋된 양식이 **지금 도구가 내주는 것과 같은가** — 낡은 양식은 거짓말이다 */
  for (const [name, body] of Object.entries(emitted.tsv)) {
    const committed = path.join(TEMPLATES, `tc-${name}.tsv`);
    if (!existsSync(committed)) {
      say(`\n⛔ 커밋된 양식이 없다: ${path.relative(ROOT, committed)}`);
      say(`   ⇒ node qa/dist/tc/cli.js --emit qa/templates`);
      continue;
    }
    if (readFileSync(committed, 'utf8') !== body) {
      say(`\n⛔ **커밋된 양식이 낡았다**: ${path.relative(ROOT, committed)}`);
      say('   내려받는 사람은 이 파일을 받는다 — 도구가 내주는 것과 다르면 그 표는 거부된다.');
      say('   ⇒ 지우고 다시: node qa/dist/tc/cli.js --emit qa/templates');
    }
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log('\n✅ 양식이 계약의 칸·값을 그대로 쓴다 (질문은 계약에서, 답은 도구를 돌려서 받았다)');
console.log('⚠️ **양식이 읽히는지는 여기서 안 쟀다** — 그것은 `observatory/probe-tc.sh` 가 돌려 본다(§8).');
