#!/usr/bin/env node
/**
 * 폴더 구조를 **생성**한다 — `docs/08-architecture.md` 의 표식 사이를 채운다.
 *
 * ⚠️ 왜 생성하나: **그림은 낡는다.** 손으로 그린 폴더 구조는 디렉터리가 하나 늘 때마다
 * 거짓이 되는데, 그것을 아무도 안 본다. 생성된 것은 낡을 수 없고,
 * 낡았는지는 `universe checks` 가 본다(생성 결과와 문서가 다르면 실패).
 *
 * 재는 법:
 *   node observatory/render-structure.mjs           # 문서를 갱신한다
 *   node observatory/render-structure.mjs --check    # 낡았으면 exit 1
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--check'], 'universe structure');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/* 배달본에서 직접 부르면 사유를 대고 죽는다 — 생 스택트레이스 대신(R91). */
await requireUniverseSource(ROOT, 'universe structure');
const DOC = join(ROOT, 'docs/08-architecture.md');
const BEGIN = '<!-- STRUCTURE:BEGIN -->';
const END = '<!-- STRUCTURE:END -->';

/** 안 그리는 것 — 산출물·의존성·기계가 쓰는 자리. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', '.harness', 'typedocs', '.DS_Store']);

/**
 * **커밋되지 않는 것은 그림에 없다.**
 *
 * ⚠️⚠️ 실측(R154 · CI 가 처음 잡았다): `galaxies.local/`(gitignore)을 만들자 내 기계에서는
 * 그림에 들어가고 **깨끗한 클론에서는 안 들어가서**, 커밋된 그림이 CI 에서 영영 「낡았다」가 됐다.
 * 로컬에서는 초록불이라 **혼자서는 못 봤을 결함**이다.
 *
 * ⛔ 이름을 `SKIP` 에 하나 더 적어 막지 않는다(§9) — 다음 로컬 폴더에서 또 깨진다.
 *    **git 에게 묻는다**: 무시되는 것이면 커밋본에 없고, 커밋본에 없으면 그림에도 없어야 한다.
 */
const ignoredNames = async (dir, names) => {
  if (names.length === 0) {
    return new Set();
  }
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  /* `check-ignore` 는 무시되는 것이 하나도 없으면 exit 1 이다 — 실패가 아니다. */
  /* ⛔ `--stdin` 을 쓰면 안 된다 — `promisify(execFile)` 에는 `input` 옵션이 없어서
     자식이 **stdin 을 영영 기다린다**(실측: 5분 타임아웃까지 매달렸다). 이름을 인자로 준다. */
  const out = await run('git', ['check-ignore', '--', ...names], { cwd: dir })
    .then((r) => r.stdout)
    .catch((error) => error.stdout ?? '');
  return new Set(out.split('\n').map((line) => line.trim()).filter(Boolean));
};

/** 한 줄 설명 — 없으면 안 적는다(지어내지 않는다). */
const NOTE = {
  laws: '무엇이 옳은가 — 문서가 아니라 관문',
  orbits: '어떻게 반복되는가',
  forces: '누가 하는가 — 명부만 배달된다',
  bigbang: '별을 태어나게 하는 명령과 별틀',
  observatory: '재는 장치 — 형식이 아니라 동작',
  galaxies: '법칙이 적용되는 저장소의 좌표',
  nebula: '아직 법칙이 아닌 관측 — 백로그',
  log: '라운드마다 무엇을 했고 어떻게 평가했나',
  beacon: '저장소 → 위키 한 방향',
  docs: '사람이 읽는 문서',
  bin: '명령 진입점',
  lib: '부품 — 우주의 집 찾기 · 플래그 검사',
  seed: '배달용으로 따로 쓴 판',
  fixtures: '시험용 은하 — 배달되지 않는다',
  '.githooks': '커밋 시점 관문',
};

const tree = async (dir, prefix = '', depth = 0) => {
  if (depth > 1) { return []; }
  const names = (await readdir(dir)).filter((name) => !SKIP.has(name) && !name.startsWith('.') || name === '.githooks');
  const ignored = await ignoredNames(dir, names);
  const dirs = [];
  for (const name of names.sort()) {
    if (SKIP.has(name) || ignored.has(name)) { continue; }
    if ((await stat(join(dir, name))).isDirectory()) { dirs.push(name); }
  }
  const lines = [];
  for (const [index, name] of dirs.entries()) {
    const last = index === dirs.length - 1;
    const note = NOTE[name] ? `  ← ${NOTE[name]}` : '';
    lines.push(`${prefix}${last ? '└── ' : '├── '}${name}/${note}`);
    lines.push(...(await tree(join(dir, name), `${prefix}${last ? '    ' : '│   '}`, depth + 1)));
  }
  return lines;
};

const body = ['```', 'universe/', ...(await tree(ROOT)), '```'].join('\n');

/* 관측 법칙 §8 — 아무것도 못 훑었으면 통과가 아니다. */
if (body.split('\n').length < 5) {
  console.error('⛔ 폴더를 하나도 못 훑었다 — 통과가 아니라 훑개가 고장 난 것이다.');
  process.exit(1);
}

const doc = await readFile(DOC, 'utf8');
const before = doc.slice(0, doc.indexOf(BEGIN) + BEGIN.length);
const after = doc.slice(doc.indexOf(END));
const next = `${before}\n\n${body}\n\n${after}`;

if (argv.includes('--check')) {
  if (doc === next) {
    console.log('── 폴더 구조 — 문서가 파일시스템과 같다');
    process.exit(0);
  }
  console.error('⛔ 폴더 구조 그림이 낡았다 — `node observatory/render-structure.mjs` 로 다시 그려라.');
  process.exit(1);
}

await writeFile(DOC, next, 'utf8');
console.log(`✅ 폴더 구조를 다시 그렸다 — ${body.split('\n').length - 3}줄`);
