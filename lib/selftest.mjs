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
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { join, relative } from 'node:path';

import { classifyBlind, READABLE, CODE_BUT_BLIND } from './blind.mjs';
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

assert.ok(READABLE.test('a.tsx') && READABLE.test('a.ts'));
assert.ok(!READABLE.test('a.js') && !READABLE.test('a.vue'));
assert.ok(CODE_BUT_BLIND.test('a.vue') && CODE_BUT_BLIND.test('a.jsx'));
assert.ok(!CODE_BUT_BLIND.test('a.ts'), '읽는 것과 못 읽는 것이 겹치면 분모가 두 번 세어진다');
console.log('✅ 읽는 확장자와 못 읽는 확장자가 겹치지 않는다');

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

/* ── 보존 법칙에 관문이 있는가 (R63).
   ⚠️⚠️ 이 법칙도 **아무도 안 보고 있었다**(광속 한계가 그랬던 것처럼 · R62).
   게다가 법칙에 적힌 재는 법을 그대로 돌리면 **늘 실패한다** — `fixtures/` 의 은하 둘이
   `.tsx` 16개를 갖고 있기 때문이다. 그 별들은 **은하 안에 있다**(법칙의 뜻은 지켜졌다).
   ⛔ 그래서 예외를 **명시**한다. 예외를 안 적으면 사람은 그 검사를 끄는 법부터 배운다. */
const STAR_LIKE = /\.(tsx|jsx|vue|svelte|astro)$/;
/* 은하가 사는 자리 — 픽스처는 우주 안에 벤더링된 **은하**다. 별이 거기 있는 것은 옳다. */
const GALAXY_HOMES = /^fixtures\//;
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
  const walked = (await Promise.all(['observatory', 'bigbang', 'lib', 'beacon', 'bin', 'laws', 'orbits', 'forces', 'docs']
    .map(walkAll))).flat();
  /* ⛔ **분모를 세라(R139).** 워커를 죽여 봤더니 **아무것도 안 빨개졌다** — 파일을 하나도 못 본 채
     「우주 안에 별이 없다」가 된다. 이 자리는 `walkAll` 이 조건부 경로를 훑어 R138 에서 미뤘던 곳이다. */
  /* ⚠️ **선을 배달본에 맞춘다(R139 실측).** 처음엔 100 으로 잡았는데 **배달본은 86파일**이라
     배달 관문이 빨개졌다 — 우주 소스(수백 개)만 보고 고른 수였다. 워커가 죽으면 0이 되므로
     **낮게 잡아도 죽음은 잡는다.** 높게 잡으면 잡는 것 없이 배달본만 깬다. */
  assert.ok(walked.length > 40,
    `우주의 파일을 ${walked.length}개만 훑었다 — 워커가 고장 났다(0은 무죄가 아니다 · §8)`);
  const stars = walked.filter((f) => STAR_LIKE.test(f) && !GALAXY_HOMES.test(f));
  assert.deepEqual(stars, [],
    `우주 안에 별이 섞였다 — 소스 산출물은 은하에 산다(보존 법칙): ${stars.join(' · ')}`);
  console.log('✅ 우주 안에 별이 없다 (은하는 `fixtures/` 에 벤더링돼 있고 그건 은하다)');
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
const isUniverseSource = existsSync(join(ROOT, 'observatory/engine'));

/* ── 아무도 안 돌리는 검사가 있는가 (R92).
   관문 목록(GATES)도 손 목록이다 — 도구를 만들고 등록을 잊으면 조용히 죽은 검사가 된다. */
if (isUniverseSource) {
  const { GATES, NOT_GATED } = await import(pathToFileURL(join(ROOT, 'lib/gates.mjs')).href);
  const gated = new Set(GATES.map((g) => g.file));
  const tools = (await readdir(join(ROOT, 'observatory')))
    .filter((f) => /^(verify|render)-.*\.(mjs|sh)$/.test(f))
    .map((f) => `observatory/${f}`);
  /* ⛔ **분모를 세라(R138).** 폴더를 훑는 검사도 조용히 죽는다 — 이 자리를 빈 폴더로 돌리니
     **도구를 하나도 못 본 채 「전부 관문이거나 사유가 있다」**가 됐다. 아무것도 안 빨개졌다.
     ⚠️ 같은 자리를 잰 셋 중 이것만 진짜 구멍이었다 — `redshift` 는 다른 경로를 보고 있어
     내 변이가 헛것이었고, `docs` 는 「못 쟀다」고 옳게 말한다. */
  assert.ok(tools.length > 5,
    `관측소 도구를 ${tools.length}개만 봤다 — 훑개가 고장 났다(0은 무죄가 아니다 · §8)`);
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


console.log('\n부품 전부 통과.');
