#!/usr/bin/env node
/**
 * **부품 시험** — `lib/` 의 순수 함수들. 배달되는 것이라 소비 저장소에서도 돈다.
 *
 * ⚠️ 여기 있는 것은 변이 시험(`universe checks`)으로는 못 잡는다. 저쪽은 **검사가 무는가**를
 * 보는데, 이 함수들은 검사가 아니라 검사의 재료다. 재료가 조용히 틀리면 검사는
 * 여전히 초록불을 낸다 — `fingerprint` 가 늘 빈 해시였던 것과 같은 모양이다(R37).
 *
 *   node lib/selftest.mjs
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFile, readdir, stat, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { join, relative } from 'node:path';

import { classifyBlind, READABLE, CODE_BUT_BLIND } from './blind.mjs';
import { codeTargets, codeTargetLabel, DEFAULT_CODE_DIRS } from './galaxy-scan.mjs';
import { rejectUnknownFlags } from './flags.mjs';
import { firstFilled } from './pick.mjs';
import { whyItFailed } from './why.mjs';
import { frontmatter } from './frontmatter.mjs';
import { splitTitle } from './argv.mjs';
import { nameProblem } from './name.mjs';
import { attributeCompileFailure, revertStar } from '../bigbang/expand.mjs';

/* ── 못 읽는 파일 분류 — 실측에서 나온 실제 경로로 시험한다(저장소 12곳 인구조사). */
const CASES = [
  ['app.vue', '코드'],
  ['src/components/Card.jsx', '코드'],
  ['compare_translations.js', '코드'],
  ['storybook-static/sb-preview/globals.js', '생성물'],
  ['public/smarteditor/contents/js/plugin/hp_SE2M_AttachQuickPhoto.js', '생성물'],
  ['dist/assets/react-vendor-DBoTRrZA.js', '생성물'],
  ['tailwind.config.js', '설정'],
  ['packages/components/eslint.config.js', '설정'],
  ['.eslintrc.cjs', '설정'],
  ['scripts/smoke.mjs', '스크립트'],
];
for (const [file, expected] of CASES) {
  assert.equal(classifyBlind(file), expected, `${file} → ${expected} 여야 한다`);
}
console.log(`✅ 못 읽는 파일 분류 ${CASES.length}건 (실측 경로로 시험)`);

/* ⛔ **모르는 것은 「코드」로 떨어져야 한다** — 안전한 방향이다.
   생성물로 떨어지면 안 재진 UI 가 조용히 사라진다. */
assert.equal(classifyBlind('완전히/새로운/자리/thing.svelte'), '코드');
assert.equal(classifyBlind('src/x.js'), '코드');
console.log('✅ 모르는 자리는 「코드」로 떨어진다 (실명 쪽이 아니라 경고 쪽으로 틀린다)');

/**
 * ⛔ **`.js`·`.jsx` 를 열었다 — 그런데 「연다」는 재고 나서 한 말이다.**
 *
 * 오래 「열면 **읽는 척만** 하게 된다」며 미뤄 왔다. 재 보니 틀렸다: 규칙 20개가
 * **전부 정규식**이고 TS 문법에 안 매여 있어, 같은 파일을 `.tsx`/`.jsx` 로 각각 먹이니
 * **똑같이 6개가 물었다**(naming-intent · img-alt · button-type · input-label ·
 * arbitrary-value ×2 · theme-hardcoded).
 *
 * ⛔ **`.vue`·`.svelte`·`.astro` 는 계속 안 연다.** 그것들은 **문법이 다르다**
 * (`<template>`·`<script>` 블록). 정규식이 안의 JS 를 우연히 맞혀도 **템플릿은 못 읽는다** —
 * 그러면 **「읽는다고 말하면서 못 읽는」** 상태가 되고, 그게 제일 나쁘다.
 * ⚠️ 그건 **플러그인의 일**이다. 여기 안 적으면 다음 사람이 「깜빡한 것」으로 알고 연다.
 */
assert.ok(READABLE.test('a.tsx') && READABLE.test('a.ts'));
assert.ok(READABLE.test('a.js') && READABLE.test('a.jsx'), '`.js`·`.jsx` 를 열었는데 안 열렸다');
assert.ok(!READABLE.test('a.vue') && !READABLE.test('a.svelte'),
  '`.vue`·`.svelte` 를 열었다 — 템플릿 문법은 정규식이 못 읽는다. **읽는 척**이 된다');
assert.ok(CODE_BUT_BLIND.test('a.vue') && CODE_BUT_BLIND.test('a.svelte'));
assert.ok(!CODE_BUT_BLIND.test('a.ts') && !CODE_BUT_BLIND.test('a.jsx'),
  '읽는 것과 못 읽는 것이 겹치면 분모가 두 번 세어진다');
console.log('✅ 읽는 확장자와 못 읽는 확장자가 겹치지 않는다 (.js·.jsx 열림 · .vue·.svelte 안 열림)');

/* ── 빈 문자열은 「있다」가 아니다 (R46·R47).
   ⛔ 설정값은 사람이 키만 남기고 값을 지우는 일이 흔하다. `??` 는 그것을 통과시킨다. */
assert.equal(firstFilled('', 'fallback'), 'fallback', '빈 문자열은 건너뛴다');
assert.equal(firstFilled('   ', 'fallback'), 'fallback', '공백뿐인 값도 건너뛴다');
assert.equal(firstFilled(undefined, null, '', 'fallback'), 'fallback');
assert.equal(firstFilled('real', 'fallback'), 'real', '값이 있으면 그것을 쓴다');
assert.equal(firstFilled(0, 'fallback'), 0, '0 은 값이다 — 숫자까지 건너뛰면 다른 버그가 된다');
assert.equal(firstFilled(false, 'fallback'), false, 'false 도 값이다');
assert.equal(firstFilled(), undefined);
console.log('✅ 빈 문자열을 건너뛰고 0·false 는 값으로 본다 (R46 버그 종류)');

/* ── 왜 빨간불인지 고르기 (R59).
   ⚠️ 꼬리 8줄만 보여 주다 **진짜 이유를 잘라 먹었다** — 화면엔 안내가 뜨고 `🔴` 는 사라졌다. */
const NOISY = [
  '  ✅ 토큰 법칙  0건',
  '  🔴 시맨틱 법칙  59건  기준선 40 → 실측 59 (+19)',
  '  ⛔ 관측 법칙 위반',
  '  ⓘ 안내 한 줄', '  ⓘ 안내 두 줄', '  ⓘ 세 줄', '  ⓘ 네 줄',
  '  ⓘ 다섯 줄', '  ⓘ 여섯 줄', '  ⓘ 일곱 줄', '  ⓘ 여덟 줄',
].join('\n');
const picked = whyItFailed(NOISY);
assert.ok(picked.includes('🔴 시맨틱 법칙'), '실패 줄을 골라야 한다 — 꼬리가 아니라');
assert.ok(picked.includes('⛔ 관측 법칙 위반'));
assert.ok(!picked.includes('여덟 줄'), '안내로 실패 줄을 밀어내면 안 된다');
/* 표식이 하나도 없으면 꼬리를 보여 준다 — 아무것도 안 보여 주는 것보다 낫다. */
assert.ok(whyItFailed('a\nb\nc', 2).includes('c'), '표식이 없으면 꼬리를 보여 준다');
console.log('✅ 빨간불의 이유를 고른다 (안내가 아니라 실패 줄)');

/* ── frontmatter 만 읽는가 (R66).
   ⚠️ 감사가 파일 전체를 훑다 **로그 본문의 예시**를 진짜 표식으로 읽었다 —
   이 저장소는 로그에 자기 출력을 그대로 인용하므로 그 함정이 늘 있다. */
const QUOTED = ['---', 'round: R01', 'closed: 2026-01-01', '---', '', '# 본문', '```', 'forced: 우주 형식', 'closed: 가짜', '```'].join('\n');
const meta = frontmatter(QUOTED);
assert.equal(meta.round, 'R01');
assert.equal(meta.closed, '2026-01-01');
assert.equal(meta.forced, undefined, '본문의 예시를 표식으로 읽으면 안 된다');
assert.deepEqual(frontmatter('머리말이 없는 글'), {}, 'frontmatter 가 없으면 빈 객체다');
console.log('✅ frontmatter 만 읽는다 (본문의 인용을 표식으로 안 읽는다)');

/* ── 사람의 문장을 플래그로 읽지 않는가 (R75). */
/* ⚠️ 실제로는 따옴표로 묶여 **한 토큰**이다 — 처음 이 시험을 낱말로 쪼개 놓고 틀렸다. */
const quoted = splitTitle(['new', '--universe 를 빼고 부르면 어떻게 되는가'], 'new');
assert.equal(quoted.title, '--universe 를 빼고 부르면 어떻게 되는가', '`--` 로 시작하는 제목도 통째로 남는다');
assert.deepEqual(quoted.flags, ['new'], '제목은 플래그 검사에 안 들어간다');
const carried = splitTitle(['new', '--universe', '/tmp/u', '제목', '이다'], 'new');
assert.equal(carried.title, '제목 이다', '--universe 와 그 값은 제목에서 뺀다');
assert.ok(carried.flags.includes('--universe') && carried.flags.includes('/tmp/u'));
assert.deepEqual(splitTitle(['close', '--force'], 'new').flags, ['close', '--force'], '다른 하위 명령은 그대로 검사한다');
console.log('✅ 제목을 플래그로 읽지 않는다 (§7 은 그대로 지킨다)');

/* ── 이름이 경로가 되지 않는가 (R76).
   ⚠️ `universe galaxy "../../탈출"` 이 **우주 밖 부모 폴더에 파일을 만들었다.**
   ⛔ 그리고 고치면서 **허용 글자를 열거**했다가 한글 이름을 막았다 — §9 가 금한 방식이다.
   위험한 것만 막고 사람의 말은 통과시킨다. */
for (const [bad, reason] of [['../../탈출', '탈출'], ['a/b', '구분자'], ['.숨김', '숨김'], ['..', '상위'], ['', '빈 이름']]) {
  assert.ok(nameProblem(bad), `막아야 한다: ${reason} (${bad})`);
}
for (const good of ['tiny-galaxy', '정상이름', '실측 은하 A', 'app.web', 'a_b-1']) {
  assert.equal(nameProblem(good), null, `사람의 말은 통과해야 한다: ${good}`);
}
console.log('✅ 이름이 경로가 되지 않는다 (위험한 것만 막고 한글은 통과)');

/* ── 컴파일 실패를 「못 쟀다」와 가르는가 (R146).
   ⚠️⚠️ 실측: 진짜 은하에서 `yarn build` 가 0.2초 만에 exit 1 로 죽었다 —
   `Environment variable not found (NODE_AUTH_TOKEN)`. yarn 이 자기 설정에서 멈춰
   **컴파일에 들어가지도 못한** 것인데 도구는 「별이 은하에서 서지 않는다」고 말했다.
   그 별은 멀쩡히 컴파일된다(env 를 채워 반증했다). 못 잰 것을 별 탓으로 돌린 것이다(§8). */
const YARN_ENV_DEATH = [
  'Usage Error: Environment variable not found (NODE_AUTH_TOKEN) in /repo/.yarnrc.yml',
  '━━━ Yarn Package Manager - 4.10.3 ━━━',
  '  $ yarn <command>',
].join('\n');
assert.equal(
  attributeCompileFailure({ out: YARN_ENV_DEATH, bases: ['/repo'], starDir: 'src/components/Probe' }).kind,
  'unmeasured',
  '컴파일에 들어가지도 못한 실패는 **못 쟀다**다 — 별 탓이 아니다',
);
/* 별의 파일이 나오면 별 탓이다 — 이쪽 갈래가 죽으면 진짜 결함이 통과한다. */
const STAR_BREAKS = 'src/components/Probe/Probe.tsx(12,5): error TS2322: Type ... is not assignable';
const starVerdict = attributeCompileFailure({ out: STAR_BREAKS, bases: ['/repo'], starDir: 'src/components/Probe' });
assert.equal(starVerdict.kind, 'star', '실패 출력이 별의 파일을 가리키면 별 탓이다');
assert.ok(starVerdict.starPaths.includes('src/components/Probe/Probe.tsx'));
/* 남의 파일만 나오면 은하 탓이다 — 별을 막되 **별의 잘못이라 말하지 않는다.** */
assert.equal(
  attributeCompileFailure({
    out: 'src/legacy/Old.tsx(3,1): error TS1005',
    bases: ['/repo'],
    starDir: 'src/components/Probe',
  }).kind,
  'galaxy',
  '별의 폴더 밖만 나오면 은하 탓이다',
);
console.log('✅ 컴파일 실패를 셋으로 가른다 (별 탓 · 은하 탓 · 못 쟀다)');

/* ── 되돌리기가 **우리 것은 지우고 남의 것은 지키는가** (R146).
   ⚠️⚠️ 실측: 1차의 `lintFix` 가 별의 `index.ts` 를 고쳤는데 그 변경을 다시 안 찍어서,
   되돌리기가 그것을 **남의 작업으로 착각하고 남겼다** — 남의 저장소에 파일이 남았다.
   「빅뱅이 빨간불로 끝나면 은하에 흔적이 없다」가 깨진 자리다. 양쪽을 다 잰다:
   재-찍기를 지우면 첫째가 죽고, 보호를 지우면 둘째가 죽는다. */
const revertDir = join(tmpdir(), `universe-revert-${process.pid}`);
await rm(revertDir, { recursive: true, force: true });
const revertFiles = [
  { path: 'Star/ours.ts', content: 'const a = 1;\n' },
  { path: 'Star/theirs.ts', content: 'const b = 2;\n' },
];
const { mkdir } = await import('node:fs/promises');
await mkdir(join(revertDir, 'Star'), { recursive: true });
for (const file of revertFiles) {
  await writeFile(join(revertDir, file.path), file.content);
}
/* 남이 고친 것 하나 — 디스크만 바꾸고 `content` 는 그대로 둔다. */
await writeFile(join(revertDir, 'Star/theirs.ts'), '사람이 고쳤다\n');
const reverted = await revertStar({ targetBase: revertDir, files: revertFiles, relDir: 'Star' });
assert.deepEqual(reverted.removed, ['Star/ours.ts'], '우리가 쓴 그대로인 파일은 지운다');
assert.deepEqual(reverted.kept, ['Star/theirs.ts'], '남이 고친 파일은 **남긴다**');
assert.ok(existsSync(join(revertDir, 'Star/theirs.ts')), '남의 작업은 디스크에 그대로 있어야 한다');
await rm(revertDir, { recursive: true, force: true });
console.log('✅ 되돌리기가 우리 것은 지우고 남의 것은 지킨다');

/* ── 관측 법칙 §7 — 모르는 플래그를 삼키지 않는다. */
assert.doesNotThrow(() => rejectUnknownFlags(['--check'], ['--check'], 'x'));
let exited = null;
const realExit = process.exit;
const realError = console.error;
process.exit = (code) => { exited = code; throw new Error('exit'); };
console.error = () => {};
try {
  rejectUnknownFlags(['--없는것'], ['--check'], 'x');
} catch { /* exit 를 흉내 냈으니 여기로 온다 */ }
process.exit = realExit;
console.error = realError;
assert.equal(exited, 1, '모르는 플래그는 exit 1 이어야 한다');
console.log('✅ 모르는 플래그는 거부된다 (§7)');

/* ── 엔진 배치를 아는 자리가 하나뿐인가 (R47).
   ⛔ 같은 지식이 여러 자리에 있으면 한 자리만 고쳐진 채 갈린다 — R46 이 그 모양이었다.
   ⚠️ 소비 저장소에는 우주 소스가 없다. 없으면 **못 잰다고 말하고 넘어간다**(§8). */
const HERE = new URL('.', import.meta.url).pathname;
const ROOT = join(HERE, '..');
/* 우주 자신의 저장소인가 — 엔진 소스는 배달되지 않으므로 그것이 있으면 여기가 우주다.
   ⚠️ 여러 곳에서 쓴다 — **한 자리에서 정한다**(두 자리에 두면 한 자리만 바뀐다 · R47).
   ⛔ **맨 위에서 정한다.** 쓰는 자리보다 아래에 두면 TDZ 로 죽는다 — 실제로 그랬다. */
const isUniverseSource = existsSync(join(ROOT, 'observatory/engine'));
/* ⛔ 실측(R91): 이 진입점은 모르는 플래그를 **그냥 삼켰다** — §7 갈래가 손으로 적은
   7개 목록이라 여기가 그 밖이었다. 열거 밖은 영영 안 보인다(§9). */
rejectUnknownFlags(process.argv.slice(2), ['--universe'], 'universe parts');
/* ⛔ 실측(R91): 이 진입점은 모르는 플래그를 **그냥 삼켰다** — §7 갈래가 손으로 적은
   7개 목록이라 여기가 그 밖이었다. 열거 밖은 영영 안 보인다(§9). */
rejectUnknownFlags(process.argv.slice(2), ['--universe'], 'universe parts');
const SCAN_DIRS = ['bin', 'observatory', 'bigbang', 'beacon'];
const collect = async (dir) => {
  const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true }).catch(() => [])) {
    if (entry.name === 'engine' || entry.name === 'node_modules') {
      continue;
    }
    const rel = `${dir}/${entry.name}`;
    out.push(...(entry.isDirectory() ? await collect(rel) : rel.endsWith('.mjs') ? [rel] : []));
  }
  return out;
};
const sources = (await Promise.all(SCAN_DIRS.map(collect))).flat();
if (sources.length === 0) {
  console.log('⏭  엔진 배치 검사 — 우주 소스가 없다(소비 저장소). 못 쟀다.');
} else {
  const offenders = [];
  for (const file of sources) {
    const raw = await readFile(join(ROOT, file), 'utf8');
    /* ⚠️ **주석은 코드가 아니다.** 줄 앞머리만 보다가 여러 줄 주석의 **가운데 줄**을 놓쳤다 —
       R46 을 설명하는 문장이 「손으로 이었다」로 걸렸다. 검사가 자기 설명을 위반으로 읽었다.
       ⇒ 규칙 엔진이 쓰는 것과 같은 방식으로 **주석을 통째로 비운다**(줄 수는 지킨다). */
    const blank = (m) => m.replace(/[^\n]/g, ' ');
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
    for (const [index, line] of text.split('\n').entries()) {
      /* 소스 트리 경로(`observatory/engine/packages/…`)는 규칙 파일을 읽는 자리라 예외다 —
         import 를 만드는 자리가 아니다.
         ⚠️ **주석은 코드가 아니다.** 처음엔 안 갈랐고, R46 을 설명하는 주석 한 줄이
         「손으로 이었다」로 걸렸다 — 검사가 자기 설명을 위반으로 읽은 것이다. */
      if (/packages\/@(?:core|plugins)/.test(line) && !/observatory\/engine\/packages/.test(line)) {
        offenders.push(`${file}:${index + 1}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    `엔진 배치를 아는 자리는 lib/engine.mjs 하나뿐이어야 한다 — 손으로 이은 곳: ${offenders.join(' · ')}`);
  console.log(`✅ 엔진 배치를 아는 자리가 하나뿐이다 (파일 ${sources.length}개를 훑었다)`);
}

/* ── 버전이 두 자리에 있다 (R47 과 같은 종류).
   ⚠️ 실측(R52): `package.json` 0.5.0 · `universe.config.json` 0.8.0 — **세 판 차이**로 갈려 있었다.
   위키의 「v0.8.0」은 config 를 읽고, npm 은 package.json 을 읽는다. 둘이 다르면 어느 쪽이 진실인지 모른다. */
const readJson = async (rel) => JSON.parse(await readFile(join(ROOT, rel), 'utf8').catch(() => 'null'));
const pkg = await readJson('package.json');
const cfg = await readJson('universe.config.json');
if (!pkg || !cfg) {
  console.log('⏭  버전 대조 — 우주 소스가 아니다. 못 쟀다.');
} else {
  assert.equal(pkg.version, cfg.version,
    `버전이 두 자리에서 갈렸다 — package.json ${pkg.version} · universe.config.json ${cfg.version}`);
  console.log(`✅ 버전이 한 값이다 (${pkg.version})`);
}

/* ── 문서가 남의 패키지를 시키지 않는가.
   ⚠️⚠️ 실측(R52): 퀵스타트가 `npx universe init` 을 네 번 시켰다. 그런데 npm 의 `universe` 는
   **crossfilter/universe**(데이터셋 탐색 도구)다 — 그대로 따라 하면 **엉뚱한 것을 내려받는다.**
   이 우주는 `private: true` 라 배포되지 않았다. 문서가 없는 배포를 전제하고 있었다. */
const docs = (await readdir(join(ROOT, 'docs')).catch(() => [])).filter((f) => f.endsWith('.md'));
if (docs.length === 0) {
  console.log('⏭  문서 명령 검사 — docs/ 가 없다. 못 쟀다.');
} else {
  /* ⚠️ 처음엔 `docs/` 만 훑었다. 그런데 **도구 자신의 오류 메시지**가 같은 것을 시키고 있었다
     (`lib/home.mjs` — 「소비 저장소라면 먼저 깔아라: npx universe init」). 실측 R52.
     사람이 그 말을 가장 믿는 순간은 **막혔을 때**다. 코드까지 훑는다. */
  const codeFiles = (await Promise.all(SCAN_DIRS.map(collect))).flat().map((f) => f);
  const bad = [];
  for (const file of [...docs.map((f) => `docs/${f}`), ...codeFiles]) {
    const text = await readFile(join(ROOT, file), 'utf8');
    for (const [index, line] of text.split('\n').entries()) {
      /* 경고문 자체는 그 문자열을 품어야 한다 — 「치지 마라」가 붙은 줄은 뺀다. */
      if (/npx\s+universe\b/.test(line) && !/치지 마라|가 아니다/.test(line)) {
        bad.push(`${file}:${index + 1}`);
      }
    }
  }
  assert.deepEqual(bad, [],
    `npm 의 남의 패키지(crossfilter/universe)를 부르게 시키는 자리: ${bad.join(' · ')}`);
  console.log(`✅ 남의 패키지를 시키는 자리가 없다 (문서 ${docs.length}편 + 코드 ${codeFiles.length}개)`);
}

/* ── 등록된 명령이 사용법 문서에 다 있는가 (R53).
   ⚠️ 문서 머리말이 「명령 전부」·「여섯 명령」이라고 적혀 있었는데 실제는 22개였고
   9개는 `--help` 에만 있었다 — **아무도 못 쓰는 기능**이다. 주장이 사실이 아니면 관문을 건다. */
const cliSource = await readFile(join(ROOT, 'bin/universe.mjs'), 'utf8').catch(() => '');
const usageDoc = await readFile(join(ROOT, 'docs/02-usage.md'), 'utf8').catch(() => '');
if (!cliSource || !usageDoc) {
  console.log('⏭  명령 문서화 검사 — 우주 소스가 아니다. 못 쟀다.');
} else {
  const map = /=\s*\{([\s\S]*?)\n\};/.exec(cliSource);
  const registered = [...new Set([...map[1].matchAll(/^\s*([a-z][\w-]*):\s*'/gm)].map((m) => m[1]))];
  const missing = registered.filter((cmd) => !new RegExp(`universe\\s+${cmd}\\b`).test(usageDoc));
  assert.ok(registered.length > 5, '명령을 하나도 못 읽었다 — 훑개가 고장 났다(§8)');
  assert.deepEqual(missing, [],
    `사용법 문서에 없는 명령 — 아무도 못 쓴다: ${missing.join(' · ')}`);
  console.log(`✅ 등록된 명령 ${registered.length}개가 사용법 문서에 전부 있다`);
}

/**
 * ⛔ **「관문 N개」·「명령 N개」를 손으로 적지 않는가** — 여섯 번 낡은 자리다(R55·R84).
 *
 * 실측(R161): 생성 블록(`universe facts`)이 있는데도 **그 밖에** 손으로 적힌 수치 둘이
 * 낡아 있었다 — `docs/04-results.md` 의 「관문은 지금 **25개**」(실제 26)와
 * `docs/README.md` 의 「명령 **여섯 개**」(실제 32). ⚠️ 뒤엣것이 더 나쁘다: 바로 옆
 * `02-usage.md` 가 **자기 머리말에 똑같은 일을 겪었다고 적어 두고도** 그대로였다(R53).
 * **손으로 적는 수치는 한 자리만 고쳐진다.**
 *
 * ## ⚠️ 처음 조준이 틀렸다 — 원래 결함을 못 잡는 검사였다
 *
 * 첫 판은 「지금/현재」를 요구하고 **아라비아 숫자만** 봤다. 그런데 원래 결함은
 * **「명령 여섯 개」** — 그 둘 다 아니다. 변이로 넣어 보고서야 알았다.
 * ⇒ 한글 수를 같이 보고, 수가 **명사 바로 뒤**에 오는 것만 본다.
 *
 * ## 못 잡는 것 (§8 — 적어 둔다)
 *   · **울타리(```) 안**은 안 본다 — 예시 출력은 낡는 것이 아니라 **그때의 기록**이다.
 *   · **라운드 표식(R\d+)이 붙은 줄**은 안 본다 — 같은 이유로 그것은 이력이다.
 *   · 「관문 15 → 18개」처럼 수가 명사에서 떨어진 것은 못 본다.
 */
{
  const NUM = String.raw`\d+|하나|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두|열여덟|스물`;
  /* ⚠️ 「지금/현재」가 **사이에 끼는** 모양을 두 판 다 놓쳤다 — 첫 판은 그것을 요구했고
     둘째 판은 금지했다. 변이 둘을 나란히 태워 보고서야 **둘 다 있어야** 하는 걸 알았다. */
  const CLAIM = new RegExp(String.raw`(?:관문|명령)(?:은|이|의|을|를)?\s*(?:지금|현재|이제)?\s*\*{0,2}(?:${NUM})\s*\*{0,2}\s*개`);
  let claimed = 0;
  let scanned = 0;
  for (const rel of ['README.md', 'CONTRIBUTING.md',
    ...(await readdir(join(ROOT, 'docs')).catch(() => [])).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)]) {
    const text = await readFile(join(ROOT, rel), 'utf8').catch(() => null);
    if (text === null) { continue; }
    scanned += 1;
    /* 생성 블록 **안**은 도구가 쓴 것이라 뺀다 — 재는 것은 「손으로 주장한 것」이다. */
    const outside = text.replace(/<!-- FACTS:BEGIN -->[\s\S]*?<!-- FACTS:END -->/g, '');
    let fenced = false;
    for (const line of outside.split('\n')) {
      if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
      if (fenced || /R\d+/.test(line)) { continue; }
      if (CLAIM.test(line)) {
        claimed += 1;
        console.error(`   ⛔ ${rel}: ${line.trim().slice(0, 90)}`);
      }
    }
  }
  /* 분모가 0이면 이 검사는 죽은 것이다 — 문서를 하나도 못 읽었다는 뜻이다(§8). */
  assert.ok(scanned >= 8, `문서를 ${scanned}편밖에 못 읽었다 — 훑개가 고장 났다`);
  assert.equal(claimed, 0,
    '「관문/명령 N개」를 손으로 적은 자리가 있다 — 생성 블록(`universe facts`)이 말하게 하라. 또 낡는다');
  console.log(`✅ 문서 ${scanned}편에 손으로 적은 「관문/명령 N개」가 없다 — 수는 생성이 말한다`);
}

/**
 * ⛔⛔ **공개 저장소가 막아야 하는 것을 정말 막는가** — 짐작이 아니라 `git` 에게 묻는다.
 *
 * ## 왜 생겼나 — 옮겨지지 않은 방어는 아무도 안 센다
 *
 * `qa-harness`(private)를 이 저장소(**공개 MIT**)로 흡수하면서 파일 95개를 옮겼다.
 * **옮겨진 파일은 세어서 확인했다.** 그런데 원 저장소의 루트 `.gitignore` 에 있던
 * **자격증명 방어 6줄이 안 따라왔고, 그건 아무도 안 셌다.** 실측으로 확인했더니:
 *
 *   `.auth/storageState.json` · `test-results/` · `trace.zip` · **`.env` 조차** 전부 커밋 가능.
 *
 * ⚠️ `.auth/storageState.json` 이 제일 날카롭다 — 그 콘솔은 브라우저를 **headed 로 띄워
 * 사람이 직접 로그인**한다. 그 파일은 계정 정보가 아니라 **로그인된 세션 그 자체**다.
 * 트레이스(`*.zip`)에는 스크린샷과 네트워크 헤더가 통째로 들어간다.
 *
 * ⛔ **그리고 그 부재는 파일이 생기기 전까지 조용하다.** 트리가 깨끗한 것은 「막고 있다」의
 * 증거가 아니다 — 초록불을 증거로 삼지 않는 것과 같은 자리다.
 *
 * ⇒ **`git check-ignore` 에게 직접 묻는다.** `.gitignore` 를 문자열로 읽지 않는다 —
 *   읽으면 「적혀 있다」만 알고 **정말 막히는지는 모른다**(부정 패턴·순서·중첩이 있다).
 */
if (!isUniverseSource) {
  /* ⚠️ 배달본에는 `app/`·`qa/` 도 `.gitignore` 도 없고 git 저장소도 아니다 —
     여기서 재면 **전부 「커밋된다」**로 나온다. 그건 결함이 아니라 **못 재는 것**이다(§8).
     ⛔ 조용히 넘기지 않는다 — 말한다. (같은 실수를 이 세션에서 세 번째로 잡았다:
        `bin/` 이 배달 안 되는 것 · `galaxies/` 가 없는 것 · 이제 git 이 없는 것.) */
  console.log('⏭  공개 저장소 방어 검사 — 여기는 우주 소스가 아니다(배달본). 못 쟀다.');
} else {
  const MUST_IGNORE = [
    ['.env', '공개 저장소다 — 환경 파일이 커밋되면 안 된다'],
    ['app/universe/.env', '은하 안의 환경 파일도 같다'],
    ['qa/.env', '흡수한 도구의 환경 파일도 같다'],
    ['app/universe/.auth/storageState.json', '**로그인된 세션 그 자체**다 — 계정 정보보다 무겁다'],
    ['app/universe/test-results/x.png', 'Playwright 산출물 — 스크린샷이 들어간다'],
    ['app/universe/trace.zip', '트레이스 — 스크린샷과 네트워크 헤더가 들어간다'],
    ['app/universe/node_modules/x.js', '설치물은 커밋하지 않는다'],
    ['qa/dist/lint/cli.js', '빌드 산출물은 커밋하지 않는다'],
  ];
  const asked = [];
  for (const [candidate, why] of MUST_IGNORE) {
    /* eslint-disable-next-line no-await-in-loop */
    const ignored = await new Promise((resolve) => {
      const child = spawn('git', ['check-ignore', '-q', '--no-index', candidate],
        { cwd: ROOT, stdio: 'ignore' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(null));
    });
    asked.push(ignored);
    if (ignored === null) { continue; }
    assert.ok(ignored, `⛔ \`${candidate}\` 가 **커밋된다** — ${why}\n`
      + '   → `.gitignore` 에 막는 줄을 넣어라. 지금 트리가 깨끗한 것은 증거가 아니다');
  }
  /* 분모 가드 — git 을 못 불렀으면 위 전부가 조용히 통과한다(§8). */
  assert.ok(asked.filter((x) => x !== null).length === MUST_IGNORE.length,
    'git check-ignore 를 못 불렀다 — 이 검사가 통째로 장식이 된다');
  console.log(`✅ 공개 저장소가 막아야 할 ${MUST_IGNORE.length}가지를 git 이 정말 막는다 (세션·트레이스·환경 파일 포함)`);
}

/**
 * ⛔ **「못 쟀다」와 「살아 있다」가 같은 값이면 그 층은 장식이다.**
 *
 * `observatory/liveness.mjs` 는 존재(있는가)와 생존(살아 있는가)을 가르려고 만든 것이다 —
 * **토큰 문자열은 만료돼도 그대로 있어서** 존재만 보는 검사는 죽은 세션을 절대 못 잡는다.
 * ⚠️ 실측(다른 팀): 세션 수명이 1시간이라 오래 도는 루프가 **중간에 죽고**, 그때 화면은
 * 로그인 페이지를 재고 「전부 fail」을 뱉는다 — **제품 결함이 아닌데도.**
 *
 * ⛔ 그러니 **⚪ 가 ✅ 로 접히면 안 된다.** 접히는 순간 아무도 세션을 안 재면서
 * **재고 있다고 믿는다.** 변이 시험은 「선언을 못 읽는」 방향을 재고, 여기는 그 반대편 —
 * **세 상태가 서로 다른 값인지**를 잰다. 값이 같아지는 것은 한 글자로 일어난다.
 */
{
  const lv = await import(pathToFileURL(join(ROOT, 'observatory/liveness.mjs')).href);
  const states = [lv.ALIVE, lv.DEAD, lv.UNMEASURED];
  assert.equal(new Set(states).size, 3,
    `세 상태가 서로 달라야 한다 — 지금: ${JSON.stringify(states)}. `
    + '⚪ 가 ✅ 로 접히면 아무도 세션을 안 재면서 재고 있다고 믿는다');
  assert.notEqual(lv.UNMEASURED, lv.ALIVE, '**못 쟀다**가 **살아 있다**와 같은 값이다');
  console.log(`✅ 세션 생존 — 세 상태가 서로 다르다 (${states.join(' · ')})`);
}

/**
 * ⛔ **한 저장소의 두 빌드가 같은 산출 폴더를 쓰면 나중 것이 앞 것을 지운다.**
 *
 * ⚠️ 실측(R162): 콘솔 은하는 서버(`tsc`)와 웹(`vite`)을 따로 빌드하는데 **둘 다 `dist/`**
 * 였다. `npm run build:server && npx vite build` 로 돌리자 vite 가 폴더를 비우면서
 * **서버 산출물을 통째로 지웠고** `node dist/index.js` 가 `Cannot find module` 로 죽었다.
 * ⛔ **반대 순서로는 우연히 돌았다** — 그래서 「내 기계에선 되는데」가 되고, 원인이
 * **빌드 순서**라는 걸 아무도 못 짚는다. 그 종류가 제일 오래 산다.
 *
 * ⇒ 웹 산출물을 `dist/web` 으로 갈랐다. 여기서 재는 것은 **그 분리가 살아 있는가**다.
 * ⚠️ 「빌드해 보고 확인」하지 않는다 — 느린 검사는 아무도 안 본다(이 저장소의 규율).
 *    **선언을 읽어서** 두 자리가 같은 곳을 가리키는지만 본다. 싸고 확실하다.
 */
{
  const consoleDir = join(ROOT, 'app/universe');
  const viteConf = await readFile(join(consoleDir, 'vite.config.ts'), 'utf8').catch(() => null);
  const serverConf = await readFile(join(consoleDir, 'tsconfig.server.json'), 'utf8').catch(() => null);
  if (viteConf === null || serverConf === null) {
    console.log('⏭  콘솔 빌드 산출 분리 — 콘솔 은하가 없다. 못 쟀다.');
  } else {
    const viteOut = /outDir:\s*'([^']+)'/.exec(viteConf)?.[1] ?? 'dist';
    const serverOut = /"outDir"\s*:\s*"([^"]+)"/.exec(serverConf)?.[1] ?? null;
    assert.ok(serverOut, 'tsconfig.server.json 에서 outDir 를 못 읽었다 — 훑개가 고장 났다(§8)');
    assert.notEqual(viteOut, serverOut,
      `웹과 서버가 **같은 산출 폴더**를 쓴다(${viteOut}) — 나중에 빌드한 쪽이 앞 것을 지운다.\n`
      + '   실측: vite 가 `dist/` 를 비워 서버 산출물이 사라지고 `Cannot find module` 로 죽었다.\n'
      + '   ⛔ 반대 순서로는 돌아서 **순서에 따라 되고 안 된다** — 원인을 아무도 못 짚는다');
    /* 한쪽이 다른 쪽 **안**에 있어도 안 된다 — `dist` 를 비우면 `dist/web` 도 같이 날아간다. */
    assert.ok(!viteOut.startsWith(`${serverOut}/`) || /emptyOutDir/.test(viteConf),
      `웹 산출(${viteOut})이 서버 산출(${serverOut}) 안에 있는데 \`emptyOutDir\` 선언이 없다 — `
      + '서버 쪽을 비우면 웹도 같이 날아간다');
    console.log(`✅ 콘솔 빌드 산출이 갈려 있다 (웹 ${viteOut} · 서버 ${serverOut}) — 순서가 결과를 안 바꾼다`);
  }
}

/**
 * ⛔ **`observe --json` 의 stdout 이 정말 JSON 인가 — 그리고 분모를 들고 오는가.**
 *
 * 화면(콘솔)이 이 출력을 읽는다. 여기가 깨지면 화면은 **조용히 빈 목록을 그리고**,
 * 사람은 그것을 「위반이 없다」로 읽는다. ⛔ 이 저장소가 가장 싫어하는 모양이다 —
 * **「0건」이 「위반이 없다」인지 「안 봤다」인지 구별이 안 되는 것.**
 *
 * ⚠️ 깨지는 법이 조용하다: 사람용 한 줄이 실수로 `console.log` 로 새면 stdout 에 섞여
 * **JSON.parse 가 죽는다.** 지금은 `--json` 일 때 사람용을 전부 stderr 로 보내서 막고 있는데,
 * 그 규율은 한 줄만 어긋나도 무너진다. ⇒ **파싱해 본다.** 눈으로 보지 않는다.
 *
 * ⚠️ 그리고 **분모**를 요구한다. `{"violations": 24}` 만 있으면 24/24 인지 24/1400 인지
 * 아무도 모른다 — 실측으로 **파일 0개를 훑고 「0건」**을 기준선으로 심은 적이 있다(R162).
 */
if (isUniverseSource) {
  const run = (args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, 'observatory/observe.mjs'), ...args],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
    child.on('error', () => resolve({ code: -1, out: '' }));
  });
  const plain = await run(['--galaxy', 'console']);
  const asJson = await run(['--galaxy', 'console', '--json']);

  let parsed = null;
  try {
    parsed = JSON.parse(asJson.out);
  } catch (error) {
    assert.fail(`\`observe --json\` 의 stdout 이 JSON 이 아니다 — 화면이 조용히 빈 목록을 그린다.\n`
      + `   사람용 출력이 stdout 으로 샌 것 같다(\`--json\` 일 때는 stderr 로 가야 한다).\n`
      + `   앞 40자: ${JSON.stringify(asJson.out.slice(0, 40))}\n   ${error.message}`);
  }
  /**
   * ⛔ 종료코드를 바꾸면 **화면은 초록인데 관문은 빨간** 상태가 생긴다.
   * ⚠️ **초록인 은하로 비교하면 이 검사는 죽는다** — 둘 다 0 이라 언제나 같다.
   *    실측으로 그랬다: `--json` 일 때 종료코드를 0 으로 덮는 변이를 넣었는데 **안 물었다.**
   * ⇒ **죽는 자리**로 비교한다. 없는 은하 이름은 확실히 0 이 아니다.
   */
  assert.equal(asJson.code, plain.code,
    `\`--json\` 이 종료코드를 바꿨다(${plain.code} → ${asJson.code}) — 화면과 관문의 판정이 갈린다`);
  const deadPlain = await run(['--galaxy', '없는은하이름-검사용']);
  const deadJson = await run(['--galaxy', '없는은하이름-검사용', '--json']);
  assert.notEqual(deadPlain.code, 0, '없는 은하 이름이 0으로 끝난다 — 비교 대상이 죽지 않으면 아래가 무의미하다(§8)');
  assert.equal(deadJson.code, deadPlain.code,
    `**죽어야 하는 자리에서** \`--json\` 이 종료코드를 바꿨다(${deadPlain.code} → ${deadJson.code}) — `
    + '화면은 초록인데 관문은 빨간 상태가 된다');

  const galaxy = parsed.galaxies?.[0];
  assert.ok(galaxy, 'JSON 에 은하가 하나도 없다 — 훑개가 고장 났다(0은 무죄가 아니다 · §8)');
  /* **분모** — 「몇 개를 훑어서 몇 건」이라고 말해야 한다. `null` 은 「안 잰다」로 옳다. */
  assert.ok('scanned' in galaxy,
    'JSON 에 **분모가 없다** — 몇 개를 훑었는지 없이 위반 수만 주면 그 수는 뜻이 없다');
  if (galaxy.scanned !== null) {
    assert.equal(typeof galaxy.scanned.files, 'number',
      '`scanned.files` 가 수가 아니다 — 분모를 못 읽는다');
  }
  console.log(`✅ \`observe --json\` 이 파싱되고 분모를 들고 온다 (파일 ${galaxy.scanned?.files ?? '⚪ 안 잼'} · 종료코드 ${asJson.code})`);
}

/**
 * ⛔⛔ **lint 가 재는 곳과 법칙이 재는 곳이 다르면, 그 차이를 말해야 한다.**
 *
 * ⚠️ 실측(R163): 모노레포 은하에서 `lintTargets` 에 워크스페이스 **4곳**을 넣었는데,
 * 법칙 스캔은 `${appDir}/src` **한 곳**만 훑는다. 그래서 공유 패키지 **73개 파일**이
 * **lint 는 재고 법칙은 안 재는** 상태였다 — 그리고 **도구가 아무 말도 안 했다.**
 * 화면에는 「파일 1,227개를 훑었다」만 뜨니 **전부 본 것처럼 보인다.**
 *
 * ⛔ 이건 「0을 무죄로 세는 것」의 사촌이다: **분모를 줄여 놓고 분모를 안 밝히는 것.**
 * 옆 저장소가 같은 종류로 데였다고 알려 줬다(그쪽 R31: `packages/modules` 의
 * `console.log` 4건이 **어떤 lint 대상도 아니었다**). 그쪽 조언이 이것이었다 —
 * **「워크스페이스를 넣었다」로 끝내지 말고 「어느 경로가 실제로 스캔되는가」를 재 봐라.**
 *
 * ⇒ 여기서 재는 것은 **도구가 그 차이를 말하는가**다. 좁게 재는 것 자체는 결함이 아니다
 *   (법칙은 화면 규칙이라 라이브러리에 안 맞을 수 있다). **조용한 것**이 결함이다.
 */
{
  const gl = await import(pathToFileURL(join(ROOT, 'lib/galaxy-load.mjs')).href);
  const cfg = JSON.parse(await readFile(join(ROOT, 'universe.config.json'), 'utf8'));
  let checked = 0;
  let silent = [];
  for (const name of cfg.galaxies ?? []) {
    /* eslint-disable-next-line no-await-in-loop */
    const file = await gl.findGalaxyFile(ROOT, name);
    if (!file) { continue; }
    /* eslint-disable-next-line no-await-in-loop */
    const g = JSON.parse(await readFile(file, 'utf8'));
    const targets = g.lintTargets ?? [];
    /* 모노레포에서 **앱 밖의 워크스페이스**를 lint 하고 있는가 — 그것이 차이의 원천이다. */
    const outsideApp = targets.filter((t) => t.workspace && t.workspace !== g.appWorkspace);
    if (outsideApp.length === 0) { continue; }
    checked += 1;
    /**
     * 그 차이를 **좌표가 스스로 말하는가.** 도구가 자동으로 말하게 하는 것이 더 좋지만,
     * 그건 엔진 쪽 일이라 여기서는 **사람이 적었는가**를 요구한다 —
     * 적지 않으면 다음 사람은 「1,227개를 다 봤다」로 읽는다.
     */
    const said = JSON.stringify(g).includes('법칙은');
    if (!said) { silent.push(`${name}(워크스페이스 ${outsideApp.length}곳이 lint 밖 법칙 범위)`); }
  }
  if (checked === 0) {
    console.log('⏭  lint/법칙 범위 차이 — 앱 밖 워크스페이스를 lint 하는 은하가 없다. 못 쟀다.');
  } else {
    assert.deepEqual(silent, [],
      `lint 는 여러 워크스페이스를 재는데 **법칙은 \`appDir/src\` 한 곳만** 훑는다 — `
      + `그 차이를 좌표가 말하지 않는다: ${silent.join(' · ')}\n`
      + '   좌표에 「법칙은 어디까지 보는가」를 적어라. 안 적으면 다음 사람은 전부 본 줄 안다');
    console.log(`✅ lint/법칙 범위가 다른 은하 ${checked}곳이 그 차이를 좌표에 적어 뒀다`);
  }
}

/**
 * ⛔⛔ **분모를 줄이는 부품은 양방향으로 물어야 한다.**
 *
 * `notAuthored` 는 「사람이 쓴 코드가 아닌 자리」를 걸러 **`census` 의 분모에서 뺀다.**
 * ⚠️ 그래서 이게 **넓어지면 분모가 줄고, 분모가 줄면 비율이 좋아 보인다.**
 * 「95.8% 를 읽는다」가 실은 **「볼 것을 빼고 잰 95.8%」**가 될 수 있다 —
 * 그 방향의 오류는 **사람을 안심시키므로 조용하다.**
 *
 * ⇒ 「걸러야 하는 것」만 재면 안 된다. **「절대 거르면 안 되는 것」을 같이 잰다.**
 * ⚠️ 옆 저장소 세션이 훅에서 같은 걸로 데였다고 알려 줬다 — 막는 것만 시험했더니
 * **정당한 명령을 막는 관문**이 남았고, 그러면 다음 사람이 관문을 통째로 끈다.
 */
{
  const { notAuthored } = await import('./blind.mjs');
  /* 걸러야 하는 것 — 받은 것이거나 만들어진 것이다. */
  const MUST_FILTER = [
    ['node_modules/react/index.js', '설치물'],
    ['apps/web/node_modules/x/y.ts', '설치물'],
    ['vendor/lib.js', '설치물'],
    ['dist/index.js', '생성물'],
    ['apps/web/dist/chunk.js', '생성물'],
    ['coverage/lcov-report/x.js', '생성물'],
  ];
  /* ⛔ **절대 거르면 안 되는 것** — 이쪽이 무너지면 분모가 조용히 줄어든다. */
  const MUST_KEEP = [
    'src/App.tsx',
    'src/components/Button.tsx',
    'scripts/audit.mjs',
    'apps/web/src/pages/Home.tsx',
    /* ⚠️ 이름에 그 낱말이 **들어 있을 뿐**인 진짜 소스 — 부분 문자열로 거르면 여기서 걸린다. */
    'src/dist-helper.ts',
    'src/node_modules_shim.ts',
    'src/vendorProfile.tsx',
  ];
  for (const [rel, why] of MUST_FILTER) {
    assert.equal(notAuthored(rel), why,
      `\`${rel}\` 을 「${why}」로 안 걸렀다 — 사람이 안 쓴 코드가 분모에 섞인다`);
  }
  for (const rel of MUST_KEEP) {
    assert.equal(notAuthored(rel), null,
      `\`${rel}\` 을 걸렀다 — **진짜 소스가 분모에서 빠진다.** 그러면 「읽는 비율」이 `
      + '실제보다 좋아 보이고, 그 방향의 오류는 사람을 안심시키므로 조용하다');
  }
  console.log(`✅ 분모 가르개 — 걸러야 할 ${MUST_FILTER.length}가지를 걸렀고 `
    + `**거르면 안 될 ${MUST_KEEP.length}가지를 남겼다**`);
}

/**
 * ⛔⛔ **분모에 「버려질 코드」가 들어가면 기준선이 노이즈로 흔들린다.**
 *
 * ⚠️ 실측(R163): `census` 가 진짜 은하에서 「못 읽는다 **59개(4.2%)**」를 냈는데,
 * 옆 저장소 세션이 재보니 **57개가 gitignore 된 일회용 QA 프로브**였다
 * (`e2e/__screenshots__/` 의 `chk-err.mjs`·`probe-404.mjs`·`qa-blue.mjs` …).
 * git 축을 넣고 나니 **2개(0.1%)** 다. ⇒ **「모수가 다르다」가 아니라 「한쪽은 버려질 것을 센다」**였다.
 *
 * ⛔ 그리고 더 나쁜 것: 스크래치가 분모에 들어오면 **프로브를 하나 만들면 늘고 지우면 준다** —
 * **코드 품질과 무관하게.** 이 하네스의 기준선은 「절대 0이 아니라 **늘었는가**」라서
 * 그 흔들림이 **그대로 판정**이 된다.
 *
 * ⚠️ 여기서 재는 것은 **git 에게 물었는가**다. 못 물었으면 「무시된 것이 0개」가 아니라
 * **「모른다」**이고, 그 사실이 **화면에 나와야** 한다 — 조용하면 분모를 믿게 된다(§8).
 */
if (!isUniverseSource) {
  /* ⚠️ **배달본은 git 저장소가 아니다** — 물어도 못 받는다. 그건 결함이 아니라 **못 재는 것**이다.
     ⛔ 이 세션에서 같은 종류를 **네 번** 잡았다(`bin/` 미배달 · `galaxies/` 없음 · git 없음 ×2).
        매번 「원본이 도는 것과 배달본이 도는 것은 다르다」였다. */
  console.log('⏭  census 의 git 축 — 여기는 우주 소스가 아니다(배달본). 못 쟀다.');
} else {
  const bc = await import(pathToFileURL(join(ROOT, 'observatory/blind-census.mjs')).href);
  /* 이 저장소 자신으로 잰다 — git 저장소이므로 물을 수 있어야 한다. */
  const here = await bc.census(ROOT);
  assert.equal(here.askedGit, true,
    'git 에게 무시 목록을 못 물었다 — 이 저장소는 git 저장소인데도 못 물었다면 훑개가 고장 났다');
  assert.ok(here.ignored instanceof Set, '무시 목록이 집합이 아니다');
  /* ⛔ 분모 가드 — 이 저장소는 `node_modules`·`dist` 가 있으니 무시되는 것이 0일 수 없다. */
  assert.ok(here.ignored.size > 0,
    `무시되는 파일을 0개로 읽었다(${here.ignored.size}) — git 은 물었는데 답이 비었다면 `
    + '`--exclude-standard` 나 `-z` 가 빠진 것이다. 0은 무죄가 아니다(§8)');

  /* **못 물었을 때** — git 저장소가 아닌 자리는 `null` 이어야 한다. 빈 집합이면 안 된다. */
  const outside = await bc.census(tmpdir());
  assert.equal(typeof outside.askedGit, 'boolean', 'git 에게 물었는지를 안 기록한다');
  /* ⚠️ `/tmp` 가 어쩌다 git 저장소일 수 있다 — 그때는 이 갈래를 못 잰다. 통과로 세지 않는다. */
  if (outside.askedGit) {
    console.log('⏭  「git 에게 못 물었다」 갈래 — 임시 폴더가 git 저장소다. 못 쟀다.');
  } else {
    assert.equal(outside.ignoredByExt && Object.keys(outside.ignoredByExt).length, 0,
      '못 물었는데 무시 목록이 채워졌다 — 「모른다」가 「0개」로 접혔다');
  }
  console.log(`✅ census 가 git 에게 무시 목록을 묻는다 (이 저장소에서 ${here.ignored.size}개) — `
    + '버려질 코드가 분모에 안 들어간다');
}

/**
 * ⛔⛔ **이 파일이 배달본에서도 돌아야 한다는 것을 잊지 않게 못 박는다.**
 *
 * ⚠️ 이 세션에서 **네 번** 같은 실수를 했다: `bin/` 이 배달 안 되는 것 · `galaxies/` 가 없는 것 ·
 * git 저장소가 아닌 것 ×2. 매번 검사를 넣고 나서 **배달본 관문이 빨간불**이 나서야 알았다.
 * 매번 사유가 같았다 — **「원본이 도는 것과 배달본이 도는 것은 다르다」.**
 *
 * ⇒ 우주 소스에만 있는 것을 만지는 검사는 **`isUniverseSource` 로 갈라야** 한다.
 *   여기서 재는 것은 **그 갈래가 충분히 있는가**다. 세는 것으로는 「옳게 갈랐는가」를 못 재지만,
 *   **0이면 확실히 안 갈랐다** — 그 방향만으로도 네 번의 실수를 막는다.
 * ⚠️ 못 잡는 것(§8): 갈래를 **엉뚱한 검사에** 걸어도 이 수는 는다. 수는 하한이지 증명이 아니다.
 */
{
  const self = await readFile(join(ROOT, 'lib/selftest.mjs'), 'utf8');
  const guards = (self.match(/isUniverseSource/g) ?? []).length;
  /* 우주 소스만 만지는 것들 — 배달본엔 없다. 하나라도 있으면 갈래도 있어야 한다. */
  const sourceOnly = ['observatory/blind-census.mjs', 'observatory/observe.mjs', 'qa/', 'app/universe/'];
  const touched = sourceOnly.filter((p) => self.includes(p));
  assert.ok(touched.length > 0, '이 검사가 무엇을 재는지 못 찾았다 — 훑개가 고장 났다(§8)');
  assert.ok(guards >= touched.length,
    `우주 소스만 있는 것 ${touched.length}가지를 만지는데 \`isUniverseSource\` 갈래가 ${guards}개뿐이다 — `
    + '배달본에서 그 검사들이 **없는 것을 재고 빨간불**을 낸다.\n'
    + '   이 세션에서 같은 실수를 네 번 했다. 새 검사를 넣을 때 **배달본에서도 도는가**를 먼저 물어라');
  console.log(`✅ 배달본 갈래 ${guards}개 — 우주 소스만 만지는 검사가 배달본에서 조용히 빨개지지 않는다`);
}

/**
 * ⛔⛔ **변이마다 「무엇으로 죽어야 하는가」를 적게 한다 — 안 적으면 판정이 종료코드로 떨어진다.**
 *
 * `verify-checks` 는 **거부 사유**로 판정한다: 변이를 걸었을 때 `expect` 문자열이 출력에
 * 없으면 ✅ 가 아니라 **⚠️(다른 이유로 죽었다)** 다. ⚠️ 그런데 그 확인은 **`expect` 를 적은
 * 케이스에서만** 돈다 — 안 적으면 **종료코드만 보고 통과**한다. 그러면 이런 일이 난다:
 *   · 변이가 **곁가지**를 만들어 「파일이 없어서」 죽었는데 ✅ 로 보인다(실측으로 겪었다).
 *   · 변이 도구가 **깨진 파일을 남기고** 죽었는데 그것도 ✅ 로 보인다
 *     (옆 저장소 세션이 `sed` 로 정확히 그것을 겪었다 — 구분자 충돌로 sed 가 죽었고,
 *      깨진 관문이 스위트를 실패시켰는데 그걸 「변이가 통했다」로 셌다).
 *
 * ⛔ **「빨개졌다」는 검출의 증거가 아니다.** 사고로 빨개진 것과 구별이 안 된다.
 *
 * ⚠️ 지금 49건 전부 `expect` 를 적고 있다. **그건 규칙이 아니라 상태다** — 누가 하나
 * 안 적고 더하면 그때부터 열린다. ⇒ 여기서 **규칙으로 만든다.**
 */
{
  const src = await readFile(join(ROOT, 'observatory/verify-checks.mjs'), 'utf8');
  /* 변이 케이스는 `mutate:` 를 갖는 블록이다. 블록 경계는 최상위 `  {` 로 가른다. */
  const blocks = src.split(/\n {2}\{\n/).slice(1).filter((b) => /^\s*(check|mutate):/m.test(b) && /mutate:/.test(b));
  /* 분모가 0이면 이 검사는 죽은 것이다 — 훑개가 블록을 못 가른 것이다(§8). */
  assert.ok(blocks.length > 20,
    `변이 케이스를 ${blocks.length}개만 찾았다 — 훑개가 고장 났다(0은 무죄가 아니다 · §8)`);
  const noReason = blocks
    .filter((b) => !/\bexpect:/.test(b))
    .map((b) => /check:\s*'([^']+)'/.exec(b)?.[1] ?? /bite:\s*'([^']+)'/.exec(b)?.[1] ?? '(이름 없음)');
  assert.deepEqual(noReason, [],
    `변이에 **거부 사유(\`expect\`)가 없다**: ${noReason.join(' · ')}\n`
    + '   사유가 없으면 판정이 **종료코드**로 떨어진다 — 변이가 **다른 이유로** 죽어도 ✅ 가 된다.\n'
    + '   ⛔ 「빨개졌다」는 검출의 증거가 아니다. **무엇으로 죽어야 하는지** 적어라');
  console.log(`✅ 변이 ${blocks.length}건이 전부 거부 사유를 적었다 — 판정이 종료코드로 안 떨어진다`);
}

/**
 * ⛔⛔ **훑개가 건너뛴 것은 어딘가에 남아야 한다 — 어느 칸에도 없으면 아무도 모른다.**
 *
 * ⚠️ 실측(R163): `census` 의 점 규칙이 **파일에도** 걸려 있었다. `.eslintrc.js`·`.probe.mjs` 를
 * 둔 폴더를 재니 **「코드 파일 1개 · 100.0% 를 읽는다 · 안 훑은 자리: 없다」**가 나왔다.
 * ⛔ 못 읽는 파일이 **분모에서도 빠지고 「안 훑았다」에도 안 적혔다** —
 * **어느 칸에도 안 남으니 그것이 있었다는 걸 아무도 모른다.** 그게 이 병의 핵심이다.
 *
 * ⚠️ 옆 저장소 세션이 **다른 층에서 같은 함정**을 만났다: 변이 프로브를 `.nul-probe.mjs` 로
 * 지었더니 훑개가 건너뛰어 **검사가 조용히 안 잡혔다.** 「검사가 약하다」로 읽을 뻔했는데
 * 실은 **훑개의 사각**이었다. ⇒ **「변이가 대상에 도달했는가」를 안 물으면 어느 층에서든
 * 같은 거짓 음성이 난다.**
 *
 * ⇒ 여기서 재는 것: **점으로 시작하는 파일이 사라지지 않는가.** 폴더는 계속 건너뛴다.
 */
{
  const bc = await import(pathToFileURL(join(ROOT, 'observatory/blind-census.mjs')).href);
  const probe = join(tmpdir(), `universe-dot-${process.pid}`);
  await mkdir(join(probe, 'src'), { recursive: true });
  await writeFile(join(probe, 'src/a.ts'), 'export const a = 1;\n');
  /**
   * 못 읽는 확장자 + 점으로 시작 — **이 둘이 겹칠 때** 조용히 사라졌다.
   * ⚠️ 처음엔 `.probe.mjs` 를 썼는데 **`.mjs` 를 규칙에 열면서 읽는 쪽이 됐다** —
   *    그러자 이 시험이 「못 읽는 것을 안 셌다」로 죽었다. **프로브가 낡은 것**이지
   *    검사가 틀린 게 아니다. ⇒ **여전히 못 읽는 확장자**로 바꾼다(`.vue`).
   */
  await writeFile(join(probe, 'src/.probe.vue'), '<template><div/></template>\n');
  /* 점으로 시작하는 **폴더**는 계속 숨겨야 한다 — 그 안의 것은 소스가 아니다. */
  await mkdir(join(probe, '.hidden'), { recursive: true });
  await writeFile(join(probe, '.hidden/inside.ts'), 'export const h = 1;\n');

  const acc = await bc.census(probe);
  const t = bc.tally(acc);
  await rm(probe, { recursive: true, force: true });

  assert.equal(t.code, 2,
    `점으로 시작하는 **파일**이 사라졌다 — 분모가 ${t.code} 다(.ts 1 + .mjs 1 이어야 한다).\n`
    + '   ⛔ 못 읽는 파일이 **분모에서도 빠지고 「안 훑았다」에도 안 적히면** 아무도 모른다');
  assert.ok(t.blind >= 1,
    `점으로 시작하는 **못 읽는 파일**을 안 셌다(blind ${t.blind}) — 「100% 를 읽는다」가 거짓이 된다`);
  assert.ok(acc.skipped.숨은자리.length > 0,
    '점으로 시작하는 **폴더**를 안 건너뛰었다 — `.git`·`.claude` 안까지 훑으면 수가 오염된다');
  console.log(`✅ 훑개의 점 규칙 — **폴더만** 숨긴다(파일 ${t.code}개를 다 봤고 숨긴 폴더 ${acc.skipped.숨은자리.length}곳을 적었다)`);
}

/**
 * ⛔⛔ **같은 확장자 목록이 세 자리에 있다 — 서로 반대말을 하면 빨간불이다.**
 *
 * ⚠️ 실측(R163): `.js`·`.jsx` 를 규칙에 열면서 **세 벌이 갈렸다.**
 *   ① `rules/helpers.ts` 의 `isSource`      — 규칙이 어느 파일을 보는가
 *   ② `lib/blind.mjs` 의 `READABLE`         — `census` 가 무엇을 「읽는다」로 세는가
 *   ③ `@plugins/…/scan.ts` 의 `READABLE`    — **관측이 실제로 훑는 것**
 * 둘만 고치자 **두 도구가 서로 반대말을 했다**: `census` 는 「.js 100% 읽는다」,
 * `observe` 는 「코드인데 **못 읽은 파일 2개**」. ⛔ 셋째 벌이 있다는 걸 **아무도 몰랐다.**
 *
 * ⇒ 옆 저장소 세션의 처방을 받았다: **「통합」보다 「반대말을 하면 빨간불」이 싸고,
 *   통합이 불가능해도 작동한다.** 엔진은 벤더링돼 있어 `lib/` 를 import 할 수 없다 —
 *   합칠 수 없는 자리다. ⇒ **합치지 않고, 갈리는 것을 막는다.**
 *
 * ⚠️ **이 검사도 하한이다**(§8): 셋이 **같다**는 것과 그것이 **옳은 집합**이라는 것은
 *    다른 사실이다. 셋이 나란히 틀리면 이 검사는 조용하다.
 */
{
  const probes = ['a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs', 'a.vue', 'a.svelte', 'a.astro'];
  const read = (re) => probes.filter((f) => re.test(f)).join(' ') || '(아무것도 안 읽는다)';

  const HELPERS = 'observatory/engine/packages/@core/fe-agent-contracts/src/rules/helpers.ts';
  const SCAN = 'observatory/engine/packages/@plugins/harness-react-vite/src/scan.ts';
  const helpers = await readFile(join(ROOT, HELPERS), 'utf8').catch(() => null);
  const scan = await readFile(join(ROOT, SCAN), 'utf8').catch(() => null);

  if (helpers === null || scan === null) {
    /* 배달본에는 엔진 소스가 없다 — 「통과」가 아니라 **못 쟀다**다(§8). */
    console.log('⏭  확장자 목록 두 벌 — 엔진 소스가 없다(배달본이다). 못 쟀다.');
  } else {
    /**
     * ⛔ **소스에서 정규식 리터럴을 읽어 실제로 돌려 본다.** 문자열로 비교하면
     * `(ts|tsx)` 와 `(tsx|ts)` 가 「다르다」고 나온다 — 재는 것은 **같은 파일을 받는가**다.
     */
    const litOf = (text, name) => {
      /**
       * ⛔⛔ **선언줄에 못 박는다 — 「찾았다」와 「맞는 것을 찾았다」는 다른 사실이다.**
       *
       * ① 처음엔 `indexOf(name)` 뒤의 첫 리터럴을 집었다. 이름이 **주석에 먼저** 나오는
       *    자리에서 **옆 상수의 리터럴**을 물어 「두 벌이 갈렸다」는 **거짓 빨간불**이 났다.
       * ② 대입문(`NAME =`)으로 좁혔다. 그런데 **주석 안에 대입문 모양**이 있으면 여전히 속는다 —
       *    실측으로 확인했다: `/* 예전엔 CODE_BUT_BLIND = ... 였다 *\/` 한 줄이면 빨간불이 났다.
       *
       * ⚠️⚠️ **이 거짓 빨간불이 특히 나쁜 이유**(자식이 짚었다): 「목록을 맞추자」로 읽으면
       * 손이 가는 곳은 **그 주석 문장을 지우는 것**인데, 그 문장이 바로 **둘이 같이 움직여야
       * 한다는 경고**다. 검사를 초록으로 만들려고 **검사가 지키려던 것을 지우게 된다.**
       *
       * ⇒ 줄 맨 앞의 `const`/`export const` 선언에만 붙는다. 주석줄은 `*` 나 `//` 로 시작한다.
       */
      const at = text.search(new RegExp(`^\\s*(?:export )?const ${name}\\s*=`, 'm'));
      if (at < 0) { return null; }
      const m = /\/(?:[^/\n\\]|\\.)+\/(?=;)/.exec(text.slice(at));
      return m ? m[0] : null;
    };
    const blind = await readFile(join(ROOT, 'lib/blind.mjs'), 'utf8');
    const pairs = [
      ['읽는 코드', [`${HELPERS} SOURCE_EXT`, litOf(helpers, 'SOURCE_EXT')], ['lib/blind.mjs READABLE', litOf(blind, 'READABLE')]],
      ['코드인데 못 읽는 것', [`${HELPERS} BLIND_EXT`, litOf(helpers, 'BLIND_EXT')], ['lib/blind.mjs CODE_BUT_BLIND', litOf(blind, 'CODE_BUT_BLIND')]],
    ];
    /* 분모 가드 — 하나라도 못 읽었으면 이 검사는 **죽은 것**이다. 조용히 통과시키지 않는다. */
    const unread = pairs.flatMap(([, a, b]) => [a, b]).filter(([, lit]) => lit === null).map(([w]) => w);
    assert.deepEqual(unread, [], `확장자 목록을 못 읽었다: ${unread.join(' · ')} — 훑개가 낡았다(이름이 바뀌었다)`);

    for (const [what, a, b] of pairs) {
      const [aw, al] = a;
      const [bw, bl] = b;
      const ar = read(new RegExp(al.slice(1, -1)));
      const br = read(new RegExp(bl.slice(1, -1)));
      assert.equal(ar, br,
        `「${what}」 목록 두 벌이 **서로 반대말을 한다** — 한 자리만 고쳐졌다:\n`
        + `   ${aw} → ${ar}\n   ${bw} → ${br}\n`
        + '   ⛔ 두 도구가 다른 답을 내면 사람은 **초록불을 주는 쪽**을 믿는다');
    }
    console.log(`✅ 확장자 목록 두 벌이 같은 답을 한다 (${read(new RegExp(litOf(helpers, 'SOURCE_EXT').slice(1, -1)))})`);

    /**
     * ⛔⛔ **셋째 벌을 못 쓰게 막는다** — R163 이 난 정확한 모양이다.
     *
     * 훑개(`scan.ts`)가 **자기 목록을 한 벌 더** 갖고 있었다. 그래서 규칙 쪽에서 `.js`·`.jsx` 를
     * 열었는데도 **파일이 규칙까지 오지 못했고**, `census` 는 「.js 를 100% 읽는다」·
     * `observe` 는 「못 읽은 파일 2개」라고 **서로 반대말을 했다.**
     * ⇒ 훑개는 판정을 **가져다 써야** 한다. 여기 확장자 정규식이 다시 생기면 문다.
     */
    const ownLiteral = /\/\\\.\((?:[a-z|]*\b(?:tsx?|jsx?|vue|svelte|astro)\b[a-z|]*)\)\$\//.exec(
      scan.split('\n').filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*')).join('\n'),
    );
    assert.equal(ownLiteral, null,
      `${SCAN} 이 확장자 목록을 **자기 것으로 다시 적었다**: ${ownLiteral?.[0]}\n`
      + '   ⛔ 훑개는 `isSourcePath`·`isBlindPath` 를 **가져다 써야** 한다 — 적으면 갈리고,\n'
      + '   갈리면 규칙은 열렸는데 **파일이 규칙까지 못 온다**(R163 이 그렇게 났다)');
    /* ⛔ **가져오는 줄을 본다.** 처음엔 이름이 어디든 나오면 통과였는데, `import` 에서만 빼고
       쓰는 자리는 그대로 두는 변이가 **안 걸렸다**(빌드 도장 검사가 대신 물어 준 것뿐이다). */
    const imported = /import\s*\{([^}]*)\}\s*from\s*'@core\/fe-agent-contracts'/.exec(scan)?.[1] ?? '';
    for (const need of ['isSourcePath', 'isBlindPath']) {
      assert.ok(imported.includes(need),
        `${SCAN} 이 \`${need}\` 를 규칙 패키지에서 **안 가져온다** — 어딘가에서 자기 기준으로 거르고 있다`);
    }
    console.log('✅ 훑개가 확장자 판정을 규칙에서 가져다 쓴다 (자기 목록 없음)');
  }
}

/**
 * **코드가 어디 사는가를 한 자리에서 정하는가** (R163).
 *
 * ⚠️ 관측이 `` `${g.appDir}/src` `` 를 **세 자리에서** 만들고 있었다(훑기 · 출처 · 드리프트).
 * 훑개(`scanCodebase`)는 `targets` 를 받아 어디든 훑을 수 있는데 **부르는 쪽이 막고** 있었고,
 * 그래서 `src/` 관례를 안 쓰는 저장소는 **파일 0개**를 보고도 화면이 「0건」이었다.
 * ⇒ `lib/galaxy-scan.mjs` 가 정본이다. **다시 적으면 여기서 문다.**
 */
{
  assert.deepEqual(codeTargets({ appDir: 'web' }), ['web/src'], '기본은 여전히 `src` 다 — 자동으로 넓히지 않는다');
  assert.deepEqual(codeTargets({ appDir: '.' }), ['src'], 'appDir 이 뿌리여도 `src` 를 붙인다');
  assert.deepEqual(codeTargets({}), ['src'], 'appDir 이 없으면 뿌리로 본다');
  assert.deepEqual(codeTargets({ appDir: '.', codeDirs: ['lib', 'bin'] }), ['lib', 'bin'],
    '은하가 말하면 그대로 쓴다 — `src/` 는 관례이지 법이 아니다');
  /* ⛔ 빈 배열을 「아무 데도 안 훑는다」로 읽으면 **0개를 보고 0건이라 말하는** 그 사고가 난다. */
  assert.deepEqual(codeTargets({ appDir: 'web', codeDirs: [] }), ['web/src'],
    '빈 배열은 「말하지 않았다」로 본다 — 훑는 곳이 0개가 되면 안 된다');
  /* ⚠️ 구분자는 항상 `/` 다 — 이 값은 `git -- <pathspec>` 에 들어가고 git 은 `\\` 를 안 받는다. */
  assert.ok(!codeTargets({ appDir: 'a/b', codeDirs: ['c/d'] })[0].includes('\\'),
    '경로 구분자가 `/` 여야 한다 — 윈도우에서 조용히 0건이 된다');
  /* ⛔ 기본값 상수도 시험한다 — 「관례이지 법이 아니다」를 코드가 말하게 해 놨으니 그 말이 참인지 잰다. */
  assert.deepEqual(DEFAULT_CODE_DIRS, ['src'], '기본값을 조용히 넓히지 마라 — 넓히면 생성물이 분모에 든다');
  assert.equal(codeTargetLabel({ appDir: '.', codeDirs: ['lib', 'bin'] }), 'lib · bin',
    '여러 곳을 훑으면 **전부** 말해야 한다 — 어디를 안 봤는지가 늘 문제였다');
  assert.equal(codeTargetLabel({ appDir: 'web' }), 'web/src', '한 곳이면 그 한 곳을 말한다');
  console.log('✅ 코드가 사는 곳을 한 자리에서 정한다 (기본 `src` · 은하가 덮어쓸 수 있다)');

  /**
   * ⛔⛔ **다시 적었는지 본다.** 확장자 목록이 세 벌로 갈렸던 것과 **같은 병**이다 —
   * 한 자리에 적어 두면 다음 사람이 옆에 한 벌 더 적는다. 그때 조용히 갈린다.
   */
  const rebuilt = [];
  for (const file of ['observatory/observe.mjs', 'observatory/blind-census.mjs', 'observatory/lint-drift.mjs']) {
    const text = await readFile(join(ROOT, file), 'utf8').catch(() => '');
    /* 주석은 뺀다 — 「왜 그렇게 하지 않는가」를 적은 줄까지 물면 설명을 못 쓰게 된다. */
    const code = text.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
    if (/\$\{[a-z]\w*\.appDir\}\/src|appDir[^\n]*,\s*'src'\)/.test(code)) {
      rebuilt.push(file);
    }
  }
  assert.deepEqual(rebuilt, [],
    `코드가 사는 곳을 **다시 만든 자리**가 있다: ${rebuilt.join(' · ')}\n`
    + '   ⛔ `lib/galaxy-scan.mjs` 의 `codeTargets()` 를 써라 — 적으면 갈리고, 갈리면 두 도구가 반대말을 한다');
  console.log('✅ 훑는 곳을 다시 만드는 자리가 없다');

  /**
   * **버려질 코드를 분모에서 빼는 축이 한 자리인가.**
   * ⚠️ `census` 는 빼고 `observe` 는 안 빼서, 벤더링된 엔진의 `dist/` 가 훑혔고
   * 규칙이 **자기 예시 문자열을 물어** 도구 코드에서 tailwind 위반 55건이 나왔다.
   */
  const observeSrc = await readFile(join(ROOT, 'observatory/observe.mjs'), 'utf8');
  const censusSrc = await readFile(join(ROOT, 'observatory/blind-census.mjs'), 'utf8');
  for (const [where, text] of [['observe', observeSrc], ['census', censusSrc]]) {
    assert.ok(/gitIgnoredPaths/.test(text),
      `${where} 가 **버려질 코드를 분모에서 빼지 않는다** — 생성물이 기준선을 흔든다(R163)`);
  }
  assert.ok(/ignore:\s*ignoredSet/.test(observeSrc),
    'observe 가 훑개에 `ignore` 를 **안 넘긴다** — 축을 구해 놓고 안 쓰면 없는 것과 같다');
  console.log('✅ 두 도구가 같은 축으로 버려질 코드를 뺀다 (git 이 무시하는 것)');
}

/* ── 보존 법칙에 관문이 있는가 (R63).
   ⚠️⚠️ 이 법칙도 **아무도 안 보고 있었다**(광속 한계가 그랬던 것처럼 · R62).
   게다가 법칙에 적힌 재는 법을 그대로 돌리면 **늘 실패한다** — `fixtures/` 의 은하 둘이
   `.tsx` 16개를 갖고 있기 때문이다. 그 별들은 **은하 안에 있다**(법칙의 뜻은 지켜졌다).
   ⛔ 그래서 예외를 **명시**한다. 예외를 안 적으면 사람은 그 검사를 끄는 법부터 배운다. */
const STAR_LIKE = /\.(tsx|jsx|vue|svelte|astro)$/;
/**
 * 은하가 사는 자리 — 우주 안에 **벤더링된 은하**다. 별이 거기 있는 것은 옳다.
 *
 * ⛔ **손으로 `fixtures/` 라고 적혀 있었다.** 사람이 정한 이름 하나를 열거한 것이라,
 * 우주 안에 은하를 하나 더 벤더링하면(콘솔을 은하로 두는 것이 그렇다) **보존 법칙이
 * 그것을 「별이 섞였다」로 잡는다.** 그때 사람이 배우는 것은 「예외를 하나 더 적는 법」이다.
 * ⚠️ §9 가 네 번 잡은 그 형태다 — **사람이 정한 이름을 열거하지 마라.**
 *
 * ⇒ **구조로 바꾼다:** 등록된 은하 좌표(`galaxies/*.json` 의 `path`)가 곧 은하의 집이다.
 *   좌표에 없는 곳에 별이 있으면 그건 진짜로 법칙 위반이다 — 법이 약해지지 않는다.
 *   ⛔ 오히려 세진다: 「등록도 안 한 은하를 우주 안에 뒀다」가 이제 잡힌다.
 */
const galaxyHomeDirs = (await readdir(join(ROOT, 'galaxies')).catch(() => []))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'galaxies', f), 'utf8')).path)
  .filter((p) => typeof p === 'string' && p !== '' && !p.startsWith('/'));
/**
 * 분모가 0이면 이 검사는 **모든 별을 위반으로** 만든다 — 그건 검사가 아니라 사고다(§8).
 * ⚠️ 다만 **배달본에는 등록된 은하가 없는 것이 정상이다**(은하는 그 팀의 것이라 배달 안 된다).
 *    그래서 「0개」를 우주 저장소에서만 결함으로 본다 — 배달본에서는 **못 쟀다**고 말한다.
 *    ⛔ 이걸 안 가르면 배달본이 빨간불이 난다. 실제로 났다 — **또 환경을 재고 있었다.**
 */
assert.ok(galaxyHomeDirs.length > 0 || !isUniverseSource,
  '등록된 은하 좌표에서 상대 경로를 하나도 못 읽었다 — 벤더링된 은하가 전부 위반으로 잡힌다');
const GALAXY_HOMES = (rel) => galaxyHomeDirs.some((home) => rel === home || rel.startsWith(`${home}/`));
const universeFiles = await collect('observatory').then(async (a) => [
  ...a, ...await collect('bigbang'), ...await collect('lib'), ...await collect('laws'), ...await collect('orbits'),
]).catch(() => []);
if (universeFiles.length === 0) {
  console.log('⏭  보존 법칙 검사 — 우주 소스가 없다. 못 쟀다.');
} else {
  const walkAll = async (dir) => {
    const out = [];
    for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true }).catch(() => [])) {
      if (['node_modules', '.git', 'dist', 'out'].includes(entry.name)) { continue; }
      const rel = `${dir}/${entry.name}`;
      out.push(...(entry.isDirectory() ? await walkAll(rel) : [rel]));
    }
    return out;
  };
  /**
   * ⛔ **git 이 아는 전부를 훑는다 — 폴더 이름을 열거하지 않는다.**
   *
   * ⚠️ 여기 **손으로 적은 9개 폴더**가 있었다(`observatory`·`bigbang`·`lib`·…). 그래서
   * 법칙은 「**우주 안에** 별을 두지 않는다」인데 검사는 「**이 9곳 안에** 두지 않는다」였다.
   * 실측으로 확인했다: 새 최상위 폴더(`app/`)에 `.tsx` 를 넣으니 **안 물었다.**
   * ⛔ §9 가 네 번 잡은 그 형태다 — **사람이 정한 이름을 열거하면 그 밖은 안 보인다.**
   *
   * ⇒ `git ls-files` 로 바꾼다. 구조적으로 옳고 셋이 공짜로 딸려 온다:
   *   ① 새 폴더가 자동으로 들어온다  ② `.gitignore` 된 산출물·`node_modules` 가 자동으로 빠진다
   *   ③ **커밋된 것만** 본다 — `verify-orphans` 가 「갓 만든 별은 아직 고아인 것이 정상」이라며
   *      쓰는 그 신호와 같다. 작업 중인 파일로 관문이 막히면 사람은 검사를 끄는 법부터 배운다.
   */
  const walked = await new Promise((resolve) => {
    const child = spawn('git', ['ls-files'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => resolve(out.split('\n').filter(Boolean)));
    child.on('error', () => resolve([]));
  });
  /**
   * ⚠️ **배달본은 git 저장소가 아니다** — `git ls-files` 가 0줄을 낸다. 그건 워커 고장이
   * 아니라 **여기선 못 재는 것**이다(§8). 우주 저장소에서만 분모를 요구한다.
   * ⛔ 조용히 넘기지 않는다 — 못 쟀다고 **말한다.**
   */
  if (!isUniverseSource && walked.length === 0) {
    console.log('⏭  보존 법칙 검사 — 여기는 git 저장소가 아니다(배달본). 못 쟀다.');
  } else {
  assert.ok(walked.length > 40,
    `우주의 파일을 ${walked.length}개만 훑었다 — 워커가 고장 났다(0은 무죄가 아니다 · §8)`);
  const stars = walked.filter((f) => STAR_LIKE.test(f) && !GALAXY_HOMES(f));
  assert.deepEqual(stars, [],
    `우주 안에 별이 섞였다 — 소스 산출물은 은하에 산다(보존 법칙): ${stars.join(' · ')}`);
  console.log(`✅ 우주 안에 별이 없다 — 벤더링된 은하 ${galaxyHomeDirs.length}곳(${galaxyHomeDirs.join(' · ')})은 은하다`);
  }
}

/* ── 허용하지만 **읽는 코드가 없는** 플래그 (R72).
   ⚠️⚠️ §7 이 막으려던 것의 **뒤집힌 형태**다 — 도구가 **아는 입력**을 받고도 모드를 안 켠다.
   사람에게는 똑같이 보인다: 「켰는데 안 켜졌다」. 실측에서 둘 나왔고
   그중 하나(`verify --stage`)는 **사용법 문서가 광고**하고 있었다.
   ⛔ 문자열이 있는지로 보면 안 된다 — `git status --porcelain` 의 인자에 속는다(내가 속았다).
   **읽는 방식**으로 본다. */
const READS = ["argv.includes('%s')", "has('%s')", "flag('%s')", "argv.indexOf('%s')"];
const cliFiles = (await Promise.all(['bin', 'observatory', 'bigbang', 'beacon'].map(collect))).flat();
if (cliFiles.length === 0) {
  console.log('⏭  플래그 검사 — 우주 소스가 없다. 못 쟀다.');
} else {
  const dead = [];
  for (const file of cliFiles) {
    const text = await readFile(join(ROOT, file), 'utf8');
    const declaredIn = /rejectUnknownFlags\([^,]+,\s*\[([^\]]*)\]/.exec(text);
    if (!declaredIn) { continue; }
    for (const raw of declaredIn[1].split(',')) {
      const name = raw.trim().replace(/'/g, '');
      if (!name || name === '--universe') { continue; }
      if (!READS.some((pattern) => text.includes(pattern.replace('%s', name)))) {
        dead.push(`${file} ${name}`);
      }
    }
  }
  assert.deepEqual(dead, [],
    `허용하지만 읽는 코드가 없는 플래그 — 「켰는데 안 켜졌다」가 된다: ${dead.join(' · ')}`);
  console.log(`✅ 허용된 플래그가 전부 읽히는 코드를 갖고 있다 (파일 ${cliFiles.length}개)`);
}

/* ── dist 가 지금 소스에서 나왔는가 (R81).
   ⚠️⚠️ `dist` 는 gitignore 이고 **selftest 는 소스를, 관측은 dist 를** 읽는다 —
   소스를 고치고 안 빌드하면 **두 진실**이 생긴다(관측이 옛 규칙으로 초록불을 냈다).
   ⛔ 처음엔 **mtime** 으로 쟀는데 **변이 시험이 소스를 복원하며 시각을 새로 찍어** 속았다.
   ⇒ **내용으로 잰다.** 빌드가 자기 입력의 지문을 남기고(`observatory/engine/.build-stamp`)
   여기서 지금 소스의 지문과 견준다. */
const enginePackages = join(ROOT, 'observatory/engine/packages');
const stampFile = join(ROOT, 'observatory/engine/.build-stamp');
const stamped = await readFile(stampFile, 'utf8').then((s) => s.trim()).catch(() => null);
if (stamped === null) {
  console.log('⏭  빌드 도장이 없다 — 갓 클론했거나 아직 안 빌드했다. 못 쟀다.');
} else {
  const { sourceFingerprint } = await import(pathToFileURL(join(ROOT, 'observatory/engine/stamp.mjs')).href);
  const now = await sourceFingerprint(enginePackages);
  assert.equal(now, stamped,
    `dist 가 지금 소스에서 나온 것이 아니다 — 빌드를 잊었다(관측은 옛 규칙으로 초록불을 낸다). 도장 ${stamped} · 지금 ${now}`);
  console.log(`✅ dist 가 지금 소스에서 나왔다 (${stamped})`);
}

/* ── 판올림에 기록이 있는가 (R83).
   ⚠️⚠️ 적색편이(`redshift/`)는 「우주가 무엇을 왜 바꿨는지 **버전마다** 남긴다」고 적어 뒀다.
   그런데 v0.5.0 에서 멈춘 채 판은 0.8.0 이었다 — **v0.6~v0.8 이 기록 없이 지나갔다.**
   적어 놓고 안 지키면 그것은 규율이 아니라 희망이다. 이제 관문이 막는다. */
const noteFile = join(ROOT, 'redshift', `v${cfg?.version ?? ''}.md`);
/* ⚠️ **적색편이는 배달되지 않는다** — 소비 저장소에는 `redshift/` 가 없다.
   없는 것을 없다고 벌하면 갓 깐 우주가 빨간불이 된다(실측 R83: 배달 관문이 그렇게 걸렸다). */
const hasRedshift = await readdir(join(ROOT, 'redshift')).then(() => true).catch(() => false);
if (!cfg || !hasRedshift) {
  console.log('⏭  판올림 기록 — 우주 소스가 아니다(적색편이는 배달되지 않는다). 못 쟀다.');
} else {
  const hasNote = await readFile(noteFile, 'utf8').then(() => true).catch(() => false);
  assert.ok(hasNote, `판 ${cfg.version} 의 적색편이 기록이 없다 — redshift/v${cfg.version}.md 를 적어라`);
  console.log(`✅ 판 ${cfg.version} 의 적색편이 기록이 있다`);
}

/* ── 배달 경계 그림이 실제와 맞는가 (R86).
   ⚠️⚠️ 구조 그림은 손으로 그린다 — 그리고 낡는다. 실측: 배달 경계 그림이 `lib/` 을
   **패키지 쪽에** 그려 두고 있었다. R43 이 「lib 을 배달 안 해 42커밋 동안 배달본이
   깨져 있었다」를 고쳤는데, **그림은 고치기 전의 세상**을 그리고 있었다.
   배달 목록은 기계가 안다(`lib/delivered.mjs`) — 그림과 견줄 수 있다. */
const archDoc = await readFile(join(ROOT, 'docs/08-architecture.md'), 'utf8').catch(() => null);
if (!archDoc || !cfg) {
  console.log('⏭  배달 경계 그림 — 우주 소스가 아니다. 못 쟀다.');
} else {
  const { DELIVERED } = await import(pathToFileURL(join(ROOT, 'lib/delivered.mjs')).href);
  const drawn = archDoc.slice(archDoc.indexOf('subgraph DELIVERED'), archDoc.indexOf('subgraph DELIVERED') + 900);
  const missing = DELIVERED.map(([dir]) => dir).filter((dir) => !drawn.includes(`${dir}/`));
  assert.deepEqual(missing, [],
    `배달 경계 그림에 없는 것 — 그림이 낡았다: ${missing.join(' / ')}`);
  console.log(`✅ 배달 경계 그림이 배달 목록과 맞다 (${DELIVERED.length}개)`);
}

/* ── 궤적이 자기 시각을 들고 있는가 (R88).
   ⛔ 없으면 시간원이 파일 mtime 뿐이고, mtime 은 `git checkout`·복사·변이 시험의 복원이
   새로 찍는다 — `learn --since` 로 자른 범위가 조용히 달라진다. 실측으로 두 번 당한 함정이다
   (R81 dist 검사 · R88 내가 `ls -t` 로 남의 로그를 덮어쓴 사고). */
const recorderPath = join(ROOT, 'observatory/engine/packages/@core/fe-agent-harness/dist/trajectory.js');
if (!existsSync(recorderPath)) {
  console.log('⏭  궤적 시각 도장 — 엔진 dist 가 없다. 못 쟀다.');
} else {
  const { createTrajectoryRecorder } = await import(pathToFileURL(recorderPath).href);
  const dir = join(tmpdir(), `universe-traj-${process.pid}`);
  const rec = createTrajectoryRecorder({ dir, runId: 'selftest', stageId: 's00' });
  await rec.append({ kind: 'reset', step: 0 });
  const row = JSON.parse((await readFile(rec.path, 'utf8')).trim().split('\n')[0]);
  await rm(dir, { recursive: true, force: true });
  assert.ok(Number.isFinite(Date.parse(row.at ?? '')),
    `궤적 줄에 시각(at)이 없다 — 시간원이 mtime 뿐이 된다: ${JSON.stringify(row)}`);
  console.log('✅ 궤적 줄이 자기 시각을 들고 있다');
}

/* ── 변이 시험이 없는 관문은 깨져도 모른다 (R89).
   ⚠️ 실측으로 값이 증명된 규칙이다: 엔진 규칙 11개가 selftest 에 한 번도 안 나온 채 옳게
   돌고 있었는데, 덮은 지 한 시간도 안 돼 `a11y/img-alt` 가 죽은 채 커밋됐다(R08).
   그래서 「변이 없는 관문 0개」가 아니라 **「판단하지 않은 무-변이 관문 0개」**를 센다 —
   못 거는 관문은 `gates.mjs` 의 `noMutation` 에 사유를 적어야 한다. */
if (!cfg) {
  console.log('⏭  관문의 변이 덮개 — 우주 소스가 아니다. 못 쟀다.');
} else {
  const { GATES } = await import(pathToFileURL(join(ROOT, 'lib/gates.mjs')).href);
  const checksSrc = await readFile(join(ROOT, 'observatory/verify-checks.mjs'), 'utf8');
  const covered = new Set();
  /* ⚠️ `node` 만 세다가 `bash` 케이스를 놓쳐 「변이 없음 7개」라는 틀린 수를 냈다(R89). */
  for (const m of checksSrc.matchAll(/cmd:\s*\['[a-z]+',\s*\[([^\]]*)\]/g)) {
    const f = /'([^']+\.(?:mjs|sh|ts))'/.exec(m[1]);
    if (f) {
      covered.add(f[1]);
    }
  }
  const unjudged = GATES.filter((g) => !covered.has(g.file) && !g.noMutation);
  assert.deepEqual(unjudged.map((g) => g.label), [],
    `변이 시험도 없고 사유도 없는 관문 — 깨져도 모른다: ${unjudged.map((g) => g.file).join(' · ')}`);
  const excused = GATES.filter((g) => g.noMutation);
  /* 반대 방향도 본다 — 사유를 달아 놓고 나중에 변이를 붙였으면 그 사유는 낡았다. */
  const staleExcuse = excused.filter((g) => covered.has(g.file));
  assert.deepEqual(staleExcuse.map((g) => g.label), [],
    `변이가 생겼는데 「못 건다」는 사유가 남아 있다: ${staleExcuse.map((g) => g.file).join(' · ')}`);
  console.log(`✅ 관문 ${GATES.length}개 중 변이 ${GATES.length - excused.length}개 · 사유를 적고 뺀 것 ${excused.length}개`);
}

/* ── 배달본에서 못 도는 검사는 사유를 대는가 (R91).
   ⛔ 전엔 소비 저장소에서 `verify-enumeration.mjs` 를 직접 부르면 **생 ENOENT 스택트레이스**로
   죽었다. `universe check` 는 「여기선 못 잰다」고 제대로 말하지만, 폴더를 열어 직접 부른
   사람에게는 아무도 말해 주지 않았다. */
const { universeSourceProblem } = await import(pathToFileURL(join(ROOT, 'lib/home.mjs')).href);
/* ⚠️ 「여기서는 통과해야 한다」 쪽은 안 잰다 — 그 조건이 곧 가드의 입력이라 **동어반복**이고,
   무조건 단언했더니 엔진이 없는 배달본에서 이 시험 자체가 빨개졌다(실측, 이 바퀴).
   회귀가 나는 쪽은 하나다: **엔진이 없는 자리에서 사유를 대는가.** */
const away = await universeSourceProblem(tmpdir(), 'universe enumeration');
assert.ok(away?.includes('배달본에서는 못 돈다'),
  `배달본에서 부르면 사유를 대야 한다: ${away}`);
console.log('✅ 배달본에서 못 도는 검사가 사유를 댄다');

/* ⚠️ **`cfg` 가 있다고 우주 소스인 것이 아니다** — `universe.config.json` 은 배달된다.
   아래 둘은 `bin/`·엔진 소스를 읽으므로 **배달본에서는 못 잰다**(실측: 배달 관문이 ENOENT 로
   빨개졌다). 배달되지 않는 것으로 가른다. */

/* ── 아무도 안 돌리는 검사가 있는가 (R92).
   관문 목록(GATES)도 손 목록이다 — 도구를 만들고 등록을 잊으면 조용히 죽은 검사가 된다. */
if (isUniverseSource) {
  const { GATES, NOT_GATED } = await import(pathToFileURL(join(ROOT, 'lib/gates.mjs')).href);
  const gated = new Set(GATES.map((g) => g.file));
  /**
   * ⛔⛔ **이름이 아니라 구조로 고른다 — 훑개가 25개 중 18개만 보고 있었다.**
   *
   * 여기 `/^(verify|render)-/` 라는 **사람이 정한 이름 규칙**이 박혀 있었다. 그래서
   * 그 규칙을 안 따르는 도구는 **이 검사에 아예 안 보였다.** 실측으로 잡혔다:
   * 자식이 `observatory/liveness.mjs` 를 새로 만들었는데 **관문에도 사유에도 없는데
   * 아무것도 안 빨개졌다.** 오늘 안 걸린 나머지 여섯(`observe`·`learn`·`verify`·
   * `light-speed`·`lint-drift`·`extract`)은 **우연히** 등재돼 있었을 뿐이다.
   * ⛔ §9 가 네 번 잡은 그 형태다 — **이름을 열거하면 그 밖은 안 보인다.**
   *
   * ⇒ **shebang 이 있으면 진입점이다.** 사람이 부를 수 있게 만든 것이라는 뜻이고,
   *   부를 수 있는데 아무도 안 부르면 그것이 정확히 이 검사가 찾는 것이다.
   *   부품(shebang 없는 모듈)은 스스로 도는 것이 아니라 남이 불러 쓰는 것이라 뺀다.
   */
  const observatoryFiles = (await readdir(join(ROOT, 'observatory')))
    .filter((f) => /\.(mjs|sh)$/.test(f));
  const tools = [];
  for (const f of observatoryFiles) {
    /* eslint-disable-next-line no-await-in-loop */
    const head = await readFile(join(ROOT, 'observatory', f), 'utf8').then((t) => t.slice(0, 40)).catch(() => '');
    if (head.startsWith('#!')) { tools.push(`observatory/${f}`); }
  }
  /* ⛔ **분모를 세라(R138).** 폴더를 훑는 검사도 조용히 죽는다 — 이 자리를 빈 폴더로 돌리니
     **도구를 하나도 못 본 채 「전부 관문이거나 사유가 있다」**가 됐다. 아무것도 안 빨개졌다.
     ⚠️ 같은 자리를 잰 셋 중 이것만 진짜 구멍이었다 — `redshift` 는 다른 경로를 보고 있어
     내 변이가 헛것이었고, `docs` 는 「못 쟀다」고 옳게 말한다. */
  assert.ok(tools.length > 5,
    `관측소 도구를 ${tools.length}개만 봤다 — 훑개가 고장 났다(0은 무죄가 아니다 · §8)`);
  /* ⛔ 이름 규칙으로 세던 때는 18개였다. 구조로 바꿔 늘어난 만큼이 **안 보이던 것**이다. */
  assert.ok(tools.length >= observatoryFiles.length - 2,
    `진입점을 ${tools.length}/${observatoryFiles.length}개만 봤다 — shebang 판정이 이상하다`);
  const unjudged = tools.filter((f) => !gated.has(f) && !NOT_GATED[f]);
  assert.deepEqual(unjudged, [],
    `관문에도 없고 사유도 없는 검사 — 아무도 안 돌린다: ${unjudged.join(' · ')}`);
  /* 반대 방향 — 관문에 넣어 놓고 「못 넣는다」는 사유가 남아 있으면 그 사유가 낡았다. */
  const staleExcuse = Object.keys(NOT_GATED).filter((f) => gated.has(f));
  assert.deepEqual(staleExcuse, [],
    `관문에 있는데 「못 넣는다」는 사유가 남아 있다: ${staleExcuse.join(' · ')}`);
  console.log(`✅ 관측소 도구 ${tools.length}개가 전부 관문이거나 사유가 있다 (밖 ${Object.keys(NOT_GATED).length}개)`);
}

/* ── 빨간불 표식이 새로 생겼는데 why.mjs 가 모르는가 (R92).
   ⛔ R59 가 이미 물렸다 — `❌`·`⛔` 만 보다가 드리프트 줄(`🔴`)을 놓쳤고, 화면에는
   **진짜 이유 대신 안내문**이 떴다. 표식은 손 목록이라 또 낡는다. 여기서 잰다:
   `console.error` 로 나가는 첫 기호는 곧 실패 표식이다. */
if (isUniverseSource) {
  const roots = ['bin', 'observatory', 'beacon', 'bigbang', 'lib'];
  const walk = async (dir) => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'engine') {
        continue;
      }
      const p = join(dir, e.name);
      out.push(...(e.isDirectory() ? await walk(p) : p.endsWith('.mjs') ? [p] : []));
    }
    return out;
  };
  const unknownMarks = new Set();
  let errorLinesSeen = 0;
  /* ⛔ **`u` 플래그가 없으면 이모지가 반쪽으로 비교된다.** `🔴`·`🟣` 는 서로게이트 쌍이라
     앞쪽 반(`\uD83D`)이 같고, 그래서 **처음 만든 이 검사는 새 표식을 「이미 아는 것」으로
     삼켰다**(실측, 이 바퀴). R89 의 문자 범위 함정(`z-없`)과 같은 가족이다. */
  const failure = /^[❌⛔🔴]$/u;
  for (const dir of roots) {
    for (const f of await walk(join(ROOT, dir))) {
      const text = await readFile(f, 'utf8');
      /* 코드 포인트 하나를 통째로 잡는다 — 반쪽으로 자르면 위의 함정으로 되돌아간다. */
      for (const m of text.matchAll(/console\.error\(\s*\[?\s*[`'"]([^`'"\n])/gu)) {
        const ch = m[1];
        errorLinesSeen += 1;
        /* 낱말·공백·이스케이프(`\n`)는 표식이 아니다. */
        if (/[\w\s가-힣(\[.\\]/u.test(ch) || failure.test(ch)) {
          continue;
        }
        unknownMarks.add(ch);
      }
    }
  }
  /* ⛔ **분모를 세라(R136).** `console.error` 를 하나도 못 찾았으면 훑개가 죽은 것이다. */
  assert.ok(errorLinesSeen > 20,
    `console.error 를 ${errorLinesSeen}줄만 봤다 — 훑개가 고장 났다(§8)`);
  assert.deepEqual([...unknownMarks], [],
    `실패 줄을 새 기호로 여는 검사가 있다 — lib/why.mjs 의 FAILURE 에 더해라: ${[...unknownMarks].join(' ')}`);
  console.log('✅ 빨간불 표식이 전부 why.mjs 가 아는 것이다');
}

/* ── 표본이 처방을 들고 오는가 (R94).
   ⛔ 실측: 자리(`where`)와 코드(`evidence`)는 보여 주는데 **처방(`fix`)은 안 왔다.**
   R35 가 「처방 없는 관문은 무시하는 법부터 가르친다」로 규칙마다 처방을 강제해 놨고
   `universe fix` 가 그것을 지키는데, **데이터는 있고 화면만 비어 있었다.** */
if (isUniverseSource && existsSync(join(ROOT, 'observatory/engine/packages/@plugins/harness-react-vite/dist/scan.js'))) {
  const scanSrc = await readFile(
    join(ROOT, 'observatory/engine/packages/@plugins/harness-react-vite/dist/scan.js'), 'utf8');
  assert.match(scanSrc, /fix:\s*reason\.fix/,
    '표본이 처방을 안 싣는다 — 자리만 알려 주고 무엇을 하라고는 안 하게 된다');
  const observeSrc = await readFile(join(ROOT, 'observatory/observe.mjs'), 'utf8');
  assert.match(observeSrc, /const prescription = s\.fix;/,
    '관측이 표본의 처방을 안 찍는다 — 실어 보내도 화면에 안 온다');
  console.log('✅ 표본이 처방을 들고 오고 화면이 그것을 찍는다');
}

/* ── 닫힘을 기계가 잇는가 (R96). */
{
  const { strikeNebulaRow } = await import(pathToFileURL(join(ROOT, 'lib/nebula-close.mjs')).href);
  const doc = [
    '| 아직 열린 것 | R89 변경 정직성 **미흡** | 무엇을 해야 하나 |',
    '| ~~이미 그은 것~~ | R80 집행 가능성 **미흡** | ✅ **닫힘 — R81** |',
    /* ⚠️ **취소선만 있고 「닫힘」은 없는 줄.** 이것이 없으면 `~~` 필터가 진짜로 무는지 못 잰다 —
       실측: 이 줄을 안 넣었더니 변이를 걸어도 다른 필터가 잡아 **초록불이었다**. */
    '| ~~다른 말로 닫은 것~~ | R79 도달성 **B** | 위키에서 확인했다 |',
  ].join('\n');
  const hit = strikeNebulaRow(doc, 'R89 변경 정직성', 'R95', 'R96');
  assert.ok(hit.found, '열린 줄을 못 찾았다');
  assert.match(hit.body, /~~아직 열린 것~~/, '줄을 안 그었다');
  assert.match(hit.body, /닫힘 — R95\*\* \(R96 이 이었다\)/, '고친 라운드가 아니라 그은 라운드를 적었다');
  /* ⛔ **못 찾으면 조용히 넘어가면 안 된다** — 「닫았다」고 적고 아무것도 안 닫히는 것이
     이 부품이 생긴 이유다. */
  assert.equal(strikeNebulaRow(doc, 'R00 없는축', null, 'R96').found, false,
    '없는 줄을 찾았다고 한다 — 빈말이 통과한다');
  /* 이미 그어진 줄은 두 번 긋지 않는다. */
  assert.equal(strikeNebulaRow(doc, 'R80 집행 가능성', null, 'R96').found, false,
    '이미 그어진 줄을 또 그으려 한다');
  /* ⛔ **취소선 줄을 「열린 것」으로 세면 커버리지 구멍이 조용히 생긴다(R67·R108).**
     규칙이 법칙을 잃고 성운 항목도 닫히면, 그 규칙은 아무도 안 보는데 초록불이 난다.
     ⚠️ 전엔 이것을 **변이 시험**으로 쟀는데, 성운이 주인인 규칙이 0개가 되자(R108 에서
     `copy-state` 가 법칙을 얻었다) **태울 대상이 사라져 시험이 낡았다.** 성질로 잰다. */
  const { openNebulaRows } = await import(pathToFileURL(join(ROOT, 'lib/nebula-close.mjs')).href);
  const rows = openNebulaRows(doc);
  assert.equal(rows.length, 1, `열린 줄만 세야 한다 — 받은 값 ${rows.length}`);
  assert.match(rows[0], /아직 열린 것/, '취소선 줄을 열린 것으로 셌다');
  console.log('✅ 성운 줄 긋기 — 못 찾으면 못 찾았다고 하고, 취소선은 안 센다');
}

/* ── 끊으면 치우는가 (R100).
   ⛔ 실측(R12·R20): `SIGINT`·`SIGTERM` 처리기가 **0곳**이었다. Ctrl-C 로 끊으면 `close()` 가
   못 돌아 샌드박스 워크트리가 그 자리에서는 안 치워졌다 — 사람은 「끊었으니 치워졌겠지」라고 믿는다.
   ⚠️ **`SIGKILL` 은 여전히 못 잡는다.** 잡을 수 있는 신호가 아니다 — 막았다고 하지 않는다.
   ⚠️ 자식 프로세스로 잰다. 이 프로세스에서 신호를 쏘면 **시험이 스스로 죽는다.** */
if (isUniverseSource && existsSync(join(ROOT, 'observatory/engine/packages/@core/fe-agent-harness/dist/EnvHarness.js'))) {
  const probe = join(tmpdir(), `universe-signal-${process.pid}.mjs`);
  await writeFile(probe, [
    `import { EnvHarness } from ${JSON.stringify(join(ROOT, 'observatory/engine/packages/@core/fe-agent-harness/dist/EnvHarness.js'))};`,
    "const h = new EnvHarness({ repoRoot: process.cwd(), stageId: 'x' });",
    "h.sandbox = { dir: '/tmp/x', dispose: async () => { console.log('DISPOSED'); } };",
    'h.watchSignals();',
    "process.kill(process.pid, 'SIGINT');",
    "setTimeout(() => { console.log('SWALLOWED'); }, 3000);",
  ].join('\n'), 'utf8');
  const done = await new Promise((resolve) => {
    const child = spawn(process.execPath, [probe], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
  await rm(probe, { force: true });
  assert.match(done.out, /DISPOSED/, '끊었는데 치우지 않았다 — 워크트리가 샌다');
  /* ⛔ **신호를 삼키면 안 된다.** 삼키면 부모가 「정상 종료」로 읽는다(§3 의 친척). */
  assert.equal(done.code, 130, `SIGINT 는 130 으로 나가야 한다 (받은 값 ${done.code})`);
  console.log('✅ 끊으면 치우고, 신호를 삼키지 않는다 (exit 130)');
}

/* ── 은하 좌표가 실재하는 자리를 가리키는가 (R141).
   ⛔ 실측: 저장소를 `universe` → `universe-harness` 로 옮겼더니 **좌표가 옛 절대경로를 가리켰다.**
   관측이 빨간불을 냈고(좋다) — 그런데 그 사이 하네스가 **옛 경로에 탐침 별들을 새로 만들었다.**
   껍데기 폴더가 생겨 있었다(`SignalStar`·`CompileProbe`).
   ⚠️ 관측(`observe`)은 이미 이것을 잡는다. 여기서 다시 잡는 이유는 **더 일찍, 은하 없이도**
   잡기 위해서다 — 커밋 관문(부품 시험)은 매 커밋 돌고 관측은 라운드에서만 돈다. */
if (isUniverseSource) {
  const galaxyFiles = (await readdir(join(ROOT, 'galaxies')))
    .filter((f) => f.endsWith('.json'));
  assert.ok(galaxyFiles.length > 0, '은하 좌표를 하나도 못 찾았다 — 0은 무죄가 아니다(§8)');
  const lost = [];
  const leaky = [];
  for (const file of galaxyFiles) {
    const g = JSON.parse(await readFile(join(ROOT, 'galaxies', file), 'utf8'));
    if (typeof g.path !== 'string') { continue; }
    /* 상대 좌표는 우주 뿌리 기준 — 로더(`lib/galaxy-load.mjs`)와 **같은 규칙**으로 푼다. */
    const resolved = g.path.startsWith('/') ? g.path : join(ROOT, g.path);
    if (!existsSync(resolved)) {
      lost.push(`${file} → ${g.path}`);
    }
    /* ⚠️ R142: 저장소 **안**을 절대 경로로 가리키면 클론이 **원본**을 문다.
     * 실제로 클론에서 부품 시험을 돌렸더니 원본 픽스처의 package.json 이 고쳐졌다.
     * 안쪽을 가리키는 좌표는 반드시 상대여야 한다. */
    if (g.path.startsWith('/') && !relative(ROOT, g.path).startsWith('..')) {
      leaky.push(`${file} → ${g.path}`);
    }
  }
  assert.deepEqual(lost, [],
    `은하 좌표가 **없는 자리**를 가리킨다 — 저장소를 옮겼나: ${lost.join(' · ')}`);
  assert.deepEqual(leaky, [],
    `저장소 **안**의 은하를 절대 경로로 적었다 — 클론이 원본을 문다(R142). 상대로 적어라: ${leaky.join(' · ')}`);
  /* ── 은하가 **선언한 명령**이 그 은하에 실재하는가 (R142).
     ⛔ 실측: `galaxies/tiny-galaxy.json` 이 `npm run typecheck` 를 선언했는데 픽스처의
     package.json 에는 그 스크립트가 없었다. 컴파일 관문이 `Missing script: "typecheck"` 로
     죽었고 — **그 죽음이 「별이 은하에서 서지 않는다」로 보였다.** 별은 멀쩡했다.
     선언과 실재가 어긋나면 도구는 **엉뚱한 것을 탓한다**(§8: 못 쟀는데 판정을 냈다).
     ⚠️ `npm run <이름>` 꼴만 잰다 — `npx`·복합 셸 명령은 여기서 못 판별한다. 그렇게 적는다. */
  const NPM_RUN = /^npm (?:run )?([a-zA-Z][\w:-]*)$/;
  const missing = [];
  let declaredNpm = 0;
  for (const file of galaxyFiles) {
    const g = JSON.parse(await readFile(join(ROOT, 'galaxies', file), 'utf8'));
    if (typeof g.path !== 'string' || !g.commands) { continue; }
    const base = g.path.startsWith('/') ? g.path : join(ROOT, g.path);
    const pkgFile = join(base, 'package.json');
    if (!existsSync(pkgFile)) { continue; }
    const scripts = JSON.parse(await readFile(pkgFile, 'utf8')).scripts ?? {};
    for (const [key, command] of Object.entries(g.commands)) {
      if (typeof command !== 'string') { continue; }
      const hit = NPM_RUN.exec(command.trim());
      if (!hit) { continue; }
      declaredNpm += 1;
      /* `npm test` 는 `scripts.test` 다 — `npm run test` 와 같은 자리로 본다. */
      if (!(hit[1] in scripts)) {
        missing.push(`${file}: ${key} → ${command} (package.json 에 "${hit[1]}" 없음)`);
      }
    }
  }
  /* 분모가 없으면 이 검사는 죽은 것이다 — 0은 무죄가 아니다(§8). */
  assert.ok(declaredNpm >= 3,
    `은하가 선언한 npm 명령을 ${declaredNpm}개밖에 못 찾았다 — 검사가 죽었나(§8)`);
  assert.deepEqual(missing, [],
    `은하가 **없는 명령**을 선언했다 — 관문이 죽으면 별을 탓하게 된다: ${missing.join(' · ')}`);
  console.log(`✅ 은하가 선언한 npm 명령 ${declaredNpm}개가 전부 실재한다`);

  const relCount = galaxyFiles.length - leaky.length;
  console.log(`✅ 은하 좌표 ${galaxyFiles.length}개가 실재하는 자리를 가리킨다 (안쪽 ${relCount}개는 상대 경로)`);
}

/* ── 끊기면 반쯤 태어난 별을 남기는가 (R101).
   ⛔ 실측: 관문이 도는 중에 Ctrl-C 로 끊으면 파일 4개가 **완성된 것처럼** 남았다. 컴파일 관문도
   집안 규칙 관문도 한 번을 안 돌았는데 폴더를 열면 다 된 별로 보인다 — 「못 쟀다」가 「통과」로
   보이는 자리다(§8), 이번엔 파일 모양으로.
   ⚠️ 500ms 에 끊는다. 별 하나가 뜨는 데 ~1초다(실측) — 관문 한가운데다. */
/* ── 커밋 관문이 **켜져 있는가** (R143).
   ⛔ 실측: 저장소를 새로 `git init` 하자 `core.hooksPath` 가 사라졌고, 그 상태로 커밋 다섯 번이
   지나갔다 — **관문이 한 번도 안 돌았다.** 우주는 `universe hooks` 로 그 사실을 말할 줄 알았지만
   **묻지 않으면 말하지 않았다.** 꺼진 것을 아무도 재지 않았다(§8: 못 쟀는데 초록으로 보였다).
   ⚠️ 갓 클론한 자리에서도 이건 빨갛다 — **맞다.** 아직 안 켰으니까. 켜는 법을 실패 줄에 적는다.

   ⛔ **다만 CI 는 다르다**(R154 · CI 가 처음 잡았다). CI 는 **커밋을 하지 않는다** —
   거기서 커밋 관문이 꺼져 있는 것은 「위험한 상태」가 아니라 **잴 것이 없는 상태**다.
   그런데 빨간불을 내면 관문 25개 전체가 그 하나로 죽는다. 그것은 재는 것이 아니라 막는 것이다.
   ⇒ R58 이 소비 저장소에 세운 규율(「여기선 못 잰다」)이 이 자리에도 그대로 필요했다.
   ⚠️ 조용히 건너뛰지 않는다 — **못 쟀다고 말한다.** 안 말하면 CI 초록불이 「관문이 켜져 있다」로 읽힌다. */
if (process.env.CI && isUniverseSource) {
  console.log('⏭  커밋 관문 — **여기선 못 쟀다** (CI 는 커밋하지 않는다 · 통과가 아니다)');
} else if (isUniverseSource && existsSync(join(ROOT, '.githooks/pre-commit'))
    && existsSync(join(ROOT, '.git'))) {
  const hooksPath = await new Promise((resolve) => {
    const child = spawn('git', ['config', 'core.hooksPath'], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => resolve(out.trim()));
  });
  assert.equal(hooksPath, '.githooks',
    `커밋 관문이 꺼져 있다 (core.hooksPath=${hooksPath || '(없음)'}). `
    + '이대로면 커밋마다 관문이 **한 번도 안 돈다** — 켜라: `node bin/universe.mjs hooks --install`');
  console.log('✅ 커밋 관문이 켜져 있다 (core.hooksPath=.githooks)');
}

/* ── 픽스처 은하가 **바깥 저장소에 담겨 있는가** (R142/R143).
   ⛔ 실측: `fixtures/tiny-galaxy` 는 자체 `.git` 을 가진 중첩 저장소다(워크트리 샌드박스에 필요).
   그래서 `git add -A` 를 할 때마다 파일 17개가 **gitlink 한 줄로 접힌다** — 그러면 클론에
   픽스처가 비어 오고, 관문이 「은하가 없다」가 아니라 **엉뚱한 말**을 하며 죽는다.
   한 번 펴 놓아도 다음 `git add -A` 가 도로 접는다 — **그래서 검사로 못 박는다.**
   ⚠️ 이 검사는 「접혔다」를 잡을 뿐 **고치지는 않는다.** 고치는 법을 실패 줄에 적는다. */
if (isUniverseSource && existsSync(join(ROOT, 'fixtures/tiny-galaxy/.git'))
    && existsSync(join(ROOT, '.git'))) {
  const listed = await new Promise((resolve) => {
    const child = spawn('git', ['ls-files', 'fixtures/tiny-galaxy'], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => resolve(out.trim().split('\n').filter(Boolean)));
  });
  assert.ok(listed.length >= 10,
    `픽스처 은하가 바깥 저장소에서 **gitlink 한 줄로 접혔다**(추적 ${listed.length}개). `
    + '클론하면 빈 폴더가 온다. 펴려면 안쪽 .git 을 잠시 치우고 담아라:\n'
    + '      git rm --cached -q fixtures/tiny-galaxy\n'
    + '      mv fixtures/tiny-galaxy/.git /tmp/tg-git && git add fixtures/tiny-galaxy\n'
    + '      mv /tmp/tg-git fixtures/tiny-galaxy/.git');
  console.log(`✅ 픽스처 은하 파일 ${listed.length}개가 바깥 저장소에 담겨 있다`);
}

/* ⚠️ **엔진이 빌드돼 있어야 잰다**(R142). 갓 클론한 자리에는 엔진 **소스는 있고 빌드는 없다** —
   그러면 빅뱅이 별을 만들기 전에 「엔진을 빌드하라」로 나가고, 이 검사는 「지웠다는 말을
   안 했다」며 빨개진다. 별과 무관한 이유로 별을 탓하는 자리다. 없으면 **못 쟀다고 말한다**(§8). */
const engineBuilt = existsSync(
  join(ROOT, 'observatory/engine/packages/@core/fe-agent-harness/dist'));
if (isUniverseSource && existsSync(join(ROOT, 'fixtures/tiny-galaxy')) && engineBuilt) {
  const star = join(ROOT, 'fixtures/tiny-galaxy/src/components/shop/SignalStar');
  await rm(star, { recursive: true, force: true });
  const done = await new Promise((resolve) => {
    const child = spawn(process.execPath,
      ['bigbang/bigbang.mjs', 'new', 'tiny-galaxy', 'shop', 'SignalStar'], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    setTimeout(() => child.kill('SIGINT'), 500);
    child.on('close', (code) => resolve({ code, out }));
  });
  const left = existsSync(star);
  await rm(star, { recursive: true, force: true });
  assert.equal(left, false, '끊었는데 관문을 안 돈 별이 남았다 — 다음 사람이 다 된 별로 읽는다');
  assert.match(done.out, /관문을 한 번도 안 돈 별/, '지우면서 왜 지우는지 말하지 않았다');
  assert.equal(done.code, 130, `SIGINT 는 130 으로 나가야 한다 (받은 값 ${done.code})`);
  console.log('✅ 끊기면 반쯤 태어난 별을 남기지 않는다 (exit 130)');
} else if (isUniverseSource && !engineBuilt) {
  console.log('⏭  끊김 검사 — 엔진이 빌드되지 않았다(갓 클론한 자리). 못 쟀다.');
}

/* ── 도피구 판정 (R105).
   ⛔ 이것을 **거부 시험**으로 재려 했다가(R102) 그 시험이 「열린 라운드가 있고 관문이 빨갛다」는
   **주변 상태에 기댔다.** 라운드를 닫고 나니 「열린 라운드가 없다」로 죽으며 초록불이 됐다 —
   **다른 이유로 죽어도 통과로 보이는** 그 결함을 내가 시험에 심은 것이다. 순수 함수로 잰다. */
{
  const { forceVerdict } = await import(pathToFileURL(join(ROOT, 'lib/force.mjs')).href);
  assert.equal(forceVerdict(false, false, undefined), '닫는다', '초록이면 그냥 닫는다');
  assert.equal(forceVerdict(false, true, undefined), '닫는다', '초록인데 --force 를 캐묻지 않는다');
  assert.equal(forceVerdict(true, false, undefined), '막는다', '빨간불인데 --force 없이 닫혔다');
  /* ⛔ **막는 것이 아니라 사유를 요구한다.** 실패로 세면 사람은 흔적을 안 남기는 길을 찾는다(R64·R65). */
  assert.equal(forceVerdict(true, true, undefined), '사유를 요구한다', '사유 없이 넘어갔다');
  assert.equal(forceVerdict(true, true, '   '), '사유를 요구한다', '빈 사유가 사유로 통했다');
  assert.equal(forceVerdict(true, true, '엔진 빌드가 이 기계에서만 깨진다'), '넘어간다', '사유를 적었는데 막았다');
  console.log('✅ 도피구는 막지 않고 사유를 요구한다');
}

/* ── 거부 시험이 주변 상태에 기대는가 (R106).
   ⛔ 실측(R105): 내가 넣은 거부 시험이 「열린 라운드가 있다」를 전제해서, 라운드를 닫자
   **다른 이유로 죽으며** 빨간불이 됐다 — 세 바퀴 동안 안 보였다.
   ⚠️ 나머지 다섯은 안 기댄다(R106 에서 코드 경로로 확인). `--log` 거부는 열린 라운드 탐색보다
   **앞**에 있고, 나머지 셋은 라운드를 아예 안 읽는다.
   여기서 막는 것은 **그 실수가 다시 들어오는 것**이다: `round close` 를 `--log` 없이 부르는
   거부 시험은 그 저장소에 라운드가 열려 있어야만 옳게 죽는다. */
if (isUniverseSource) {
  const checksSrc = await readFile(join(ROOT, 'observatory/verify-checks.mjs'), 'utf8');
  const block = checksSrc.slice(checksSrc.indexOf('const REFUSALS'), checksSrc.indexOf('];', checksSrc.indexOf('const REFUSALS')));
  /* 검사와 분모가 나눠 쓰는 **하나뿐인** 훑개. */
  const REFUSAL_ENTRY = /\[\s*'([^']+)',\s*\n\s*\['node',\s*\[([^\]]*)\]/g;
  const entries = [...block.matchAll(REFUSAL_ENTRY)];
  const fragile = entries
    .filter(([, , args]) => /round\.mjs/.test(args) && /'close'/.test(args) && !/'--log'/.test(args))
    .map(([, name]) => name);
  /* ⛔ **분모를 세라(R137).** 훑개를 죽여 봤더니 **아무것도 안 빨개졌다** — R136 에서
     「다른 검사가 먼저 빨개진다」고 **재지 않고** 적었는데 틀렸다. */
  /* ⚠️⚠️ **분모는 검사와 같은 훑개를 써야 한다(R137).** 처음엔 정규식을 **두 번 적었더니**
     훑개를 죽여도 분모가 멀쩡했다 — 같은 것을 두 곳에 적으면 한쪽만 죽는다.
     ⇒ 상수 하나를 둘이 나눠 쓴다. */
  assert.ok(entries.length >= 5,
    `거부 시험을 ${entries.length}건만 봤다 — 훑개가 고장 났다(0은 무죄가 아니다 · §8)`);
  assert.deepEqual(fragile, [],
    `거부 시험이 열린 라운드에 기댄다 — 라운드가 없으면 다른 이유로 죽는다: ${fragile.join(' · ')}`);
  console.log('✅ 거부 시험이 라운드 상태에 기대지 않는다');
}

/* ── 안 재던 순수 부품 넷 (R112).
   ⛔ R08 이 실측으로 증명했다 — 엔진 규칙 11개를 덮은 지 한 시간도 안 돼 하나가 죽은 채
   커밋됐다. `lib/` 도 같은 자리다: export 29개 중 **13개를 아무도 안 부르고 있었다.** */
{
  const { toolMissing } = await import(pathToFileURL(join(ROOT, 'lib/tool.mjs')).href);
  /* ⛔ **「명령이 실패한 것」과 「명령을 못 돌린 것」은 다르다**(R69) — 못 돌린 것을 실패로
     세면 우주가 **자기가 못 잰 것을 남의 잘못으로 돌린다.** */
  assert.equal(toolMissing({ code: 127 }), true, 'exit 127 은 도구가 없는 것이다');
  assert.equal(toolMissing({ code: 'ENOENT' }), true, 'ENOENT 는 도구가 없는 것이다');
  assert.equal(toolMissing({ code: 1, stderr: 'yarn: command not found' }), true, '문구로도 가려야 한다');
  assert.equal(toolMissing({ code: 1, stderr: 'error TS2322: Type ...' }), false,
    '진짜 실패를 「도구가 없다」로 삼켰다');
  assert.equal(toolMissing(undefined), false, '아무것도 없는데 도구가 없다고 한다');

  const { isJunk } = await import(pathToFileURL(join(ROOT, 'lib/delivered.mjs')).href);
  /* ⛔ Finder 부스러기가 배달돼 「배달본이 낡았다」 헛경보를 냈다(R91). */
  assert.equal(isJunk('.DS_Store'), true, 'OS 부스러기를 배달한다');
  assert.equal(isJunk('lib'), false, '진짜 폴더를 부스러기로 본다');

  const { sourceOf } = await import(pathToFileURL(join(ROOT, 'lib/nebula-close.mjs')).href);
  assert.equal(sourceOf('| 무엇이 | R89 변경 정직성 **미흡** | 왜 |'), 'R89 변경 정직성',
    '성운 줄의 출처를 못 읽는다');
  /* ⛔ **없는 것도 말해야 한다** — 출처 없는 줄은 나이를 못 잰다(R98). */
  assert.equal(sourceOf('| 출처가 없는 줄 | 미측정 | 왜 |'), null, '없는 출처를 있다고 한다');

  const { loadGalaxy, resolveGalaxyPath } = await import(pathToFileURL(join(ROOT, 'lib/galaxy-load.mjs')).href);

  /* ── 좌표 해석 (R143).
     ⛔ 실측: 상대 좌표를 **직접 읽는 자리들**(verify·observe·learn·light-speed·lint-drift)이
     한 번 더 붙여 `fixtures/x/fixtures/x/.harness/` 에 lint 산출을 쌓았다. 게이트는 거기에 쓰고
     귀속은 은하 폴더의 **묵은 파일**을 읽어 「별의 폴더 안에는 error 가 없다 · 근거: 원본 산출」
     이라 확신했다 — 같은 실행이 「별이 error 15건」이라 말하는 동안. */
  assert.equal(resolveGalaxyPath('/u', { path: 'fixtures/x' }).path, '/u/fixtures/x',
    '상대 좌표를 우주 뿌리 기준으로 못 푼다');
  assert.equal(resolveGalaxyPath('/u', { path: '/abs/x' }).path, '/abs/x',
    '절대 좌표를 건드렸다 — 남의 저장소를 가리키는 좌표는 그대로 둬야 한다');
  assert.equal(resolveGalaxyPath('/u', { path: '/u/fixtures/x' }).path, '/u/fixtures/x',
    '이미 절대인 좌표에 한 번 더 붙였다 — 이것이 두 번 붙은 그 버그다');
  assert.deepEqual(resolveGalaxyPath('/u', { name: 'x' }), { name: 'x' },
    'path 가 없는 좌표에서 터진다');
  /* 같은 객체를 되돌려 주면 부르는 쪽이 원본을 고친 줄 안다 — 새 객체여야 한다. */
  const source = { path: 'fixtures/x', name: 'x' };
  assert.notEqual(resolveGalaxyPath('/u', source), source, '원본 객체를 그대로 돌려준다');
  assert.equal(source.path, 'fixtures/x', '원본 객체를 고쳤다');
  /* ── 로컬 명부가 커밋본보다 **먼저**인가 (R152).
     ⚠️ 그 기계에만 있는 은하는 `galaxies.local/`(gitignore)에 산다. 커밋본이 이기면
     로컬 좌표가 **영영 안 읽히고**, 사람은 은하를 등록했는데 왜 안 도는지 모른다. */
  const { GALAXY_DIRS, findGalaxyFile } = await import(pathToFileURL(join(ROOT, 'lib/galaxy-load.mjs')).href);
  assert.deepEqual(GALAXY_DIRS, ['galaxies.local', 'galaxies'], '로컬 명부가 먼저가 아니다');
  /* 커밋본에만 있는 픽스처는 커밋본에서 찾는다.
     ⚠️ **우주 자신의 저장소에서만** 잰다 — 은하는 배달되지 않는다(보존 법칙). 배달본엔 `galaxies/` 가
     아예 없어서, 안 가리면 「없다」가 가짜 빨간불이 된다(beacon/pages.json 에서 이미 한 번 밟았다). */
  if (isUniverseSource) {
    const fixtureFile = await findGalaxyFile(ROOT, 'tiny-galaxy');
    assert.ok(fixtureFile && fixtureFile.endsWith('galaxies/tiny-galaxy.json'), `픽스처를 못 찾는다: ${fixtureFile}`);
  }
  /* 없는 은하는 **null** 이다 — 없는 자리를 지어내면 부르는 쪽이 「있다」로 읽는다(§8). */
  assert.equal(await findGalaxyFile(ROOT, '없는은하-probe'), null, '없는 은하에 자리를 지어냈다');
  console.log('✅ 은하 명부 — 로컬이 먼저고, 없는 것은 없다고 한다');

  console.log('✅ 좌표 해석 — 상대는 풀고 절대는 그대로 두고 원본은 안 고친다');

  /* ── 좌표를 **직접 읽는 자리**가 해석을 거치는가 (R143).
     R142 에서 「입구는 loadGalaxy 하나」라고 적었는데 **틀렸다** — 다섯 자리가 JSON 을 직접 읽었다.
     열거는 열거 밖을 못 본다(§9). 그래서 이름을 세지 않고 **파일을 훑어** 찾는다.
     ⚠️ `galaxies/<이름>.json` 을 읽으면서 `loadGalaxy` 도 `resolveGalaxyPath` 도 안 쓰는 파일을 문다. */
  if (isUniverseSource) {
    /**
     * 좌표를 **일부러 안 푸는** 자리 — 사유를 적어야 뺀다(R152).
     * ⚠️ 여기 이름을 올리는 것은 「이 파일은 봐준다」가 아니라 **「푸는 것이 틀린 이유가 있다」**다.
     */
    const RAW_COORD_READERS = {
      'observatory/verify-coordinates.mjs':
        '⛔ **푸는 순간 검사가 죽는다.** 이 검사가 보는 것은 「`path` 가 절대 경로인가」인데, '
        + '`resolveGalaxyPath` 는 상대 경로를 **절대로 바꿔 준다** — 그러면 픽스처까지 전부 절대가 되어 '
        + '모든 은하가 빨간불이 되거나(또는 규칙을 뒤집으면 아무것도 안 걸린다). 날것을 봐야 하는 유일한 자리다',
    };
    const READS_COORD = /galaxies['"`\s,)\]]*[^\n]*\.json/;
    const suspects = [];
    let scanned = 0;
    for (const dir of ['observatory', 'lib', 'bin', 'bigbang', 'scripts']) {
      const base = join(ROOT, dir);
      if (!existsSync(base)) { continue; }
      for (const entry of await readdir(base, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.mjs')) { continue; }
        const file = join(base, entry.name);
        const text = await readFile(file, 'utf8');
        scanned += 1;
        if (!READS_COORD.test(text)) { continue; }
        if (text.includes('resolveGalaxyPath') || text.includes('loadGalaxy')) { continue; }
        /* `.path` 를 안 쓰면 좌표 위치를 안 쓰는 것이다 — 목록만 읽는 자리는 무죄다. */
        if (!/\.path\b/.test(text)) { continue; }
        /* ⛔ **사유 없이는 못 뺀다**(`NOT_GATED` 와 같은 형태). 푸는 것이 **틀린** 자리가 있다. */
        if (RAW_COORD_READERS[`${dir}/${entry.name}`]) { continue; }
        suspects.push(`${dir}/${entry.name}`);
      }
    }
    assert.ok(scanned > 15, `.mjs 를 ${scanned}개밖에 못 훑었다 — 검사가 죽었나(§8)`);
    /* 예외가 **낡지 않게** 한다 — 파일이 사라졌는데 사유만 남으면 다음 사람이 그것을 믿는다. */
    for (const [file, reason] of Object.entries(RAW_COORD_READERS)) {
      assert.ok(existsSync(join(ROOT, file)), `좌표 예외 명부가 낡았다 — 없는 파일: ${file}`);
      assert.ok(typeof reason === 'string' && reason.length > 30, `좌표 예외에 사유가 없다: ${file}`);
    }
    assert.deepEqual(suspects, [],
      '은하 좌표를 직접 읽으면서 `resolveGalaxyPath` 를 안 거친다 — 상대 좌표가 **한 번 더 붙는다**: '
      + suspects.join(' · '));
    console.log(`✅ 좌표를 읽는 자리가 전부 해석을 거친다 (.mjs ${scanned}개를 훑었다)`);

    /* ── 좌표를 **되쓰는** 자리가 원본 형태를 지키는가 (R144).
       ⛔ 실측: `observe --update` 가 읽을 때 푼 절대 경로를 그대로 저장해, 저장소 안의 은하가
       **절대 경로로 되돌아갔다.** R142·R143 의 작업이 `--update` 한 번에 조용히 무효가 됐다.
       ⚠️ 되쓰는 자리는 지금 하나뿐이다 — 늘면 이 검사가 못 본다. 그래서 **개수도 함께 잰다.** */
    /* ⚠️ 처음엔 `observe.mjs` 한 곳만 봤는데 **되쓰는 자리는 셋이었다**(observe·lint-drift·
       light-speed) — 셋 다 같은 방식으로 틀렸다. 이름을 열거하지 말고 **좌표 파일에 쓰는 자리**를
       훑어 `saveGalaxy` 를 안 거치는 곳을 찾는다(§9: 열거는 열거 밖을 못 본다). */
    const WRITES_COORD = /writeFile\((?:file|galaxyFile)\b/;
    const rawWriters = [];
    let writerScanned = 0;
    for (const dir of ['observatory', 'lib', 'bin', 'bigbang']) {
      const base = join(ROOT, dir);
      if (!existsSync(base)) { continue; }
      for (const entry of await readdir(base, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.mjs')) { continue; }
        const text = await readFile(join(base, entry.name), 'utf8');
        writerScanned += 1;
        /* `saveGalaxy` 를 정의한 파일 자신은 예외다 — 실제로 쓰는 곳이 여기다. */
        /* `saveGalaxy` 를 정의한 파일과 **이 시험 자신**은 뺀다 — 둘 다 그 꼴을 문자열로 들고
           있을 뿐 좌표를 되쓰지 않는다. ⚠️ 빼는 것이 늘면 검사가 눈멀므로 **둘로 못 박는다**. */
        const EXEMPT = ['galaxy-load.mjs', 'selftest.mjs'];
        if (EXEMPT.includes(entry.name)) { continue; }
        /* ⚠️ 변수 이름만 보면 **오탐한다** — `round.mjs` 도 `writeFile(file, ...)` 로 라운드
           로그를 쓴다(실측). 좌표를 **읽지도 않는** 파일은 좌표를 되쓸 수 없다. 둘 다 봐야 한다. */
        if (!READS_COORD.test(text)) { continue; }
        if (WRITES_COORD.test(text)) { rawWriters.push(`${dir}/${entry.name}`); }
      }
    }
    assert.ok(writerScanned > 15, `.mjs 를 ${writerScanned}개밖에 못 훑었다 — 검사가 죽었나(§8)`);
    assert.deepEqual(rawWriters, [],
      '좌표를 `saveGalaxy` 없이 직접 되쓴다 — 상대 좌표가 절대로 되돌아간다(R142 가 무효가 된다): '
      + rawWriters.join(' · '));
    console.log(`✅ 좌표를 되쓰는 자리가 전부 saveGalaxy 를 거친다 (.mjs ${writerScanned}개)`);
  }

  /* ⛔ **「없는 것」과 「못 읽은 것」은 다른 말이다**(R90) — 틀린 이유를 대는 것이
     이유를 안 대는 것보다 오래 헤매게 한다. */
  const missing = await loadGalaxy(ROOT, '없는은하-부품시험', ['tiny-galaxy']);
  assert.match(missing.problem ?? '', /없는 은하/, '없는 은하를 다른 말로 한다');
  /* ⚠️ **배달본에는 픽스처 은하가 없다** — 소비 저장소의 `galaxies/` 는 빈 틀이다(실측:
     이 단언이 배달 관문을 빨갛게 했다). 「없는 것」 쪽은 어디서나 재고, 「있는 것」 쪽은
     우주 소스에서만 잰다. R92 에서 같은 교훈을 얻고도 또 했다. */
  if (isUniverseSource) {
    const real = await loadGalaxy(ROOT, 'tiny-galaxy', []);
    assert.equal(real.galaxy?.name, 'tiny-galaxy', '있는 은하를 못 읽는다');
  }
  console.log('✅ 안 재던 부품 넷 — 도구 없음·부스러기·성운 출처·좌표 읽기');
}

/* ── 시험 없는 부품은 깨져도 모른다 (R112).
   ⛔ **가정이 아니라 실측이다** — R08 이 엔진 규칙 11개를 덮은 지 한 시간도 안 돼
   `a11y/img-alt` 가 죽은 채 커밋됐다. 그래서 「안 잰 부품 0개」가 아니라
   **「판단하지 않은 안 잰 부품 0개」**를 센다. */
const NOT_TESTED = {
  /* 환경에 기대는 것 — 파일시스템·설정을 읽는다. 모든 명령이 매번 부르므로 깨지면 즉시 안다. */
  'home.mjs findUniverseHome': '우주의 집을 파일시스템에서 찾는다 — 모든 명령이 매번 부른다. 깨지면 첫 명령에서 바로 죽는다',
  'home.mjs requireUniverseHome': '위의 얇은 껍데기(못 찾으면 죽는다). 배달 관문이 갓 깐 우주에서 실제로 부른다',
  'home.mjs resolveEngine': '엔진 경로를 config 에서 푼다 — 배달 관문과 모든 관측이 부른다',
  'home.mjs requireUniverseSource': '얇은 껍데기다. **판정은 `universeSourceProblem` 이 하고 그것은 잰다**(R91)',
  'home.mjs packageHome': '상수(패키지 경로). 함수가 아니다',
  'home.mjs seedHome': '상수(씨앗 경로). 함수가 아니다',
  'engine.mjs openEngine': '엔진 dist 를 불러온다 — 관측·빅뱅이 매번 부르고, 없으면 사유를 대고 죽는 것을 배달 관문이 잰다',
  'engine.mjs ENGINE_DIST': '상수(엔진 배치표). **한 자리인가**는 부품 시험이 따로 잰다(R47)',
  'delivered.mjs NOT_DELIVERED': '상수(부스러기 목록). 쓰는 쪽 `isJunk` 를 잰다',
};
if (isUniverseSource) {
  const testSrc = await readFile(join(ROOT, 'lib/selftest.mjs'), 'utf8');
  const untested = [];
  let exportsSeen = 0;
  for (const file of (await readdir(join(ROOT, 'lib'))).sort()) {
    if (!file.endsWith('.mjs') || file === 'selftest.mjs') {
      continue;
    }
    const src = await readFile(join(ROOT, 'lib', file), 'utf8');
    for (const m of src.matchAll(/^export const (\w+)/gm)) {
      exportsSeen += 1;
      const key = `${file} ${m[1]}`;
      /* ⚠️ **이름이 시험에 나오는 것**을 「잰다」로 본다 — 느슨하다. 부르기만 하고 단언이
         없으면 통과한다. 그래도 **아무도 안 부르는 것**은 확실히 걸러진다. */
      if (new RegExp(`\\b${m[1]}\\b`).test(testSrc.replace(/NOT_TESTED[\s\S]*?\n};/, ''))) {
        continue;
      }
      if (NOT_TESTED[key]) {
        continue;
      }
      untested.push(key);
    }
  }
  /* ⛔ **분모를 세라(R137).** 훑개가 죽으면 「부품이 하나도 없다」가 「전부 재고 있다」로 보인다. */
  assert.ok(exportsSeen > 20,
    `lib 의 export 를 ${exportsSeen}개만 봤다 — 훑개가 고장 났다(§8)`);
  assert.deepEqual(untested, [],
    `시험도 없고 사유도 없는 부품 — 깨져도 모른다: ${untested.join(' · ')}`);
  console.log(`✅ lib 의 export 가 전부 재지거나 사유가 있다 (사유를 적고 뺀 것 ${Object.keys(NOT_TESTED).length}개)`);
}

/* ── 판올림이 새 법칙을 잇는가 (R119). */
{
  const { mergeLaws } = await import(pathToFileURL(join(ROOT, 'lib/laws-merge.mjs')).href);
  const r = mergeLaws(['tokens', 'naming'], ['tokens', 'naming', 'derivation']);
  assert.deepEqual(r.added, ['derivation'], '새 법칙을 안 이었다 — 소비 저장소가 빨간불을 받는다');
  assert.deepEqual(r.laws, ['tokens', 'naming', 'derivation'], '순서를 흔들었다');
  /* ⛔ **이미 있는 것을 또 넣으면 안 된다** — 두 번 판올림하면 목록이 부푼다. */
  assert.deepEqual(mergeLaws(['tokens'], ['tokens']).added, [], '있는 것을 또 이었다');
  /* ⚠️ 패키지가 **뺀** 법칙을 팀에서 지우지 않는다 — 팀의 것이다. */
  assert.deepEqual(mergeLaws(['tokens', '팀만의법칙'], ['tokens']).laws, ['tokens', '팀만의법칙'],
    '팀의 법칙을 지웠다');
  /* ⛔ **법칙만 이으면 궤도·힘에 같은 구멍이 남는다(R120).** 관문은 셋을 똑같이 본다 —
     추측이 아니라 `verify-laws.sh` 를 읽어 확인했다. */
  const { mergeCatalogues, CATALOGUE_FIELDS } = await import(pathToFileURL(join(ROOT, 'lib/laws-merge.mjs')).href);
  assert.deepEqual(CATALOGUE_FIELDS, ['laws', 'forces', 'orbits'],
    '목록이 있는 칸이 바뀌었다 — 관문이 보는 것과 맞춰라');
  const cat = mergeCatalogues(
    { laws: ['tokens'], forces: [], orbits: ['round'], galaxies: ['우리은하'] },
    { laws: ['tokens', 'derivation'], forces: ['새힘'], orbits: ['round'], galaxies: [] },
  );
  assert.deepEqual(cat.added, { laws: ['derivation'], forces: ['새힘'] },
    '궤도·힘의 새 항목을 안 이었다(또는 안 바뀐 칸을 이었다고 한다)');
  /* ⚠️ **은하는 팀이 등록하는 것**이지 패키지가 주는 것이 아니다 — 건드리면 안 된다. */
  assert.deepEqual(cat.config.galaxies, ['우리은하'], '팀의 은하 목록을 건드렸다');
  console.log('✅ 판올림이 법칙·힘·궤도를 잇고 은하와 팀의 것은 안 건드린다');
}

/* ── 사용자에게 보이는 문구에 **손으로 적은 시간**이 있는가 (R124).
   ⛔ 두 번 낡았다 — 훅 소개가 「약 1.5초」였는데 실측 2.8초였고(R118·R123), 한 자리를
   고칠 때 **같은 수가 다른 자리에도** 있었다.
   ⚠️ **주석과 문서는 안 본다.** 거기 적힌 수는 「그때 이랬다」는 기록이고 라운드 번호가 붙는다 —
   낡는 것이 아니라 **역사**다. 위험한 것은 **지금 그렇다고 말하는 문구**다.
   ⚠️ 잰 값을 찍는 것은 괜찮다(`${seconds}초`) — 리터럴 숫자가 아니다. */
if (isUniverseSource) {
  const roots = ['bin', 'lib', 'observatory', 'beacon', 'bigbang'];
  const walk = async (dir) => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'engine') {
        continue;
      }
      const p = join(dir, e.name);
      out.push(...(e.isDirectory() ? await walk(p) : /\.(mjs|sh)$/.test(p) ? [p] : []));
    }
    return out;
  };
  const spoken = [];
  let literalsSeen = 0;
  for (const dir of roots) {
    for (const f of await walk(join(ROOT, dir))) {
      const text = await readFile(f, 'utf8');
      /* ⛔ **문구의 「모양」을 열거하면 놓친다(§9).** 처음엔 `console.log|label:|what:` 만 봤는데,
         R123 을 일으킨 그 줄은 **배열 리터럴**(`['.githooks', '… (약 1.5초)']`)이라 안 걸렸다.
         모양이 아니라 **주석을 걷고 남은 문자열**을 본다. */
      const stripped = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*(\/\/|#).*$/gm, '');
      stripped.split('\n').forEach((line, i) => {
        const literals = [...line.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)]
          .map((m) => m[1] ?? m[2] ?? m[3]);
        /* ⛔ **`\b` 를 쓰면 한글 뒤에서 절대 안 맞는다(R124).** `초)` 는 양쪽 다 비단어라
           경계가 없다 — 이 검사가 **두 판본 내내 죽어 있었고**, 되돌린 낡은 수를 못 잡았다.
           안 물었을 때 검사가 아니라 **변이부터 의심**했더니 변이는 멀쩡했다. */
        literalsSeen += literals.length;
        if (literals.some((s) => /[0-9]+(\.[0-9]+)?\s*(?:초|ms)(?![\w가-힣])/.test(s))) {
          spoken.push(`${f.replace(`${ROOT}/`, '')}:${i + 1}`);
        }
      });
    }
  }
  /* ⛔ **분모를 세라(R136).** 이 검사는 훑개가 좁아지면 **0을 무죄로** 읽는다 — 이 세션에서
     정규식이 조용히 죽은 것이 네 번이고(R89·R92·R124·R135) 넷 다 그 모양이었다.
     문자열 리터럴을 하나도 못 봤으면 **훑개가 고장 난 것**이다. */
  assert.ok(literalsSeen > 50,
    `문자열 리터럴을 ${literalsSeen}개만 봤다 — 훑개가 고장 났다(0은 무죄가 아니다 · §8)`);
  assert.deepEqual(spoken, [],
    `사람에게 보이는 문구에 손으로 적은 시간이 있다 — 재서 찍어라: ${spoken.join(' · ')}`);
  console.log('✅ 사람에게 보이는 문구에 손으로 적은 시간이 없다');
}

/* ── 「은하가 안 선다」를 「못 쟀다」와 가르는가 (R149).
   ⚠️⚠️ R146 이 신호를 셋으로 갈랐는데(✅ 잰 초록 · ❌ 잰 빨강 · ⚪ 못 쟀다) R148 에서 넷째가 나왔다 —
   **은하가 아예 안 서는 경우**다. `NODE_AUTH_TOKEN` 이 없으면 yarn 이 어떤 명령도 안 돌아
   게이트가 전부 깨진 채 빨간불을 낸다. 그 상태로 3차를 태우면 **모델을 턴 수만큼 부르고**
   에이전트가 못 고치는 것을 고치려 든다 — 「못 쟀다」는 정직하지만 **너무 늦다.** */
{
  const { missingEnv, cannotStandMessage } = await import(pathToFileURL(join(ROOT, 'lib/required-env.mjs')).href);
  assert.deepEqual(missingEnv({ requiredEnv: ['A_KEY'] }, {}), ['A_KEY'], '없는 변수를 못 잡는다');
  /* ⛔ 빈 문자열도 **없는 것**이다 — `FOO=` 로 두고 「넣었다」고 하는 자리가 실제로 있다. */
  assert.deepEqual(missingEnv({ requiredEnv: ['A_KEY'] }, { A_KEY: '' }), ['A_KEY'], '빈 값을 「있다」로 센다');
  assert.deepEqual(missingEnv({ requiredEnv: ['A_KEY'] }, { A_KEY: 'x' }), [], '있는데 없다고 한다 — 거짓 차단이다');
  /* ⛔ **옵트인이다.** 선언 안 한 은하에서 이 검사가 뭔가를 막으면 기존 은하가 전부 죽는다. */
  assert.deepEqual(missingEnv({}, {}), [], '선언 안 한 은하를 막는다 — 옵트인이 아니게 된다');
  assert.deepEqual(missingEnv({ requiredEnv: 'NOT_AN_ARRAY' }, {}), [], '배열이 아닌 선언에 죽는다');
  /* 사람에게 「무엇을 해야 하는가」까지 말해야 한다 — 「없다」만 말하면 은하가 깨진 줄 안다(R58). */
  const said = cannotStandMessage('some-galaxy', ['A_KEY']);
  assert.match(said, /서지 않는다/, '판정을 안 말한다');
  assert.match(said, /「못 쟀다」가 아니다/, '「못 쟀다」와 갈라 주지 않으면 넷째 칸을 만든 뜻이 없다');
  /* ⛔ 값을 화면에 적으면 안 된다 — 비밀이 로그로 샌다. */
  assert.ok(!cannotStandMessage('g', ['A_KEY']).includes('sk-'), '값을 적을 여지가 있다');
  console.log('✅ 「은하가 안 선다」를 「못 쟀다」와 가른다 (옵트인 · 값은 안 읽는다)');
}

/* ── MIT 로 공개한다면 **그 조건을 실제로 지키는가** (R150).
   ⚠️ MIT 는 「이 고지를 사본에 포함하라」가 유일한 조건이다. LICENSE 를 저장소에만 두고
   `files` 에 안 넣으면 **배달본에는 안 실린다** — 조건을 어긴 채 배포된다.
   ⛔ 그리고 라이선스를 바꾼다고 **출처가 사라지지 않는다.** EnvHarness(Apache 2.0)·
   카카시(MIT)는 코드를 가져오진 않았지만 설계를 채택했고, 그 고지는 유지한다. */
if (isUniverseSource) {
  const license = await readFile(join(ROOT, 'LICENSE'), 'utf8').catch(() => '');
  assert.match(license, /MIT License/, 'LICENSE 파일이 없거나 MIT 가 아니다');
  assert.match(license, /Copyright \(c\) \d{4}/, '저작권자 줄이 없다 — MIT 는 이 고지가 조건이다');
  assert.equal(pkg.license, 'MIT', `package.json 의 license 가 ${pkg.license} 다 — LICENSE 파일과 갈렸다`);
  /**
   * ⛔ **뿌리의 의존성은 0이다.** 우주는 Node 내장만 쓴다.
   *
   * ⚠️ 이 문장을 **근거 없이 말한 적이 있다** — 「문서가 강점으로 적어 뒀고 관문이 지킨다」고
   * `bin/menu.mjs` 주석에 적고 다른 세션에도 그렇게 말했는데, 비어 있는 것만 사실이고
   * **문서에도 관문에도 그런 자리가 없었다.** 짐작이 근거 행세를 한 것이다.
   * ⇒ 무르는 대신 **여기서 잰다.** 이제 그 말은 참이다.
   *
   * ⚠️ 우주 **안에 벤더링된 은하**(`fixtures/` 같은 것)는 자기 `package.json` 을 갖는다 —
   *    그건 은하의 것이지 우주의 것이 아니다. 여기서 재는 것은 **뿌리 하나**다.
   */
  for (const field of ['dependencies', 'devDependencies']) {
    assert.deepEqual(Object.keys(pkg[field] ?? {}), [],
      `뿌리 package.json 의 ${field} 가 비어 있지 않다 — 우주는 Node 내장만 쓴다. `
      + '벤더링된 은하가 필요한 것이면 **그 은하의 package.json** 에 넣어라');
  }
  console.log('✅ 뿌리 의존성 0 — 우주는 Node 내장만 쓴다 (벤더링된 은하는 자기 것을 갖는다)');
  assert.ok(!('private' in pkg), 'package.json 이 여전히 private 다 — 공개하겠다는 결정과 어긋난다');
  /* ⛔ 배달본에 안 실리면 MIT 조건을 못 지킨다. */
  assert.ok((pkg.files ?? []).includes('LICENSE'),
    'LICENSE 가 package.json 의 files 에 없다 — 배달본에 안 실려 MIT 조건을 어긴다');
  /* ⛔ 출처 고지는 라이선스와 별개다 — 지우면 채택한 것을 안 밝히는 것이 된다. */
  const credits = await readFile(join(ROOT, 'docs/06-credits.md'), 'utf8').catch(() => '');
  assert.match(credits, /Apache 2\.0/, '출처 고지에서 EnvHarness 의 라이선스가 사라졌다');
  assert.match(credits, /카카시/, '출처 고지에서 카카시 하네스가 사라졌다');
  console.log('✅ MIT 조건을 지킨다 (LICENSE 가 배달본에 실리고 출처 고지가 살아 있다)');
}

/* ── 위키 주소를 **좌표로 안 적고 origin 에서 뽑는가** (R151).
   ⚠️⚠️ 예전엔 사이트·스페이스 키·페이지 id 일곱이 **커밋돼 있었다.** 받은 사람에겐 못 쓰는
   좌표고 공개 저장소엔 있어선 안 되는 좌표다(사용자 결정: clone 도 깨끗해야 한다). */
{
  const { wikiRemoteOf, wikiFileNameOf } = await import(pathToFileURL(join(ROOT, 'lib/wiki-remote.mjs')).href);
  /* ⛔ 위키 파일 이름은 **슬러그 그대로**다. 제목으로 바꾸면 한글이 URL 에서 깨지고,
     제목이 바뀔 때마다 빈 페이지가 쌓인다(Confluence 에서 id 를 들고 다닌 이유와 같은 문제). */
  assert.equal(wikiFileNameOf('laws'), 'laws.md');
  assert.equal(wikiFileNameOf('nebula'), 'nebula.md');
  assert.equal(wikiRemoteOf('https://github.com/o/r.git')?.url, 'https://github.com/o/r.wiki.git');
  assert.equal(wikiRemoteOf('git@github.com:o/r.git')?.url, 'https://github.com/o/r.wiki.git', 'ssh 짧은 형식을 못 편다');
  /* ⛔ **모르는 호스트에 주소를 지어내지 않는다**(§9 · 「명령을 지어내지 않는다」와 같은 규율). */
  assert.equal(wikiRemoteOf('https://gitlab.com/o/r.git'), null, 'GitLab 위키 주소를 지어냈다');
  assert.equal(wikiRemoteOf(''), null, '빈 origin 에 주소를 지어냈다');
  /* ⛔ 자격증명이 박힌 origin 을 그대로 물려주면 **토큰이 화면과 로그에 찍힌다.** */
  const withToken = wikiRemoteOf('https://user:ghp_secret@github.com/o/r.git');
  assert.ok(withToken && !withToken.url.includes('ghp_secret'), '자격증명이 위키 주소로 새어 나간다');
  /* ⛔ 커밋된 좌표 파일에 사내 좌표가 남아 있으면 안 된다.
     ⚠️ **우주 자신의 저장소에서만** 잰다 — `beacon/pages.json` 은 배달 목록에 없어서
     배달본에는 아예 없다. 없는 파일을 읽고 죽으면 「좌표가 샌다」가 아니라 **가짜 빨간불**이다. */
  if (isUniverseSource) {
    /* ⛔ **검사가 진짜 좌표를 들고 있으면 안 된다.** 처음엔 스페이스 키를 그대로 적었는데,
       그러면 좌표를 지우려고 만든 검사가 **좌표를 다시 커밋한다.** 구조로 잰다 —
       호스트 모양과 필드 이름은 사람이 정하는 이름이 아니라 **도구가 정한 이름**이다(§9 의 예외). */
    const committed = await readFile(join(ROOT, 'beacon/pages.json'), 'utf8');
    for (const [pattern, what] of [
      [/[\w-]+\.atlassian\.net/, 'Confluence 사이트 주소'],
      [/"spaceKey"/, '스페이스 키'],
      [/"id"\s*:\s*"?\d{6,}/, '페이지 id'],
    ]) {
      assert.ok(!pattern.test(committed), `beacon/pages.json 에 좌표가 남았다 — ${what}`);
    }
  }
  console.log('✅ 위키 주소를 origin 에서 뽑는다 (좌표를 안 적고 · 모르는 호스트엔 안 지어낸다)');
}

/* ── OpenRouter 레인 — 구독이 없는 사람의 길 (R153).
   ⚠️ 진짜 호출은 **한 번도 안 한다**(0원). 가짜 `fetch` 로 계약만 잰다:
   이력을 나르는가 · 비용을 추정하지 않는가 · 빈 답을 성공으로 세지 않는가. */
{
  const { createGatewayAsk, GATEWAY_LANES, gatewayOf } =
    await import(pathToFileURL(join(ROOT, 'bigbang/agent-gateway.mjs')).href);
  /* 사용자가 말한 것은 **OmniRoute** 였는데 내가 OpenRouter 로 읽고 만들었다 —
     둘은 다른 제품이고 규약만 같다. 둘 다 태우되 **주소·키·모델은 갈라 둔다**. */
  assert.deepEqual(GATEWAY_LANES, ['openrouter', 'omniroute'], '게이트웨이 둘을 다 아는가');
  assert.equal(gatewayOf('openrouter').env, 'OPENROUTER_API_KEY');
  assert.equal(gatewayOf('omniroute').env, 'OMNIROUTE_API_KEY');
  assert.match(gatewayOf('openrouter').model, /^anthropic\//, '구독 별칭(sonnet)은 여기서 안 통한다 — 슬러그여야 한다');
  /* ⛔ **직접 띄우는 게이트웨이의 모델을 지어내지 않는다** — 붙은 provider 가 사람마다 다르다.
     우리가 고르면 **엉뚱한 provider 로 청구**된다. */
  assert.equal(gatewayOf('omniroute').model, null, 'omniroute 모델을 지어냈다 — 엉뚱한 곳으로 청구된다');
  /* ⛔ 모르는 이름에 주소를 지어내지 않는다(§9 · 「명령을 지어내지 않는다」와 같은 규율). */
  assert.equal(gatewayOf('anthropic'), null, '모르는 레인에 주소를 지어냈다');
  const createOpenRouterAsk = (o) => createGatewayAsk({ ...o, baseUrl: gatewayOf('openrouter').baseUrl });

  const sent = [];
  const fakeFetch = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: `답${sent.length}` } }], usage: { cost: 0.0012 } }),
    };
  };
  const ask = createOpenRouterAsk({ model: 'm', apiKey: 'k', systemPrompt: '시스템', fetchImpl: fakeFetch });

  const first = await ask({ input: '하나', sessionId: null });
  assert.equal(first.text, '답1');
  /* ⛔ **비용을 추정하지 않는다** — 보고된 값을 그대로 나른다(claudeCli 와 같은 규율). */
  assert.equal(first.costUsd, 0.0012, '보고된 비용을 안 나른다');

  /* ⚠️ OpenRouter 는 **무상태**다. CLI 의 `--resume` 자리를 우리가 들어야 한다 —
     안 나르면 에이전트가 매 턴 기억을 잃고 같은 patch 를 다시 낸다. */
  const second = await ask({ input: '둘', sessionId: first.sessionId });
  const roles = sent[1].messages.map((m) => m.role);
  assert.deepEqual(roles, ['system', 'user', 'assistant', 'user'], `이력을 안 나른다: ${roles.join(',')}`);
  assert.equal(second.sessionId, first.sessionId, '세션이 바뀌었다 — 이력이 갈린다');
  /* ⛔ 도구를 안 넘긴다 — CLI 는 꺼야 했지만 여기는 애초에 없어야 한다. */
  assert.ok(!('tools' in sent[0]), '도구를 넘겼다 — 에이전트가 저장소를 훔쳐볼 수 있게 된다');
  assert.equal(sent[0].usage?.include, true, 'usage.include 를 안 켜면 비용이 안 온다 — 그러면 추정하게 된다');

  /* ⛔ **빈 답을 성공으로 세지 않는다** — claudeCli 가 빈 stdout 으로 당한 자리다. */
  const emptyAsk = createOpenRouterAsk({
    model: 'm', apiKey: 'k', systemPrompt: 's',
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }) }),
  });
  const empty = await emptyAsk({ input: 'x', sessionId: null });
  assert.ok(empty.isError, '빈 답을 통과로 셌다');
  assert.equal(empty.costUsd, null, '못 받았는데 비용을 지어냈다');

  /* 실패 응답도 신호로 돌려준다 — 던지면 9분짜리 게이트가 통째로 날아간다(R145 이전의 그 자리). */
  const badAsk = createOpenRouterAsk({
    model: 'm', apiKey: 'k', systemPrompt: 's',
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'no credit' }),
  });
  const bad = await badAsk({ input: 'x', sessionId: null });
  assert.ok(bad.isError && /401/.test(bad.failure), '실패를 신호로 안 바꾼다');
  console.log('✅ 게이트웨이 레인(openrouter · omniroute) — 이력을 나르고 · 비용/모델을 안 지어낸다');
}

/* ── ⛔ 레인은 **자동으로 안 갈아탄다** (R153).
   R145 가 못 박은 것이 「모드가 바뀌는데 아무도 안 잰다」였다. `claude` 가 없다고 과금 레인으로
   몰래 넘어가면 그 사고가 그대로 되풀이된다 — 소스에 그 갈래가 **없어야** 한다. */
if (isUniverseSource) {
  const src = await readFile(join(ROOT, 'bigbang/bigbang.mjs'), 'utf8');
  assert.match(src, /const laneName = flag\('--lane'\)/, '레인을 사람이 고르는 자리가 없다');
  /* 기본은 구독이거나 대본이다 — openrouter 가 기본이 되는 갈래가 있으면 안 된다. */
  for (const lane of ['openrouter', 'omniroute']) {
    assert.ok(!new RegExp(`\\?\\?\\s*'${lane}'`).test(src), `${lane} 가 기본값이 되는 갈래가 있다 — 사람이 안 골랐는데 과금된다`);
  }
  /* 레인 검증이 **별을 쓰기 전**이어야 한다 — 뒤면 「멈춘다」고 말해 놓고 별을 남긴다(실측으로 밟았다). */
  /**
   * ⚠️⚠️ **같은 실수를 두 번 했다**(R153 레인 · R155 턴 예산). 「거절한다」고 말해 놓고
   * 별을 남기는 자리다 — 입력 검증은 **전부** 별보다 앞이어야 한다.
   *
   * ⛔ 그리고 이 시험을 처음 쓸 때 **시험 자체가 죽어 있었다**: `indexOf` 가 못 찾으면 **-1** 을
   * 주는데 `-1 < (양수)` 는 **언제나 참**이라, 검증 코드를 통째로 지워도 통과했다.
   * 변이를 걸어 보고서야 알았다 — **초록불을 증거로 삼지 말라**는 그 자리다.
   * ⇒ 「있는가」를 먼저 묻고, 그다음에 「앞인가」를 묻는다.
   */
  const before = (needle, label) => {
    const at = src.indexOf(needle);
    assert.notEqual(at, -1, `${label} — 그 자리가 아예 없다(시험이 낡았거나 코드가 사라졌다)`);
    assert.ok(at < src.indexOf('별이 태어났다'), `${label} — 검증이 별을 쓴 뒤다. 거절하면서 별을 남긴다`);
  };
  before('레인이 서지 않는다', '레인 검증');
  before('const maxTurns = requirement === undefined', '턴 예산 검증');
  /* ⛔ 턴은 모델 호출이라 그대로 비용이다 — 상한이 없으면 오타 하나로 100턴을 태운다. */
  assert.match(src, /--max-turns 가 너무 크다/, '턴 예산에 상한이 없다');
  console.log('✅ 레인·턴 예산 — 자동으로 안 갈아타고, 검증이 별보다 먼저다');
}

/* ── 관문도 「못 쟀다」고 말할 수 있는가 (R154 · CI 가 잡았다).
   ⚠️⚠️ R146 이 **신호**를 셋으로 갈랐는데(✅ · ❌ · ⚪) **관문 자신은 둘뿐이었다** — 0 아니면 1.
   `learn --check` 는 궤적이 하나도 없을 때 「⚠️ 궤적 파일이 하나도 없다」고 말하면서 exit 0 을 냈고,
   부르는 쪽은 종료코드만 보므로 화면에 **`✅ 학습 후보 감사`** 가 찍혔다 — 아무것도 안 쟀는데.
   로컬에는 궤적이 쌓여 있어 **혼자서는 영영 못 볼 자리**였다. */
{
  const { EXIT_UNMEASURED } = await import(pathToFileURL(join(ROOT, 'lib/gates.mjs')).href);
  /* ⛔ 0(통과)도 1(실패)도 아니어야 한다 — 둘 중 하나면 셋으로 가른 뜻이 사라진다. */
  assert.equal(typeof EXIT_UNMEASURED, 'number');
  assert.notEqual(EXIT_UNMEASURED, 0, '「못 쟀다」가 통과와 같은 코드다 — 그러면 초록으로 세어진다');
  assert.notEqual(EXIT_UNMEASURED, 1, '「못 쟀다」가 실패와 같은 코드다 — 그러면 고장으로 세어진다');

  if (isUniverseSource) {
    /* 규약을 **쓰는 쪽**이 있어야 규약이다 — 아무도 안 읽으면 상수 하나일 뿐이다. */
    for (const [file, why] of [
      ['bin/check.mjs', '관문 화면이 ⚪ 로 갈라 찍는다'],
      ['observatory/learn.mjs', '궤적이 없으면 「못 쟀다」로 끝낸다'],
      ['observatory/verify-checks.mjs', '기준선이 못 쟀으면 변이 시험을 「안 문다」로 세지 않는다'],
    ]) {
      const text = await readFile(join(ROOT, file), 'utf8');
      assert.match(text, /EXIT_UNMEASURED/, `${file} 이 「못 쟀다」 규약을 안 읽는다 — ${why}`);
    }
  }
  console.log('✅ 관문도 셋으로 말한다 (통과 · 실패 · **못 쟀다**)');
}

/* ── 궤적의 레인 — **「모른다」를 「대본이 아니다」로 읽지 않는가** (R160).

   ⚠️⚠️ 실측(R159): 성공 궤적 **176건 중 175건이 같은 대본**(`--lane script`)이었는데,
   궤적에 레인이 안 적혀 있어 **가릴 방법이 하나도 없었다.** 그대로 `universe extract` 를
   돌렸으면 **같은 카드 175장에 모델 175번**이다. 여기 함수 셋이 그 갈래의 재료다. */
{
  const { laneOf, partitionByLane, SCRIPT_LANE } =
    await import(pathToFileURL(join(ROOT, 'lib/trajectory-lane.mjs')).href);

  assert.equal(laneOf([{ kind: 'nebula-start', lane: 'script' }]), 'script');
  assert.equal(laneOf([{ kind: 'action' }, { kind: 'nebula-start', lane: 'subscription' }]), 'subscription');
  /* ⛔ **안 적혀 있으면 「모른다」다.** 「대본이 아니다」로 읽으면 옛 대본 175건이 그대로 카드가 되고,
     「대본이었다」로 읽으면 **진짜 모델 주행 1건이 조용히 사라진다.** 어느 쪽도 짐작이다. */
  assert.equal(laneOf([{ kind: 'nebula-start', requirement: 'x' }]), null, '레인이 없는 궤적을 「모른다」로 안 본다');
  assert.equal(laneOf([]), null);
  assert.equal(laneOf(undefined), null);
  /* 빈 문자열은 「있다」가 아니다 — 칸만 있고 값이 없으면 모르는 것이다(R46·R47 과 같은 자리). */
  assert.equal(laneOf([{ kind: 'nebula-start', lane: '   ' }]), null, '빈 레인이 레인으로 통했다');
  /* ⛔ 아무 줄의 `lane` 이나 읽으면 안 된다 — 레인을 적는 자리는 `nebula-start` 하나다. */
  assert.equal(laneOf([{ kind: 'action', lane: 'script' }]), null, '`nebula-start` 가 아닌 줄의 레인을 읽는다');

  const split = partitionByLane([
    { file: 'a', lane: SCRIPT_LANE },
    { file: 'b', lane: 'subscription' },
    { file: 'c', lane: null },
    { file: 'd' },
  ]);
  assert.deepEqual(split.script.map((x) => x.file), ['a'],
    '대본이 안 갈렸다 — 같은 대본이 같은 카드를 그 수만큼 낸다(모델도 그만큼 부른다)');
  assert.deepEqual(split.model.map((x) => x.file), ['b']);
  /* ⛔ **셋이다.** 「모른다」를 모델이나 대본 칸에 섞으면 §8 을 어긴다 — 통과로도 제외로도 세면 안 된다. */
  assert.deepEqual(split.unknown.map((x) => x.file), ['c', 'd'], '레인을 모르는 것이 모델/대본 칸으로 섞였다');
  assert.equal(split.model.length + split.script.length + split.unknown.length, 4, '가르다가 하나를 잃었다');
  console.log('✅ 궤적의 레인 — 대본은 갈리고, 안 적힌 것은 「모른다」로 남는다');
}

/* ── 학습 고리 — **돌아오는 절반**이 이어졌는가 (R155).
   ⚠️⚠️ 실측: 이 우주에는 바퀴가 둘인데 한 쪽만 이어져 있었다. 실패 궤적 → 성운(`learn.mjs`)은
   **관문에 등재돼 돌았고**, 성공 궤적 → 지식 카드(`extractWikiCards`)는 엔진 안에 있고
   자기 시험까지 있는데 **우주가 부르는 곳이 하나도 없었다.** 지식이 나가기만 하고 안 돌아왔다. */
if (isUniverseSource) {
  const uni = await readFile(join(ROOT, 'bin/universe.mjs'), 'utf8');
  assert.match(uni, /extract: 'observatory\/extract\.mjs'/, '`universe extract` 가 없다 — 카드를 뽑을 길이 없다');

  const ex = await readFile(join(ROOT, 'observatory/extract.mjs'), 'utf8');
  /* ⛔ **기본이 안전해야 한다.** 모델을 부르는 도구의 기본이 「부른다」면 「공짜인 줄 알고 돌렸다」가 난다. */
  assert.match(ex, /--write/, '`--write` 갈래가 없다 — 기본이 모델을 부르게 된다');
  assert.match(ex, /모델을 부르지 않는다/, '기본이 모델을 안 부른다는 것을 말하지 않는다');
  assert.match(ex, /EXIT_UNMEASURED/, '궤적이 없을 때 「못 쟀다」로 끝내지 않는다(§8)');

  const neb = await readFile(join(ROOT, 'bigbang/nebula.mjs'), 'utf8');
  /* ⛔ **기본은 꺼져 있어야 한다.** 카드가 결과를 낫게 하는지 **아직 안 쟀는데** 행동을 바꾸면,
     이 저장소가 지금까지 잡아온 그 결함(재지 않고 바꾸는 것)을 스스로 저지르는 것이다. */
  assert.match(neb, /useSkills = false/, '지식 카드 주입이 기본으로 켜져 있다 — 안 재고 행동을 바꾼다');
  /* ⛔ 무엇이 들어갔는지 안 남기면 **「카드 있이/없이」를 영영 비교 못 한다.** */
  assert.match(neb, /skillCards: skills\.cards\.map/, '어떤 카드가 들어갔는지 궤적에 안 남긴다');
  /* ⛔ 카드는 참고지 법칙이 아니다 — 부딪히면 법칙이 이겨야 한다. */
  assert.match(neb, /법칙과 부딪히면 법칙이 이긴다/, '카드가 법칙과 같은 무게로 들어간다');

  /* ⛔ **레인이 궤적에 적혀야** 나중에 대본 주행을 가릴 수 있다(R160). 화면은 흘러가고 궤적은 남는다.
     ⚠️ 이 셋이 한 줄로 이어져야 뜻이 있다: 빅뱅이 넘기고 → 성운이 적고 → extract 가 그것으로 가른다.
        (실제로 도는지는 `3차 배선` 관문 ⑦⑧ 이 대본으로 잰다 — 모델 0회.) */
  assert.match(neb, /kind: 'nebula-start'[^}]*\blane\b/,
    '궤적의 `nebula-start` 에 레인을 안 적는다 — 나중에 대본 주행을 못 가린다');
  const bb = await readFile(join(ROOT, 'bigbang/bigbang.mjs'), 'utf8');
  assert.match(bb, /lane: laneName/, '빅뱅이 레인을 3차로 안 넘긴다 — 궤적의 칸이 늘 비게 된다');
  assert.match(ex, /partitionByLane/, 'extract 가 레인으로 안 가른다 — 대본이 그대로 카드가 된다');

  const { NOT_GATED } = await import(pathToFileURL(join(ROOT, 'lib/gates.mjs')).href);
  assert.ok((NOT_GATED['observatory/extract.mjs'] ?? '').length > 30, 'extract 를 관문 밖에 두면서 사유를 안 적었다');
  console.log('✅ 학습 고리 — 뽑을 길이 있고, 주입은 기본 꺼짐이고, 무엇이 들어갔는지 남는다');
}

/* ── 계약 우선 — **자기 채점을 막는 기계 장치**가 살아 있는가 (R156 · R23).
   ⚠️ 배선이 실제로 도는지는 `verify-nebula-wiring` 이 대본으로 잰다(모델 0회 · ④⑤).
   여기서는 **규율이 소스에 남아 있는지**를 본다 — 문구가 곧 규칙인 자리들이다. */
if (isUniverseSource) {
  const neb = await readFile(join(ROOT, 'bigbang/nebula.mjs'), 'utf8');
  /* ⛔ 기본으로 켜면 안 쟀는데 비용과 행동이 바뀐다(`--skills` 와 같은 규율). */
  assert.match(neb, /useContractFirst = false/, '계약 우선이 기본으로 켜져 있다 — 안 재고 비용과 행동을 바꾼다');
  /* ⛔ **처음부터 통과하는 계약을 거부**하는 갈래가 핵심이다. 없으면 자기 채점이 그대로 열린다. */
  assert.match(neb, /처음부터 통과한다/, '빈 계약을 거부하는 자리가 없다 — 자기 채점을 못 막는다');
  /* ⛔ 받은 계약을 보호 목록에 넣어야 구현 단계에서 못 고친다. */
  assert.match(neb, /alsoProtected/, '받은 계약을 보호하지 않는다 — 나중에 느슨하게 고칠 수 있다');
  /* ⛔ `commands.testFile` 이 없으면 **못 쟀다**다 — 지어낸 명령으로 재지 않는다(R146). */
  assert.match(neb, /commands\.testFile/, '테스트 파일 명령을 은하에서 안 읽는다 — 명령을 지어내게 된다');
  /* ⛔⛔ **과장하지 않는다.** 이건 「충족을 잰다」가 아니라 「승인된 계약이 도는가」다. */
  assert.match(neb, /계약이 충분한지는 기계가 못 잰다/, '기계가 못 재는 부분을 안 적었다 — 「충족을 잰다」로 읽힌다');
  console.log('✅ 계약 우선 — 기본 꺼짐 · 빈 계약 거부 · 받은 계약 보호 · 과장하지 않는다');
}

/* ── 요구사항 미충족 신호 (R130).
   ⛔ R23·R08 이 「요구사항 충족은 사람이 봐야 한다」로 남긴 자리 — 그래서 3차의 산출물을
   **아무도 요구사항과 대조하지 않았다.** 충족은 못 재도 **미충족은 잰다.**
   ⚠️⚠️ **한쪽만 재는 시험이라는 것을 여기 못 박는다** — 조용해도 충족이 아니다. */
{
  const { unmetSignals } = await import(pathToFileURL(join(ROOT, 'lib/requirement.mjs')).href);
  const req = '쿠폰 목록 위에 남은 개수를 보여 주고, 없으면 안내 문구를 띄워라';
  assert.deepEqual(
    unmetSignals(req, 'export const CouponList = () => <div>쿠폰 목록 남은 개수 안내 문구</div>;'), [],
    '알맹이가 다 있는데 「안 했다」고 한다 — 오탐이면 사람이 이 신호를 무시하게 된다');
  const missed = unmetSignals(req, 'export const Foo = () => <div>hello</div>;');
  assert.ok(missed.includes('쿠폰') && missed.includes('개수'),
    `엉뚱한 코드인데 못 잡는다: ${missed.join(' ')}`);
  /* ⛔ **동사는 알맹이가 아니다.** 첫 판이 `보여`·`띄워라` 를 「안 했다」로 세어
     요구사항의 절반이 오탐이었다 — 코드에 남는 것은 **이름**이지 동작 서술이 아니다. */
  assert.ok(!missed.includes('보여') && !missed.includes('띄워'),
    `동사를 알맹이로 셌다: ${missed.join(' ')}`);
  /* ⚠️ **조용한 것이 충족을 뜻하지 않는다** — 낱말만 흩뿌려도 조용하다. 그것이 이 신호의 한계다. */
  assert.deepEqual(unmetSignals(req, '// 쿠폰 목록 개수 안내 문구'), [],
    '주석에 낱말만 있어도 조용하다 — 이 한계를 시험이 알고 있어야 한다');
  /* ⛔ **영어는 못 잰다(R131 실측).** 제대로 만든 코드에도 `the`·`and`·`when` 이
     「안 했다」로 나왔다 — 알맹이 12개 중 6개가 오탐이었다. 기능어를 열거하면 §9 이고
     안 열거하면 못 가른다 ⇒ **못 재는 것은 못 잰다고 말한다.** `null` 은 「없다」가 아니다. */
  assert.equal(unmetSignals('Show the remaining coupon count', 'export const Foo = () => 1;'), null,
    '영어를 잰 척한다 — 기능어가 「안 했다」로 나와 신호가 거짓말을 한다');
  /* ⛔ **조사를 못 떼서 거짓 경보를 냈다**(R147 실측). 3차 대본 주행에서 품절 배지를
     **실제로 구현한 별**을 두고 「품절인이 없다 = 확실히 안 했다」고 말했다 — 코드에 `품절` 이
     버젓이 있는데도. 이 신호의 계약은 「시끄러우면 **확실히** 안 했다」라, 거짓 경보 하나가
     계약 전체를 무너뜨린다. ⚠️ 어미를 더 열거해 고치지 않았다 — 앞에서부터 잘라 본다. */
  assert.deepEqual(
    unmetSignals('품절인 메뉴에는 품절 배지를 보여 준다', '<span>품절</span> 배지 메뉴'), [],
    '조사가 붙었다고 「안 했다」고 한다 — `품절인` 은 코드의 `품절` 이 흔적이다');
  /* ⛔ 그렇다고 아무거나 흔적으로 치면 안 된다 — 한 글자까지 잘라 조용해지면 신호가 죽는다. */
  assert.ok(
    unmetSignals('확인 버튼을 넣어라', 'export const Foo = () => <div>확실하다</div>;').includes('확인'),
    '`확인` 을 `확` 까지 잘라 「있다」고 했다 — 그러면 이 신호는 아무것도 못 잡는다');
  console.log('✅ 요구사항 미충족 신호 — 한쪽만 잰다(조용해도 충족이 아니고, 영어는 못 쟀다고 말한다)');
}

/* ── 브리핑이 **은하가 못 하는 일**을 시키지 않는가 (R148).
   ⚠️⚠️ 실측(진짜 은하 · 실주행): 1차는 `commands.test` 가 비었다고 행동 계약 파일을 **안 만들고**
   「만들면 tsc 가 vitest 를 못 찾아 빌드가 깨진다」고 경고까지 했는데, 브리핑은 같은 실행에서
   에이전트에게 **「새 테스트 파일을 같이 내라」**고 시켰다. 에이전트는 시킨 대로 냈고
   그 파일 하나가 lint error 6건을 냈다 — 구현 파일 셋은 error 0 이었다.
   **별을 빨갛게 만든 것은 우주 자신의 지시였다.** 프로그램의 판단을 브리핑이 뒤집으면 안 된다. */
if (isUniverseSource) {
  const nebulaSrc = await readFile(join(ROOT, 'bigbang/nebula.mjs'), 'utf8');
  assert.match(nebulaSrc, /canRunTests\s*\?/,
    '브리핑이 은하의 테스트 능력을 안 본다 — 못 돌리는 은하에 테스트를 시키게 된다');
  assert.match(nebulaSrc, /canRunTests: Boolean\(galaxy\.commands\?\.test\)/,
    '브리핑이 1차와 **다른 근거**로 판단한다 — 두 자리가 갈리면 또 뒤집힌다');
  /* 못 돌리는 은하 갈래에는 **내지 말라**는 말이 있어야 한다. */
  const cannotBranch = nebulaSrc.slice(nebulaSrc.indexOf('이 은하는 테스트를 못 돌린다'));
  assert.match(cannotBranch.slice(0, 600), /테스트 파일을 내지 마라/,
    '테스트를 못 돌리는 은하인데 「내지 마라」가 없다');
  console.log('✅ 브리핑이 은하가 못 하는 일을 시키지 않는다');
}

/* ── 3차의 **성공 출구**에도 요구사항 신호가 붙어 있는가 (R132).
   ⛔ 실측: 처음엔 턴 루프가 끝난 자리에만 뒀는데 **게이트가 초록이면 그 앞에서 `return`** 한다 —
   **성공한 주행에서는 영영 안 돌았다.** 신호가 가장 필요한 자리가 바로 거기다.
   ⚠️ 이 검사는 **호출 자리를 센다.** 3차를 실제로 돌리려면 돈이 들어 그 길로는 못 잰다(§8). */
if (isUniverseSource) {
  const src = await readFile(join(ROOT, 'bigbang/nebula.mjs'), 'utf8');
  const calls = [...src.matchAll(/await sayRequirementSignal\(\);/g)].length;
  assert.ok(calls >= 2,
    `요구사항 신호를 부르는 자리가 ${calls}곳이다 — 성공 출구와 멈춤 출구 **둘 다** 불러야 한다`);
  /* 성공 출구(`EXIT.ok` 를 돌려주는 자리) **앞**에 호출이 있어야 한다. */
  const green = src.indexOf("decision: 'GREEN'");
  assert.ok(green > 0 && src.lastIndexOf('await sayRequirementSignal();', green) > 0,
    '성공 출구 앞에 요구사항 신호가 없다 — 별이 서긴 하는데 요구사항을 했는지 아무도 안 본다');
  console.log('✅ 요구사항 신호가 성공 출구에도 붙어 있다');
}

/* ── 아무도 안 부르는 함수가 있는가 (R133).
   ⛔ 이 세션에서 **내가 넣은 것이 죽어 있던 것이 세 번**이다 — 상태 의존 시험(R102) ·
   `\b` 로 죽은 정규식(R124) · **안 닿는 코드**(R132, 성공 출구 앞에서 return 했다).
   셋째는 기계로 잡을 수 있다: **정의만 있고 아무도 안 부르는 함수.**
   ⚠️ 완전하지 않다 — R132 는 「불리긴 하는데 그 길로 안 간다」였다. 이것은 **더 얕은 그물**이다.
   ⚠️ 이름이 ASCII 가 아니면 못 잡는다(`\w` 가 안 문다) — 우주의 코드는 ASCII 이름을 쓴다. */
if (isUniverseSource) {
  const walkMjs = async (dir) => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', 'engine', '.git'].includes(e.name)) {
        continue;
      }
      const p = join(dir, e.name);
      out.push(...(e.isDirectory() ? await walkMjs(p) : p.endsWith('.mjs') ? [p] : []));
    }
    return out;
  };
  const sources = new Map();
  for (const dir of ['bin', 'lib', 'observatory', 'beacon', 'bigbang']) {
    for (const f of await walkMjs(join(ROOT, dir))) {
      sources.set(f, await readFile(f, 'utf8'));
    }
  }
  const corpus = [...sources.values()].join('\n');
  const dead = [];
  let definedSeen = 0;
  for (const [f, src] of sources) {
    for (const m of src.matchAll(/^(?:export )?const (\w+) = (?:async )?\(/gm)) {
      definedSeen += 1;
      const uses = [...corpus.matchAll(new RegExp(`\\b${m[1]}\\b`, 'g'))].length;
      if (uses <= 1) {
        dead.push(`${f.replace(`${ROOT}/`, '')} ${m[1]}`);
      }
    }
  }
  /* ⛔ **분모를 세라(R137).** 훑개가 죽으면 **함수를 하나도 못 본 채 「죽은 함수 없음」**이 된다. */
  assert.ok(definedSeen > 50,
    `정의된 함수를 ${definedSeen}개만 봤다 — 훑개가 고장 났다(§8)`);
  assert.deepEqual(dead, [],
    `정의만 있고 아무도 안 부르는 함수 — 넣어 놓고 안 닿는 코드다: ${dead.join(' · ')}`);
  console.log(`✅ 아무도 안 부르는 함수가 없다 (${sources.size}파일)`);
}

/* ── 힘이 가리키는 법칙이 실재하는가 (R134).
   ⛔ 실측: `forces/observer.md` 가 `enforces: [observation, gravity, conservation, light-speed]`
   를 선언하는데 **아무도 그것을 확인하지 않았다.** 법칙 이름이 바뀌거나 사라지면
   **힘은 없는 것을 집행한다고 말한 채로** 남는다 — 관측소가 법칙에 대해 하는 검사(R38)와 같은
   자리인데 힘 쪽만 비어 있었다.
   ⚠️ 힘은 「명부일 뿐」이지만 **명부도 틀릴 수 있다.** 틀린 명부는 안 쓰느니만 못하다. */
if (isUniverseSource) {
  const forceFiles = (await readdir(join(ROOT, 'forces')))
    .filter((f) => f.endsWith('.md') && f !== 'README.md');
  const lawNames = new Set((await readdir(join(ROOT, 'laws')))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, '')));
  const ghosts = [];
  for (const file of forceFiles) {
    const text = await readFile(join(ROOT, 'forces', file), 'utf8');
    const declared = /^enforces:\s*\[([^\]]*)\]/m.exec(text)?.[1] ?? '';
    for (const name of declared.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!lawNames.has(name)) {
        ghosts.push(`${file} → ${name}`);
      }
    }
  }
  assert.deepEqual(ghosts, [],
    `힘이 **없는 법칙**을 집행한다고 말한다: ${ghosts.join(' · ')}`);
  /* ⚠️ 힘 파일이 하나도 없으면 위 반복이 안 돌아 **0건이 무죄로 보인다**(§8). */
  assert.ok(forceFiles.length > 0, '힘 파일을 하나도 못 찾았다 — 0건은 무죄가 아니다(§8)');
  /* ⛔ **트리거가 없는 명령을 약속하면 거짓말이다(R135).** 힘 문서가 「우주 검사해 → `universe
     check`」처럼 명령을 짚는데, 그 명령이 사라지면 **문구만 남는다.**
     ⚠️ 문서·절차를 가리키는 트리거는 안 묶는다 — 어느 문서인지는 사람이 정한다(§9). */
  const router = await readFile(join(ROOT, 'bin/universe.mjs'), 'utf8');
  const routed = new Set([...router.slice(router.indexOf('const SUBCOMMANDS'),
    router.indexOf('};', router.indexOf('const SUBCOMMANDS')))
    .matchAll(/^\s*([a-z-]+):\s*'/gm)].map((m) => m[1]));
  const promised = [];
  for (const file of forceFiles) {
    const text = await readFile(join(ROOT, 'forces', file), 'utf8');
    /* ⛔ **`[a-z-]+` 는 한글 이름을 못 본다(R135 실측).** 없는 명령을 심었는데 못 잡았다 —
       R124 의 `\b` 와 같은 부류다: **정규식이 조용히 좁아 검사가 죽는다.**
       ⚠️ 명령 이름은 ASCII 지만, **틀린 것을 잡으려면 넓게 봐야** 한다. */
    for (const m of text.matchAll(/`universe ([^`\s]+)`/g)) {
      if (!routed.has(m[1])) {
        promised.push(`${file} → universe ${m[1]}`);
      }
    }
  }
  assert.deepEqual(promised, [],
    `힘이 **없는 명령**을 약속한다: ${promised.join(' · ')}`);
  console.log(`✅ 힘 ${forceFiles.length}개가 실재하는 법칙만 집행하고, 실재하는 명령만 약속한다`);
}

/* ── 에이전트를 어떻게 부르는가 (R140).
   ⛔ 내가 로그 14곳에 「**유료 주행이라 돈이 든다**」고 적었는데 **틀렸다.** 엔진은
   `claude -p` **CLI 를 spawn 한다** — `ANTHROPIC_API_KEY` 가 있을 때만 `--bare` 를 붙인다.
   키가 없으면 **그 기계의 Claude Code 구독**으로 돈다.
   ⚠️ 이 구분이 중요한 이유: 「돈이 든다」면 **안 하는 것이 옳고**, 「사용량을 쓴다」면
   **물어보고 하는 것이 옳다.** 틀린 이유로 안 하면 영영 안 한다.
   ⚠️ 못 재는 것: **구독인지 API 인지는 그 기계의 환경**이다 — 여기서는 **부르는 방식**만 잰다. */
if (isUniverseSource && existsSync(join(ROOT, 'observatory/engine/packages/@core/fe-agent-harness/src/agent/claudeCli.ts'))) {
  const cli = await readFile(
    join(ROOT, 'observatory/engine/packages/@core/fe-agent-harness/src/agent/claudeCli.ts'), 'utf8');
  assert.match(cli, /bin = 'claude'/,
    '에이전트를 CLI 로 안 부른다 — 문서가 「구독으로 돈다」고 적은 근거가 사라졌다');
  assert.match(cli, /ANTHROPIC_API_KEY/,
    'API 키 갈래가 사라졌다 — 어느 경로로 도는지 문서가 말할 수 없게 된다');
  const docs05 = await readFile(join(ROOT, 'docs/05-expectations.md'), 'utf8');
  assert.match(docs05, /「유료」가 아니다/,
    '문서가 「유료」라고 적힌 채로 돌아갔다 — 틀린 이유로 안 하면 영영 안 한다');
  console.log('✅ 에이전트는 `claude` CLI 로 부른다 (문서와 코드가 같은 말을 한다)');

  /* ── 구독 경로 보증 (R145).
     사용자 결정: **이 하네스는 구독 경로로만 돈다.** 예전엔 `ANTHROPIC_API_KEY` 가 환경에
     있으면 `--bare` 를 붙여 **조용히 과금 경로로 갈아탔다** — 모드가 바뀌는데 아무도 안 쟀다(§8).
     이제 자식 env 에서 키를 지우므로 두 가지가 **동시에** 참이어야 한다:
       ① 코드가 `--bare` 를 밀지 않는다  ② `spawn` 에 `env` 를 넘긴다(안 넘기면 부모 환경을 통째로 물려준다)
     ⚠️ 소스만 재는 것으로는 부족하다 — **빌드된 dist 도 같이 잰다.** 소스를 고치고 빌드를
     잊으면 도는 것은 옛 코드다(이 저장소에서 이미 한 번 그랬다, R127). */
  const AUTH_LANE = [
    ['src/agent/claudeCli.ts', cli],
    ['dist/agent/claudeCli.js',
      await readFile(join(ROOT,
        'observatory/engine/packages/@core/fe-agent-harness/dist/agent/claudeCli.js'), 'utf8')
        .catch(() => null)],
  ];
  let laneChecked = 0;
  for (const [where, text] of AUTH_LANE) {
    if (text === null) { continue; }
    laneChecked += 1;
    assert.ok(!/push\('--bare'\)|"--bare"/.test(text),
      `${where} 이 \`--bare\` 를 민다 — 그 갈래는 API 키로만 인증한다. 구독 경로가 깨진다`);
    assert.match(text, /spawn\(bin, args, \{ env:/,
      `${where} 이 \`spawn\` 에 env 를 안 넘긴다 — 자식이 부모의 ANTHROPIC_API_KEY 를 물려받는다`);
    assert.match(text, /ANTHROPIC_API_KEY: \w+, \.\.\./,
      `${where} 이 자식 env 에서 ANTHROPIC_API_KEY 를 안 지운다`);
  }
  /* 분모가 0이면 이 검사는 죽은 것이다 — 0은 무죄가 아니다(§8). */
  assert.equal(laneChecked, 2,
    `인증 갈래를 ${laneChecked}곳밖에 못 쟀다 — dist 가 없나(엔진을 빌드했나)`);
  console.log('✅ 구독 경로 보증 — 소스와 dist 둘 다 `--bare` 를 안 밀고 키를 자식에서 지운다');
}

/* ── 대화형 입구 — 「외우지 않고 쓰게 한다」가 관문을 약하게 만들지 않았는가 ────────── */
{
  const { COMMANDS, COSTS_MONEY, dailyCommands, gateCommands, helpLine, invocationLabel, usageWidth } =
    await import('./commands.mjs');
  /**
   * ⚠️ **배달본에서는 못 잰다 — 그리고 그게 옳다.** `bin/` 은 배달 목록에 없다(`lib/delivered.mjs`).
   * CLI 는 **패키지에서** 돌고 깔린 우주에는 `lib`·`laws`·`observatory` 만 간다.
   * ⛔ 처음엔 이 사정을 모르고 그냥 읽었다가 **배달본 관문이 빨간불**이 났다 —
   *    「원본이 도는 것과 배달본이 도는 것은 다르다」를 시험이 직접 맞았다.
   * ⛔ 조용히 넘기지 않는다. **못 쟀다고 말한다**(§8) — 안 말하면 「통과」로 보인다.
   */
  const menuSource = await readFile(join(ROOT, 'bin/menu.mjs'), 'utf8').catch(() => null);
  if (menuSource === null) {
    console.log('⏭  대화형 입구 검사 — `bin/` 은 배달되지 않는다(CLI 는 패키지에서 돈다). 못 쟀다.');
  } else {

  /**
   * ⛔ **명부와 배분표가 갈리지 않는가 — 양방향으로 문다.**
   *
   * 도움말이 예전엔 `bin/universe.mjs` 안의 **따로 있는 문자열**이었다. 배분표와 별개의
   * 목록이라 한 자리만 늘어나면 조용히 갈렸다(R47 이 관문 목록에서 겪은 그것) — 실제로
   * `orphans`·`extract` 를 더할 때 두 곳을 다 고쳐야 했다. 이제 도움말은 명부에서 **만들어지지만**
   * 명부 자체가 새로운 손 목록이다. ⇒ 배분표를 **정규식으로 읽어** 양쪽을 맞춘다.
   * ⚠️ 실제로 이 검사가 물었다: 처음 명부를 쓰면서 `verify-coordinates`·`wiki` 를 **있는 줄 알고**
   *    적었는데 배분표엔 없었다. 손으로 적는 목록이 무엇을 숨기는지의 실례다(R91).
   */
  const table = Object.fromEntries(
    [...cliSource.matchAll(/^\s*([a-z-]+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));
  /**
   * 분모가 0이면 이 검사는 죽은 것이다 — 배분표 모양이 바뀌면 여기서 먼저 걸린다(§8).
   *
   * ⚠️ 처음엔 `>= 25` 라는 **손으로 박은 바닥**이었다. 이 파일의 다른 분모 가드들은
   * 「**낮게 잡아도 죽음은 잡는다. 높게 잡으면 잡는 것 없이 배달본만 깬다**」는 원칙으로
   * 낮게 잡혀 있는데(파일 40 · 도구 5 · 거부 시험 5) 그것만 32개 중 25로 높았다.
   * ⛔ 그 모양은 **줄이는 것을 벌한다** — 명령을 20개로 합치면 잡을 것이 없는데 빨간불이 된다.
   * (다른 세션이 실물로 데인 자리를 알려 왔다: 「나쁜 패턴이 N건 이상 잡혀야 검사가 살아
   *  있는 것으로 친다」를 썼더니 **코드가 좋아질수록 검사가 빨개졌다.** 결이 같다.)
   * ⇒ 숫자를 **명부에서 받는다.** 늘든 줄든 따라간다.
   */
  assert.ok(Object.keys(table).length >= Object.keys(COMMANDS).length,
    `배분표를 ${Object.keys(table).length}개밖에 못 읽었다(명부는 ${Object.keys(COMMANDS).length}개) — SUBCOMMANDS 모양이 바뀌었나`);

  const missing = Object.keys(table).filter((name) => !COMMANDS[name]);
  assert.deepEqual(missing, [],
    `배분표에 있는데 lib/commands.mjs 가 **분류하지 않은** 명령: ${missing.join(' · ')}\n`
    + '   → daily(사람이 친다) 인지 gate(관문이 부른다) 인지 정해라. 안 정하면 기본 화면에 안 뜬다');
  const invented = Object.keys(COMMANDS).filter((name) => !table[name]);
  assert.deepEqual(invented, [],
    `lib/commands.mjs 에만 있고 **배분표엔 없는** 명령: ${invented.join(' · ')}\n`
    + '   → `universe <이름>` 으로 부를 수 없는 것을 도움말이 광고하고 있다');
  assert.ok(dailyCommands().length + gateCommands().length === Object.keys(COMMANDS).length,
    '분류가 daily/gate 둘 중 하나가 아닌 명령이 있다');

  /**
   * ⛔⛔ **화면이 관문을 못 끈다** — 이 판에서 가장 중요한 제약이다.
   * 「느려진 관문은 아무도 안 본다」의 사촌이 **「넘길 수 있는 관문」**이다.
   * 메뉴는 고르기 쉬우므로 넘기기도 쉬워진다 — 그 갈래를 **애초에 안 만든다.**
   */
  /* ⛔⛔ **주석을 걷어내고 잰다.** 처음엔 안 걷어서 「이런 갈래를 만들지 않는다」고 적어 둔
     그 문서 주석 자체에 걸렸다 — 즉 **갈래를 진짜로 넣어도 못 알아본다**(문구가 이미 있으니까).
     이 세션에서 같은 종류로 검사가 죽어 있던 적이 있다: 정규식이 브리핑 **문구**에 걸려서
     거절을 꺼도 통과했다. ⇒ 검사는 **코드를 재야** 한다. 말을 재면 안 된다. */
  const menuCode = menuSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* 걷어낸 게 없으면 이 검사는 죽은 것이다 — 분모 가드(§8). */
  assert.ok(menuCode.length < menuSource.length * 0.8,
    '주석을 못 걷어냈다 — 아래 검사가 문서 문구에 걸려 장식이 된다');
  for (const forbidden of [/무시하고\s*계속/, /건너뛰[기고]/, /--no-verify/, /HUSKY\s*=\s*0/, /SKIP_/]) {
    assert.ok(!forbidden.test(menuCode),
      `bin/menu.mjs 에 **관문을 넘기는 갈래**가 생겼다 (${forbidden}) — 화면은 관문에 손이 닿으면 안 된다`);
  }
  /* 임의 명령을 못 만든다 — 배분표에 있는 것만 돈다. */
  assert.match(menuSource, /subcommands\[name\]/,
    'bin/menu.mjs 가 배분표를 안 거치고 명령을 만든다 — 임의 명령이 실행될 수 있다');

  /**
   * ⚠️ **돈이 드는 갈래는 말하고 확인받는다**(R145 의 그 사건 — 「공짜인 줄 알고 돌렸다」).
   * 메뉴는 고르기 쉬운 만큼 **실수도 쉽다.**
   */
  for (const key of Object.keys(COSTS_MONEY)) {
    assert.ok(COSTS_MONEY[key].includes('모델'),
      `COSTS_MONEY['${key}'] 가 모델을 부른다는 말을 안 한다`);
  }
  assert.match(menuSource, /COSTS_MONEY\['new --from'\][\s\S]{0,400}?askYes/,
    'bin/menu.mjs 의 3차 갈래가 **비용을 말하고 확인받지** 않는다');
  assert.match(menuSource, /COSTS_MONEY\['extract --write'\][\s\S]{0,400}?askYes/,
    'bin/menu.mjs 의 extract 갈래가 **비용을 말하고 확인받지** 않는다');

  /**
   * **한글은 터미널에서 두 칸을 먹는다** — `padEnd` 는 글자 수로 채운다.
   * 처음 도움말을 만들고 화면을 보고서야 알았다: 표가 어긋나 있었다.
   */
  const wide = helpLine('x', { usage: '가나다', summary: 'S' }, 10);
  const narrow = helpLine('x', { usage: 'abcdef', summary: 'S' }, 10);
  assert.equal(wide.length < narrow.length, true,
    '도움말 정렬이 **글자 수**로 채워진다 — 한글 usage 가 실제보다 좁게 세어져 표가 어긋난다');
  assert.equal(usageWidth([[null, { usage: '가나' }]]), 4, '한글 두 자는 화면에서 4칸이다');

  /**
   * ⛔⛔ **가르치는 이름이 도는 이름인가** — 도구가 맞는 말을 하는가의 자리다.
   *
   * ⚠️ 실측으로 물었다: 대화형 입구의 존재 이유가 **명령줄을 가르치는 것**인데, 가르치던
   * `universe …` 가 **그 기계에 없는 명령**이었다. 사용자가 그대로 쳤고 `command not found`.
   * 문서는 `node <저장소>/bin/universe.mjs` 라 하고 도움말은 `universe` 라 했다 — **두 말이 달랐다.**
   * ⛔ 화면이 가르친 것이 안 도는 것은 **안 가르친 것만 못하다.**
   */
  assert.equal(invocationLabel(join(ROOT, 'bin/universe.mjs'), ROOT), 'universe',
    '이어져 있는데도 긴 형태를 가르친다');
  assert.equal(invocationLabel(null, ROOT), `node ${ROOT}/bin/universe.mjs`,
    'PATH 에 없는데 `universe` 라고 가르친다 — 그대로 치면 command not found 다');
  assert.equal(invocationLabel('/opt/homebrew/bin/universe', ROOT), `node ${ROOT}/bin/universe.mjs`,
    '**남의** universe(npm 의 crossfilter/universe)가 PATH 에 있어도 그것을 가르친다');
  /* 이어 붙이는 법을 도구가 **말하는가** — 못 부르는 상태에서 사람이 다음에 뭘 할지 알아야 한다. */
  assert.match(cliSource, /npm link/,
    '`universe` 가 없을 때 이어 붙이는 법을 도움말이 안 알려 준다');
  assert.match(await readFile(join(ROOT, 'docs/01-quick-start.md'), 'utf8').catch(() => ''),
    /npm link/, '빠른 시작에 `universe` 를 이어 붙이는 단계가 없다 — 첫 명령부터 막힌다');

  /**
   * ⛔ **입구를 실제로 끝까지 몰아 본다.** 「안 타 본 갈래는 없는 관문과 같다」(R71).
   * 대화형은 TTY 가 있어야 도는데 시험대엔 TTY 가 없다 — 그래서 `runMenu` 가 답과 실행을
   * **밖에서 받는다**(이 저장소가 `createScriptedAsk`·`fetchImpl` 에서 쓰는 그 방식).
   * ⚠️ 재는 것은 **만들어진 명령줄**이다 — 메뉴의 존재 이유가 「그 줄을 가르치는 것」이라서다.
   */
  const menu = await import('../bin/menu.mjs');
  /**
   * ⛔ **자기 픽스처로 몬다 — 저장소의 `galaxies/` 에 기대지 않는다.**
   *
   * ⚠️ 처음엔 진짜 `galaxies/` 를 읽게 뒀는데 **배달본에서 빨간불**이 났다. 배달본에는
   * 은하 등록부가 없어서 메뉴가 「목록에서 고르기」 대신 **「직접 입력」**으로 갈렸고,
   * 대본 답이 한 칸씩 밀려 엉뚱한 명령줄이 만들어졌다. 즉 시험이 **환경을 재고 있었다** —
   * 그리고 그 환경은 이 저장소에만 있다. 「원본이 도는 것과 배달본이 도는 것은 다르다.」
   */
  const menuRoot = join(tmpdir(), `universe-menu-${process.pid}`);
  await mkdir(join(menuRoot, 'galaxies'), { recursive: true });
  await writeFile(join(menuRoot, 'galaxies', 'probe-galaxy.json'),
    JSON.stringify({ name: 'probe-galaxy', path: '.', solarSystems: [{ name: 'probe-solar', srcDir: 'src' }] }));

  const drive = async (answers) => {
    let i = 0;
    let built = null;
    const log = console.log;
    console.log = () => {};
    try {
      await menu.runMenu({
        root: menuRoot, packageHome: ROOT, subcommands: table,
        ask: async () => answers[i++] ?? '',
        run: async ({ shown }) => { built = shown; return 0; },
      });
    } finally {
      console.log = log;
    }
    return built;
  };
  const daily = dailyCommands().filter(([name]) => table[name]);
  const newIndex = daily.findIndex(([name]) => name === 'new') + 1;
  assert.ok(newIndex > 0, '`new` 가 사람이 치는 명령에 없다 — 메뉴 첫 화면에서 사라졌다');

  const built = await drive([String(newIndex), '1', '1', 'MenuProbe', '2', 'y']);
  /* ⛔ 은하·태양계는 **좌표에서 읽은 이름**이어야 한다 — 사람이 외워서 치는 것이 아니다. */
  assert.equal(built, 'universe new probe-galaxy probe-solar MenuProbe --expand',
    `메뉴가 만든 명령줄이 틀렸다: ${built}`);

  /* ⛔ **답을 안 하면(EOF) 곱게 나간다.** Ctrl-D 나 파이프가 끊긴 자리다 —
     예전엔 `ABORT_ERR` **생 스택트레이스**가 떴다. 사람이 그만둔 것은 고장이 아니다. */
  const cancelled = await drive([]);
  assert.equal(cancelled, null, 'EOF 로 그만뒀는데 명령이 실행됐다');
  await rm(menuRoot, { recursive: true, force: true });
  assert.match(menuSource, /catch \{\s*return CANCELLED;/,
    'bin/menu.mjs 가 stdin 끝을 안 잡는다 — Ctrl-D 에 생 스택트레이스가 뜬다');

  /**
   * ⛔⛔ **우주 안에 우주를 깔지 못한다** — 하루에 두 번 난 사고다(둘 다 의도가 아니었다).
   *
   * ⚠️ 이 사고의 진짜 값은 워킹트리가 더러워지는 것이 아니다. 복제된 `orbits/round.md` 가
   * 그림 참조를 하나 더 만들어서 **「고아 그림」 변이가 안 물게 됐다** — 검사가 조용히
   * 장식이 됐다. 더러운 워킹트리는 눈에 보이지만 **죽은 검사는 안 보인다.**
   * ⛔ 그래서 여기는 경고가 아니라 **거절**이고, `--force` 로도 안 뚫린다.
   * ⚠️ 신호는 `bin/check.mjs` 의 `isUniverseRepo` 와 **같은 것**을 써야 한다 — 갈리면 한쪽이 썩는다.
   */
  const initSource = await readFile(join(ROOT, 'bin/init.mjs'), 'utf8').catch(() => '');
  if (initSource) {
    assert.match(initSource, /observatory\/engine/,
      '`init` 이 우주 저장소인지 안 본다 — 우주 안에 우주가 깔린다');
    assert.match(initSource, /여기가 우주 저장소다/,
      '`init` 이 우주 저장소에서 거절하지 않는다');
    /* ⛔ 거절이 **아무것도 만들기 전에** 나야 한다. 내 코드가 별을 만들고 나서 검사한 적이 있다. */
    const guardAt = initSource.indexOf('여기가 우주 저장소다');
    const firstWrite = Math.min(...['fs.mkdir(', 'fs.writeFile(', 'fs.cp(']
      .map((call) => initSource.indexOf(call)).filter((i) => i >= 0));
    assert.ok(Number.isFinite(firstWrite) && guardAt < firstWrite,
      '`init` 의 거절이 **파일을 만든 뒤**에 있다 — 거절해도 이미 깔린 뒤다');
    /**
     * 진짜로 거절하는가 — 소스만 읽으면 「쓰였지만 안 걸리는」 모양을 못 잡는다.
     *
     * ⛔⛔ **`--dry-run` 을 반드시 같이 준다.** 이 시험은 「거절이 없으면 어떻게 되나」를
     * 재는데, 거절이 없으면 `init` 은 **진짜로 깐다.** 실측: 이 검사를 못 박으려고 거절을
     * 꺼서 변이를 돌렸더니 **시험이 저장소에 우주를 깔았다**(오늘 세 번째다).
     * ⇒ 이 저장소에 이미 적힌 규율과 같다 — **변이가 저장소를 부수면 안 된다.**
     * ⚠️ `--dry-run` 은 거절보다 **뒤에서** 갈리므로 거절이 살아 있으면 여전히 종료코드 1 이다.
     *    즉 재는 것은 그대로이면서 **틀렸을 때의 값만** 안전해진다.
     */
    const refused = await new Promise((resolve) => {
      const child = spawn(process.execPath, [join(ROOT, 'bin/init.mjs'), '--force', '--dry-run'],
        { cwd: ROOT, stdio: 'ignore' });
      child.on('close', (code) => resolve(code));
      child.on('error', () => resolve(-1));
    });
    assert.equal(refused, 1, '`init --force` 가 우주 저장소 안에서 **뚫렸다**');
  }

  /**
   * ⛔⛔ **비-TTY 에서 절대 대화형으로 가지 않는다.** CI·파이프·`verify-checks` 의 진입점
   * 시험이 여기서 **매달리면 관문이 통째로 죽는다.** 지금 자동 호출자들이 전부 플래그를
   * 붙여 부르는 것은 **우연이지 설계가 아니다** — 그 우연에 기대지 않는다.
   */
  const helpRun = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, 'bin/universe.mjs')],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stdin.end();
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ hung: true, out }); }, 10_000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ hung: false, code, out }); });
  });
  assert.equal(helpRun.hung, false,
    '⛔ 비-TTY 에서 인자 없이 `universe` 를 부르면 **매달린다** — CI 가 통째로 죽는다');
  assert.equal(helpRun.code, 0, `비-TTY 도움말이 종료코드 ${helpRun.code} 로 죽었다`);
  assert.ok(helpRun.out.includes('universe new'), '비-TTY 도움말에 명령이 안 나온다');
  /* 기본 화면은 **사람이 치는 것만** — 관문이 부르는 것까지 나오면 다시 33개가 된다. */
  assert.ok(!helpRun.out.includes('universe checks'),
    '기본 도움말에 관문 전용 명령이 나온다 — 가른 의미가 없다');
  assert.match(helpRun.out, /--help --all/, '기본 도움말이 `--all` 을 안 알려 준다');

  console.log(`✅ 대화형 입구 — 명부 ${Object.keys(COMMANDS).length}개가 배분표와 맞고, `
    + `사람이 치는 것 ${daily.length}개만 보이고, 관문을 넘기는 갈래가 없다`);
  }
}


console.log('\n부품 전부 통과.');
