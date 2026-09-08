#!/usr/bin/env node
/**
 * **은하에 「페이지별 아키텍처 · 메뉴별 설명」이 있는가** — 없으면 만들 수 있다.
 *
 * ## 왜 있나 — 받아 온 저장소는 **말이 없다**
 *
 * 사람의 계획은 「주소를 넣어 받아 오고(`clone`) · 들이고(`adopt`) · 재고(`observe`)」로 이어진다.
 * 그런데 갓 들인 은하는 **자기가 무엇으로 이루어졌는지 한 줄도 안 들고 있다.** 그 상태로
 * 관문을 돌리면 수치는 나오는데 **그 수치가 어느 화면의 것인지 아무도 모른다.**
 * ⇒ 먼저 **구조부터 세운다.** 이 도구는 그 자리다.
 *
 * ## ⛔⛔ 이 도구의 제1 위험은 **돈**이다
 *
 * 기본은 **모델 호출 0회**다. `--write` 없이는 **무엇을 부를지만 말하고 끝낸다.**
 * `--write` 를 주면 **부르기 전에 몇 번 부를지 · 파일 몇 개를 읽을지 화면에 먼저 말하고**
 * 「⚠️ 토큰 사용량이 큽니다」를 ⛔ 로 시작하는 줄로 경고한다.
 * ⚠️ 「공짜인 줄 알고 돌렸다」가 이 저장소가 가장 싫어하는 사건이다(R145).
 * `observatory/extract.mjs` 가 세운 규율을 **그대로** 따른다 — 그게 정본이다.
 *
 * ## 두 갈래
 *
 *   ① **있는가를 잰다** (기본 · 모델 0회)
 *      ⛔ 설명이 없으면 **⚪ 못 쟀다**(종료코드 3)이지 「구조가 없다」가 **아니다.**
 *      「구조가 없다」는 이 도구가 낼 수 있는 말이 아니다 — 코드는 거기 그대로 있다.
 *   ② **없으면 만든다** (`--write` — **그때만** 모델을 부른다)
 *
 * 그리고 설명이 있으면 **1차로 규칙에 맞는지 잰다**(모델 0회):
 * 필수 칸이 있는가 · **실재하는 자리**를 가리키는가 · 사람이 채울 자리(`TODO:`)가 남았는가 ·
 * 본문이 비어 있지 않은가 · 설명이 없는 자리가 남았는가.
 *
 * ## ⛔ 「수정」은 **두 겹**이다
 *
 * 고치는 것은 **남의 저장소를 자동으로 고치는 일**이다. 그래서
 * **은하가 `commands.lintFix` 를 선언했고 · 사람이 `--fix` 를 준** 두 겹이 다 맞을 때만 돈다.
 * 한 겹만 있으면 **안 고치고 왜 안 고쳤는지 말한다.**
 *
 * ## ⛔ 이 도구가 **못 재는 것** (§8 — 안 적으면 부품 시험이 문다)
 *   · **설명이 맞는 말인가.** 산문은 모델이 쓴다 — 이 도구는 「있는가 · 자리를 가리키는가」만 잰다.
 *   · **모양이 다른 라우터.** 경로를 코드로 조립하면(`` `/${base}/x` ``) URL 리터럴이 안 남아
 *     **안 잡힌다.** 그건 「라우터가 없다」가 아니라 **「못 봤다」**다.
 *   · **템플릿 문법**(`.vue`·`.svelte`·`.astro`). 코드지만 안 읽는다 — **몇 개를 못 읽었는지 센다.**
 *   · **설명이 다음 주행을 낫게 하는가.** 아직 아무도 안 쟀다.
 *   · **`--fix` 가 무엇을 고쳤는가.** 은하가 선언한 명령을 돌리고 **종료코드만** 전한다.
 *
 * 재는 법:
 *   universe blueprint --galaxy <은하>                                  # 있는가만 잰다 (모델 0회)
 *   universe blueprint --galaxy <은하> --write [--model <모델>]          # 만든다 (모델 N회)
 *   universe blueprint --galaxy <은하> --write --max-units 8 --max-files 10
 *   universe blueprint --galaxy <은하> --fix                            # 1차 수정 (은하가 선언했을 때만)
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 *
 * 종료코드: 0 통과 · 1 어긋남 · 3 **못 쟀다**
 */
import { readdir, readFile, mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { findGalaxyFile, resolveGalaxyPath } from '../lib/galaxy-load.mjs';
import { codeTargets, codeTargetLabel } from '../lib/galaxy-scan.mjs';
import { READABLE, CODE_BUT_BLIND, notAuthored } from '../lib/blind.mjs';
import { frontmatter } from '../lib/frontmatter.mjs';
import { firstFilled } from '../lib/pick.mjs';
import { toolMissing } from '../lib/tool.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';
import { openEngine } from '../lib/engine.mjs';
import {
  blueprintPaths, collectUnits, routeLiterals, budgetSlice,
  cardProblems, coverage, renderCard, renderIndex, BLUEPRINT_PROMPT, foldUnit,
} from '../lib/blueprint.mjs';

const execFileAsync = promisify(execFile);

const argv = process.argv.slice(2);
/* ⛔ **한 줄로 닫는다.** 인자 감사(`verify-args`)는 `[…]` 뒤에 바로 `, '이름')` 이 오는 꼴만
   읽는다 — 끝에 쉼표를 남기면 매치가 깨져서 **이 명령이 감사에서 통째로 사라진다.**
   사라진 것은 빨간불이 아니라 **조용함**이라 아무도 모른다(§8). */
rejectUnknownFlags(argv,
  ['--universe', '--galaxy', '--write', '--model', '--fix', '--max-units', '--max-files'], 'universe blueprint');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const number = (name, fallback) => {
  const raw = flag(name);
  const value = Number(raw);
  return raw === undefined ? fallback : (Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback);
};

/* 한 자리에 보낼 파일 수 · 한 번에 설명할 자리 수. ⛔ 자르되 **몇 개를 안 봤는지 말한다**(§8). */
const MAX_FILES = number('--max-files', 12);
const MAX_UNITS = number('--max-units', 12);
/* 파일 하나에서 보낼 글자 수. 큰 파일 한 장이 호출을 통째로 비싸게 만든다. */
const MAX_CHARS = 6000;
/* 훑기 자체의 상한 — 큰 저장소에서 **재는 일**이 비싸지면 아무도 안 돌린다. */
const MAX_SCAN = 4000;

const root = await requireUniverseHome(flag('--universe'));
const config = JSON.parse(await readFile(path.join(root, 'universe.config.json'), 'utf8'));
const galaxyName = flag('--galaxy') ?? config.galaxies?.[0];

const file = await findGalaxyFile(root, galaxyName);
if (!file) {
  console.error(`⛔ 없는 은하: ${galaxyName}\n   등록된 것: ${(config.galaxies ?? []).join(' · ') || '(없음)'}`);
  process.exit(1);
}
const galaxy = resolveGalaxyPath(root, JSON.parse(await readFile(file, 'utf8')));

const wantWrite = argv.includes('--write');
const wantFix = argv.includes('--fix');
const paths = blueprintPaths(galaxy.path);

console.log(`── 구조 설명 — 은하 ${galaxyName}`);
console.log(`   저장소  ${galaxy.path}`);
console.log(`   훑는 곳 ${codeTargetLabel(galaxy)}`);
console.log(`   카드    ${paths.dir}`);

/**
 * ⛔ **가장 먼저 돈이 나가는지 말한다.** 이 줄이 화면 아래쪽에 있으면 아무도 안 읽는다 —
 * 그리고 「공짜인 줄 알고 돌렸다」가 그렇게 난다(R145).
 */
if (wantWrite) {
  console.log('\n⛔ `--write` 를 줬다 — **모델을 부른다.** 몇 번 부를지는 자리를 센 뒤에 말한다.');
} else {
  console.log('\n⛔ **모델을 0번 부른다** — `--write` 를 안 줬다. 이 주행은 재기만 한다.');
}

/* ── ⛔ 「수정」의 두 겹을 **일 시작 전에** 판정한다 ────────────────────────── */

const lintFix = firstFilled(galaxy.commands?.lintFix);
if (wantFix && !lintFix) {
  console.log('\n⚪ **못 고쳤다** — 이 은하는 `commands.lintFix` 를 선언 안 했다.');
  console.log('   고치는 것은 **남의 저장소를 자동으로 고치는 일**이라 두 겹이 다 맞아야 한다:');
  console.log('   ① 은하 좌표가 `commands.lintFix` 를 선언하고 ② 사람이 `--fix` 를 준다.');
  console.log('   ⛔ 이것은 「고칠 것이 없다」가 아니다 — **무엇으로 고칠지 모르는 것**이다(§8).');
  process.exit(EXIT_UNMEASURED);
}

/* ── ① 무엇을 설명해야 하나 — **구조로** 찾는다(§9) ─────────────────────── */

/**
 * 훑는다. ⛔ 폴더 이름을 열거하지 않는다 — 버려질 자리(설치물·생성물)는
 * `lib/blind.mjs` 의 `notAuthored` 가 한 자리에서 판정한다.
 */
const scanned = [];
let seen = 0;
let blind = 0;
let truncated = false;
const walk = async (rel) => {
  if (seen >= MAX_SCAN) {
    truncated = true;
    return;
  }
  const here = path.join(galaxy.path, rel);
  for (const entry of await readdir(here, { withFileTypes: true }).catch(() => [])) {
    const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || notAuthored(`${next}/`)) {
        continue;
      }
      /* eslint-disable-next-line no-await-in-loop */
      await walk(next);
      continue;
    }
    if (notAuthored(next)) {
      continue;
    }
    if (CODE_BUT_BLIND.test(entry.name)) {
      blind += 1;
      continue;
    }
    if (!READABLE.test(entry.name)) {
      continue;
    }
    seen += 1;
    if (seen > MAX_SCAN) {
      truncated = true;
      return;
    }
    /* eslint-disable-next-line no-await-in-loop */
    const text = await readFile(path.join(galaxy.path, next), 'utf8').catch(() => '');
    scanned.push({ at: next, routes: routeLiterals(text) });
  }
};
for (const target of codeTargets(galaxy)) {
  await walk(target);
}

console.log('\n① 무엇을 설명해야 하나');
console.log(`   읽은 파일 **${scanned.length}개**${blind > 0 ? ` · 코드인데 못 읽는 파일 ${blind}개(템플릿 문법)` : ''}${truncated ? ` · ⛔ ${MAX_SCAN}개에서 **잘랐다**` : ''}`);

const units = collectUnits(galaxy, scanned);

/**
 * 관측 법칙 §8 — **0 은 무죄가 아니다.** 자리를 하나도 못 찾은 것은 「이 은하에 화면이 없다」가
 * 아니라 **「우리가 못 봤다」**다. 좌표가 엉뚱한 곳을 가리켰을 수도, 관례가 다를 수도 있다.
 */
if (units.length === 0) {
  console.log('\n⚪ **못 쟀다** — 설명할 자리를 하나도 못 찾았다.');
  console.log(`   훑은 곳: ${codeTargetLabel(galaxy)} — 여기에 읽을 수 있는 코드가 ${scanned.length}개였다.`);
  console.log('   ⛔ 이것은 「이 은하에 화면이 없다」가 **아니다.** 셋 중 하나다:');
  console.log('   ① 좌표의 `codeDirs`·`appDir` 이 코드가 없는 자리를 가리킨다');
  console.log('   ② 좌표가 `solarSystems` 를 하나도 선언 안 했다');
  console.log('   ③ 이 저장소는 `index.*` 도 URL 리터럴도 안 쓴다 — 그러면 **구조로는 못 찾는다**');
  process.exit(EXIT_UNMEASURED);
}

const byKind = units.reduce((acc, u) => ({ ...acc, [u.kind]: (acc[u.kind] ?? 0) + 1 }), {});
console.log(`   자리 **${units.length}개** — ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
/**
 * ⛔ **좌표가 선언한 자리가 실재하는지 여기서 묻는다.** 안 물으면 그 자리는 **영영 못 덮인다** —
 * 카드를 아무리 써도 「가리키는 자리가 없다」로 물리고, 사람은 **카드를 고치러 간다.**
 * 잘못은 카드가 아니라 **좌표**에 있다. 귀속을 틀리면 고치는 자리도 틀린다.
 */
for (const unit of units) {
  /* eslint-disable-next-line no-await-in-loop */
  unit.exists = await stat(path.join(galaxy.path, unit.at)).then(() => true).catch(() => false);
  console.log(`   · ${unit.at}   (${unit.kind} — ${unit.why})${unit.exists ? '' : '   ⛔ **이 자리가 저장소에 없다**'}`);
}

/* ── ② 지금 설명이 있는가 ────────────────────────────────────────────── */

const readCards = async () => {
  const names = (await readdir(paths.dir).catch(() => [])).filter((n) => n.endsWith('.md')).sort();
  const out = [];
  for (const name of names) {
    /* eslint-disable-next-line no-await-in-loop */
    const text = await readFile(path.join(paths.dir, name), 'utf8');
    const front = frontmatter(text);
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
    /* eslint-disable-next-line no-await-in-loop */
    const atExists = String(front.at ?? '').trim() === ''
      ? true
      : await stat(path.join(galaxy.path, front.at)).then(() => true).catch(() => false);
    out.push({ file: name, front, body, atExists });
  }
  return out;
};

let cards = await readCards();
console.log('\n② 지금 설명이 있는가');
console.log(`   카드 **${cards.length}장**`);

/* ── ⛔ 없으면 만든다 — **`--write` 를 줘야만** ──────────────────────────── */

if (!wantWrite && cards.length === 0) {
  const { taken, skipped } = budgetSlice(units, MAX_UNITS);
  console.log('\n⚪ **못 쟀다** — 페이지별 아키텍처도 메뉴 설명도 하나도 없다.');
  console.log('   ⛔ 이것은 「구조가 없다」가 **아니다.** 코드는 거기 그대로 있고, **설명이 없어서**');
  console.log('      「규칙에 맞는가」를 잴 수가 없는 것이다(§8 — 없는 것과 못 쟀다는 다르다).');
  console.log('\n   만들려면 `--write` 를 줘라. 그러면 이렇게 부른다:');
  console.log(`   ⛔ **모델을 ${taken.length}번** 부른다 (자리 하나에 한 번)${skipped > 0 ? ` — 자리 ${skipped}개는 **이번에 안 부른다**` : ''}`);
  console.log(`   ⛔ 자리마다 파일 최대 ${MAX_FILES}개 · 파일마다 최대 ${MAX_CHARS}자를 읽어서 보낸다`);
  console.log(`   쌓일 곳: ${paths.dir}`);
  console.log(`   node observatory/blueprint.mjs --galaxy ${galaxyName} --write`);
  process.exit(EXIT_UNMEASURED);
}

if (wantWrite) {
  const picked = budgetSlice(units, MAX_UNITS);
  /* 보낼 파일을 **먼저 다 고른다** — 몇 개를 읽는지 말하고 나서 불러야 하기 때문이다. */
  const jobs = [];
  for (const unit of picked.taken) {
    const under = scanned.filter((s) => s.at === unit.at || s.at.startsWith(`${unit.at}/`));
    const { taken, skipped } = budgetSlice(under, MAX_FILES);
    const samples = [];
    for (const s of taken) {
      /* eslint-disable-next-line no-await-in-loop */
      const text = await readFile(path.join(galaxy.path, s.at), 'utf8').catch(() => '');
      samples.push({ at: s.at, text: text.slice(0, MAX_CHARS) });
    }
    jobs.push({ unit, samples, skipped, files: taken });
  }
  const fileCount = jobs.reduce((n, j) => n + j.samples.length, 0);
  const fileSkipped = jobs.reduce((n, j) => n + j.skipped, 0);

  /* ⛔⛔ **부르기 전에 말한다.** 사용자가 명시적으로 요구한 경고다. */
  console.log(`\n⛔ ⚠️ 토큰 사용량이 큽니다 — **모델을 ${jobs.length}번** 부른다 (자리 하나에 한 번).`);
  console.log(`   읽어서 보낼 파일 **${fileCount}개** (파일마다 최대 ${MAX_CHARS}자)`);
  console.log(`   ⛔ 안 보내는 파일 **${fileSkipped}개** — 자리마다 ${MAX_FILES}개에서 잘랐다(§8: 몇 개를 안 봤는지 말한다)`);
  console.log(`   ⛔ 설명 안 할 자리 **${picked.skipped}개** — 한 번에 ${MAX_UNITS}개까지만 부른다`);
  console.log(`   ⇒ 줄이려면: --max-units <수> --max-files <수>`);

  const { harness } = await openEngine(root, config, ['harness']);
  const promptDir = await mkdtemp(path.join(tmpdir(), 'blueprint-'));
  const promptFile = path.join(promptDir, 'BLUEPRINT_PROMPT.md');
  await writeFile(promptFile, BLUEPRINT_PROMPT, 'utf8');
  await mkdir(paths.dir, { recursive: true });

  const measuredAt = new Date().toISOString();
  let written = 0;
  for (const job of jobs) {
    /* eslint-disable-next-line no-await-in-loop */
    const answer = await harness.callClaude({
      systemPromptFile: promptFile,
      input: foldUnit(job),
      model: flag('--model') ?? 'sonnet',
    });
    if (answer.isError) {
      console.log(`   ⛔ ${job.unit.at} — 모델 호출이 실패했다: ${answer.failure ?? '(사유 없음)'}`);
      continue;
    }
    /* eslint-disable-next-line no-await-in-loop */
    await writeFile(
      path.join(paths.dir, `${job.unit.id}.md`),
      renderCard({
        unit: job.unit,
        files: job.files,
        skipped: job.skipped,
        body: answer.text,
        measuredAt,
        galaxyName,
      }),
      'utf8',
    );
    written += 1;
    console.log(`   ✅ ${job.unit.at} → ${job.unit.id}.md`);
  }

  cards = await readCards();
  await writeFile(
    paths.index,
    renderIndex({
      galaxyName,
      rows: cards.map((c) => `| ${c.front.at ?? '?'} | ${c.front.kind ?? '?'} | [${c.file}](blueprint/${c.file}) |`),
      command: `node observatory/blueprint.mjs --galaxy ${galaxyName} --write`,
      skippedUnits: picked.skipped,
    }),
    'utf8',
  );
  console.log(`\n   카드 ${written}장을 썼다 — ${paths.dir}`);
  console.log('   ⚠️ 산문은 **모델이 쓴 것**이다. 사실 칸(자리·종류·파일 수)만 기계가 쟀다.');
}

if (cards.length === 0) {
  console.log('\n⚪ **못 쟀다** — 설명이 한 장도 없다(`--write` 가 아무것도 못 썼다).');
  process.exit(EXIT_UNMEASURED);
}

/* ── ③ 1차 — 규칙에 맞는가 (⛔ 모델 0회) ────────────────────────────────── */

console.log('\n③ 1차 — 설명이 규칙에 맞는가 (모델 0회)');
const problems = cards.flatMap((card) => cardProblems(card));
/* ⛔ 없는 자리는 **덮으라고 요구하지 않는다** — 요구하면 영영 못 맞추는 숙제가 된다. */
const real = units.filter((u) => u.exists);
const { missing, stale } = coverage(real, cards);
for (const unit of units.filter((u) => !u.exists)) {
  problems.push(`${unit.at} — **좌표가 선언한 자리가 저장소에 없다** (카드가 아니라 좌표를 고쳐라)`);
}
for (const unit of missing) {
  problems.push(`${unit.at} — 이 자리를 설명하는 카드가 없다 (${unit.kind})`);
}

for (const line of problems) {
  console.log(`   ❌ ${line}`);
}
/* ⚠️ 낡은 카드는 **어긋남이 아니다** — 구조를 못 찾은 것일 수도 있다(§8). 말은 한다. */
for (const card of stale) {
  console.log(`   ⚠️ ${card.file} — 이제 단위로 안 잡히는 자리를 설명한다: ${card.front.at}`);
}
if (problems.length === 0) {
  console.log(`   ✅ 카드 ${cards.length}장이 전부 규칙에 맞고, 자리 ${real.length}개가 전부 덮였다.`);
}

/* ── ④ 수정 — **선언 + 플래그 두 겹** ───────────────────────────────────── */

console.log('\n④ 수정');
if (!wantFix) {
  console.log(`   (--fix 를 안 줬다 — **아무것도 안 고쳤다.**${lintFix ? ' 이 은하는 `commands.lintFix` 를 선언했다.' : ''})`);
} else {
  console.log(`   ⛔ **남의 저장소를 고친다** — 은하가 선언한 명령을 그대로 돌린다: ${lintFix}`);
  for (const target of codeTargets(galaxy)) {
    const cmd = lintFix.replaceAll('<TARGET>', `./${target}`).replaceAll('<WORKSPACE>', galaxy.appWorkspace ?? '');
    /* eslint-disable-next-line no-await-in-loop */
    const failure = await execFileAsync('bash', ['-c', cmd], { cwd: galaxy.path, maxBuffer: 32 * 1024 * 1024 })
      .then(() => null)
      .catch((error) => error);
    if (failure && toolMissing(failure)) {
      /* ⛔ 「명령이 실패한 것」과 「명령을 못 돌린 것」은 다르다(R69) — 못 돌린 것을 남의 잘못으로 돌리지 않는다. */
      console.log(`   ⚪ ${target} — **못 돌렸다**(도구가 없다). 이 은하의 의존성이 안 깔렸다.`);
      continue;
    }
    console.log(`   ${failure ? '⚠️ ' : '✅'} ${target} — ${failure ? '고치는 명령이 0이 아닌 코드로 끝났다(남은 것이 있다)' : '돌았다'}`);
  }
  console.log('   ⚠️ **무엇이 고쳐졌는지는 안 쟀다**(§8) — `git diff` 로 사람이 본다.');
}

if (problems.length > 0) {
  console.log(`\n❌ 설명이 규칙에 어긋난다 — ${problems.length}건.`);
  process.exit(1);
}
console.log('\n✅ 이 은하는 페이지별 아키텍처와 메뉴 설명을 들고 있고, 1차 규칙에 맞다.');
