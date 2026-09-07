#!/usr/bin/env node
/**
 * **커밋되는 것에 「그 기계에만 있는 좌표」가 있는가.**
 *
 * ⚠️⚠️ 왜 생겼나(R152). 저장소를 MIT 로 공개하고 밀었더니
 * `galaxies/backoffice.json` 의 `path` 가 `/Users/<사람>/orca/…` 였다 —
 * **남의 홈 경로가 공개 저장소에 그대로 올라가 있었다.** 받은 사람에게는 못 쓰는 좌표고,
 * 우리에게는 새어 나가는 좌표다.
 *
 * ## 어떻게 재는가 — ⛔ 회사 이름을 열거하지 않는다(§9)
 *
 * 「blumn」·「orca」 같은 낱말을 목록으로 막는 것은 **다음 회사 이름을 못 막는다.**
 * 그래서 **구조로** 잰다. 구조적으로 「이 기계에만 있는 것」은 이것들이다:
 *
 *   · **절대 경로** (`/Users/…` · `/home/…` · `C:\…`) — 남의 기계엔 그 자리가 없다
 *   · 은하 좌표의 `path` 가 상대가 아닌 것 — 픽스처는 상대라 걸리지 않는다
 *
 * ⛔ **로컬 명부(`galaxies.local/`)는 안 본다.** 거기가 절대 경로가 사는 **옳은 자리**다.
 *    이 검사가 보는 것은 **커밋되는 것**뿐이다.
 *
 * ⚠️ 이 검사가 **못 잡는 것**을 적어 둔다(§8):
 *   · **git 히스토리** — 이미 밀린 커밋에는 그대로 남아 있다. 히스토리를 고쳐 쓰는 것이
 *     더 나쁘다고 판단했다(로컬 경로지 자격증명이 아니다). 여기서는 **지금 트리만** 본다.
 *   · 문서·로그 본문의 옛 좌표 — 그것은 **역사**다. 좌표로 쓰이지 않는다.
 *
 * 재는 법: `node observatory/verify-coordinates.mjs`
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { requireUniverseHome } from '../lib/home.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe'], 'universe coordinates');
const root = await requireUniverseHome(argv.includes('--universe') ? argv[argv.indexOf('--universe') + 1] : undefined);

/** 그 기계에만 있는 자리. 도구가 정한 모양이지 사람이 정한 이름이 아니다. */
const MACHINE_PATH = /(^|["'\s(=])(\/Users\/|\/home\/|\/root\/|[A-Za-z]:\\\\)/;

const problems = [];

/* ── ① 커밋되는 은하 좌표는 `path` 가 상대여야 한다 ─────────── */

const committed = await readdir(join(root, 'galaxies')).catch(() => []);
for (const file of committed.filter((f) => f.endsWith('.json'))) {
  const raw = await readFile(join(root, 'galaxies', file), 'utf8');
  let galaxy;
  try {
    galaxy = JSON.parse(raw);
  } catch {
    /* 형식은 다른 검사의 일이다 — 여기서 죽으면 두 가지를 한 검사가 재게 된다. */
    continue;
  }
  const path_ = galaxy?.path;
  if (typeof path_ === 'string' && (path_.startsWith('/') || /^[A-Za-z]:\\/.test(path_))) {
    problems.push({
      where: `galaxies/${file}`,
      what: `\`path\` 가 절대 경로다: ${path_}`,
      fix: `이 은하는 **그 기계에만 있다.** \`galaxies.local/${file}\` 로 옮겨라(gitignore 다) — 커밋되는 은하는 상대 경로만 둔다.`,
    });
  }
}

/* ── ② 커밋되는 설정에 기계 경로가 박혀 있으면 안 된다 ──────── */

/** 좌표가 사는 자리만 본다. 문서·로그는 **역사**라 안 본다(위 ⚠️ 참고). */
const CONFIG_FILES = ['universe.config.json', 'beacon/pages.json', 'package.json'];
for (const rel of CONFIG_FILES) {
  const text = await readFile(join(root, rel), 'utf8').catch(() => null);
  if (text === null) {
    continue;
  }
  for (const line of text.split('\n')) {
    if (MACHINE_PATH.test(line)) {
      problems.push({
        where: rel,
        what: `그 기계에만 있는 경로가 있다: ${line.trim().slice(0, 80)}`,
        fix: '상대 경로로 바꾸거나, 기계마다 다른 값이면 설정을 로컬(gitignore)로 옮겨라.',
      });
    }
  }
}

/* ── 판정 ──────────────────────────────────────────────── */

console.log(`── 좌표 감사 — 커밋되는 은하 ${committed.filter((f) => f.endsWith('.json')).length}개 · 설정 ${CONFIG_FILES.length}개`);
if (problems.length === 0) {
  console.log('\n✅ 커밋되는 것에 그 기계에만 있는 좌표가 없다.');
  console.log('   (로컬 명부 `galaxies.local/` 는 안 본다 — 절대 경로가 사는 옳은 자리다)');
  process.exit(0);
}

for (const problem of problems) {
  console.error(`\n  ⛔ ${problem.where}`);
  console.error(`     ${problem.what}`);
  console.error(`     → ${problem.fix}`);
}
console.error(`\n⛔ 그 기계에만 있는 좌표 ${problems.length}건. **공개 저장소에 남의 자리가 실려 나간다.**`);
process.exit(1);
