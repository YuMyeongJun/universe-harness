#!/usr/bin/env node
/**
 * `universe clone <주소>` — **남의 저장소를 받아 와 좌표 초안까지** 낸다.
 *
 * ## 사람이 하려던 것
 *
 *   우주를 깔고 → 화면을 띄우고 → **깃 주소를 넣고** → 재고 → TC → 화면 시험 → fail 0 까지
 *
 * 그 첫 칸이 비어 있었다. 지금까지는 저장소가 **이미 그 기계에 있어야** 했다
 * (`universe galaxy --dir <경로>`). 남이 처음 쓸 때는 그렇지 않다.
 *
 * ## ⛔⛔ 토큰을 **인자로 받지 않는다** — 이건 편의가 아니라 규율이다
 *
 * `--token` 을 받으면 그 값이 **셸 히스토리 · `ps` 의 프로세스 목록 · 이 저장소의 로그**에
 * 남는다. 그리고 이 저장소는 **공개 MIT** 다. 한 번 새면 되돌릴 수 없다.
 * ⇒ 인증은 **그 기계의 git 이 이미 아는 것**으로 한다(credential helper · `gh auth login` ·
 *   SSH 키). 우주는 토큰을 **보지도 않고 저장하지도 않는다.**
 * ⚠️ 비공개 저장소인데 자격이 없으면 git 이 거절하고, 우주는 **그 거절을 그대로 보여 준다** —
 *   대신 물어보지 않는다. 자격을 다루는 것은 git 과 사람의 일이다.
 *
 * ## ⛔ 덮어쓰지 않는다
 *
 * 받을 자리가 비어 있지 않으면 **멈춘다.** 남의 작업이 거기 있을 수 있고,
 * 「받아 오기」가 「지우기」가 되면 그건 되돌릴 수 없는 종류의 사고다.
 *
 *   universe clone <주소> [--branch <가지>] [--into <받을 자리>] [--name <은하 이름>] [--out <좌표 파일>]
 *
 * ## ⚠️ `--branch` 를 왜 두는가
 *
 * 안 주면 git 이 **원격의 기본 가지**를 받는다. 그런데 잴 대상이 `main` 이 아닌 경우가 흔하다 —
 * 이 우주의 실측 은하들부터가 `refactor-…` · `universe-trial` 같은 작업 가지에 있다.
 * ⛔ 기본 가지를 받아 놓고 「이 저장소를 쟀다」고 말하면 **다른 코드를 잰 것**이다.
 * ⛔ 우주가 가지를 **짐작하지 않는다** — 안 주면 안 준 대로 두고, 받은 뒤 **실제로 어느 가지에
 *    있는지 찍는다**(짐작 대신 실측).
 *
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { nameProblem } from '../lib/name.mjs';
import { packageHome } from '../lib/home.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--into', '--name', '--out', '--branch'], 'universe clone');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const taken = new Set(['--into', '--name', '--out', '--universe', '--branch']
  .flatMap((f) => (argv.includes(f) ? [argv[argv.indexOf(f) + 1]] : [])));
const url = argv.find((a) => !a.startsWith('--') && !taken.has(a));

if (!url) {
  console.error('주소를 줘라: universe clone <주소> [--branch <가지>] [--into <받을 자리>] [--name <은하 이름>]');
  console.error('  ⛔ 토큰은 **안 받는다.** 비공개 저장소면 `gh auth login` 이나 SSH 키로 먼저 자격을 만들어라 —');
  console.error('     우주는 그 기계의 git 이 아는 것을 쓸 뿐, 토큰을 보지도 저장하지도 않는다.');
  process.exit(1);
}

/**
 * ⛔ **자격이 주소에 박혀 오는 것을 거절한다.**
 * `https://<토큰>@github.com/...` 는 git 이 받아들이지만, 그 순간 토큰이 **이 도구의 인자**가 되고
 * 셸 히스토리와 프로세스 목록에 남는다. 위에서 `--token` 을 안 받기로 한 이유가 그대로 적용된다.
 */
if (/^[a-z+]+:\/\/[^/@]*[:@]/i.test(url) && !/^ssh:\/\//i.test(url)) {
  console.error('⛔ 주소에 **자격이 박혀 있다** — 그대로 두면 셸 히스토리와 프로세스 목록에 남는다.');
  console.error('   자격은 빼고 주소만 줘라. 인증은 그 기계의 git 이 한다(`gh auth login` · SSH 키 · credential helper).');
  process.exit(1);
}

/** 주소에서 이름을 뽑는다 — 사람이 안 정했으면. ⛔ 못 뽑으면 **지어내지 않고 물어본다.** */
const guessed = (flag('--name') ?? url.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).pop() ?? '')
  .toLowerCase();
const problem = nameProblem(guessed);
if (problem) {
  console.error(`⛔ 은하 이름으로 쓸 수 없다: ${guessed || '(주소에서 못 뽑았다)'}\n   ${problem}`);
  console.error('   `--name <이름>` 으로 직접 줘라.');
  process.exit(1);
}

const into = path.resolve(flag('--into') ?? path.join(process.cwd(), guessed));

/* ⛔ **비어 있지 않으면 멈춘다.** 「받아 오기」가 「지우기」가 되면 되돌릴 수 없다. */
const already = await fs.readdir(into).catch(() => null);
if (already !== null && already.length > 0) {
  console.error(`⛔ 이미 무언가 있다: ${into} (${already.length}개)`);
  console.error('   덮어쓰지 않는다 — 남의 작업이 거기 있을 수 있다. 빈 자리를 `--into` 로 줘라.');
  process.exit(1);
}

console.log(`── 저장소를 받아 온다 — ${url}`);
console.log(`   받을 자리: ${into}`);
console.log('   ⛔ 토큰은 안 받는다 — 그 기계의 git 이 아는 자격을 쓴다.');

const run = (cmd, args, opts = {}) => new Promise((done) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });
  child.on('close', (code) => done(code ?? 1));
  child.on('error', () => done(127));
});

/**
 * 가지. ⛔ **모양을 좁힌다** — 사람이 준 값이 그대로 인자가 되는 자리다(R76).
 * git 의 ref 이름 규칙 전부를 여기 옮기지 않는다. **막는 것만** 적는다:
 * `-` 로 시작(옵션으로 읽힌다) · 공백 · `..` · `~^:?*[\` · 제어문자.
 * ⚠️ 그래서 **git 이 받는 것보다 좁다.** 좁아서 거절된 이름이 있으면 그건 ⛔ 이 줄의 문제이고,
 *    조용히 통과시키는 것보다 낫다 — 통과시키면 그 값이 git 의 옵션이 된다.
 */
const branch = flag('--branch');
if (branch !== undefined && !/^(?!-)(?!.*\.\.)[^\s~^:?*[\\\x00-\x1f]{1,255}$/.test(branch)) {
  console.error(`⛔ 가지 이름이 아니다: ${branch}`);
  console.error('   `-` 로 시작하거나 공백·`..`·`~^:?*[\\` 가 든 이름은 안 받는다.');
  process.exit(1);
}
if (branch !== undefined) console.log(`   가지: ${branch}`);

/* `--` 로 끊는다 — 주소가 `-` 로 시작해도 옵션으로 안 읽힌다. */
const code = await run('git', [
  'clone',
  ...(branch === undefined ? [] : ['--branch', branch]),
  '--', url, into,
]);
if (code !== 0) {
  console.error(`\n⛔ git 이 거절했다(종료코드 ${code}).`);
  console.error('   ⚠️ 비공개 저장소라면 **자격이 없는 것**이다 — `gh auth login` 이나 SSH 키를 먼저 만들어라.');
  console.error('   ⛔ 우주가 대신 토큰을 받아 두지는 않는다. 위 git 의 말을 그대로 읽어라.');
  process.exit(code);
}

/**
 * ⭐ **어느 가지를 받았는지 찍는다 — 짐작이 아니라 실측이다.**
 * `--branch` 를 안 줬을 때 「기본 가지」가 무엇인지 우주는 모른다. 물어봐서 적는다.
 * ⛔ 못 읽으면 **지어내지 않는다** — 「(가지를 못 읽었다)」로 적는다.
 */
const headRan = await new Promise((done) => {
  const c = spawn('git', ['-C', into, 'rev-parse', '--abbrev-ref', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.on('close', () => done(out.trim()));
  c.on('error', () => done(''));
});
const at = headRan === '' ? '(가지를 못 읽었다)' : headRan;

console.log(`\n✅ 받았다 — ${into}`);
console.log(`   가지: ${at}${branch === undefined ? '  ← 원격의 기본 가지다(우주가 고른 것이 아니다)' : ''}`);

/**
 * ⛔ **좌표를 여기서 만들지 않는다** — 그건 `bin/galaxy.mjs` 의 몫이다.
 * 두 자리에서 만들면 조용히 갈린다(이 저장소가 R47·R91 에서 반복해 데인 자리).
 */
const out = flag('--out') ?? path.join(into, 'universe-galaxy.json');
console.log('\n── 이어서 좌표 초안을 만든다 (`universe galaxy`)');
const drafted = await run(process.execPath,
  [path.join(packageHome, 'bin/galaxy.mjs'), guessed, '--dir', into, '--out', out]);
if (drafted !== 0) {
  console.error('\n⛔ 받기는 했는데 **좌표 초안을 못 만들었다.** 위 말을 읽고 손으로 만들어라:');
  console.error(`   universe galaxy ${guessed} --dir ${into}`);
  process.exit(drafted);
}

console.log('\n다음:');
console.log(`   1. ${path.relative(process.cwd(), out)} 의 TODO 를 채운다 (태양계는 **사람이 고른다**)`);
console.log('   2. `galaxies.local/` 로 옮기고 `universe.config.json` 의 `galaxies` 에 이름을 올린다');
console.log(`   3. universe observe --galaxy ${guessed}`);
console.log('   ⛔ 2번을 빼먹으면 관측이 **아무것도 안 재고 초록불**을 낸다(R121 이 그랬다).');
