#!/usr/bin/env node
/**
 * 문서 링크 검사 — 「가리키는 곳이 없는 링크」를 센다.
 *
 * ⚠️ **왜 코드블록을 건너뛰는가**: 처음 만든 판은 그냥 정규식으로 훑었고 9건을 냈는데
 * 그중 3건이 **문서가 마크다운 문법 자체를 설명하는 자리**였다 —
 * `[글](url)` 같은 인라인 코드와, 펜스 안의 정규식 `(react|react-dom)`.
 * 재는 도구가 오탐을 내면 사람이 도구를 끄게 된다. 그래서 코드는 코드로 본다.
 *
 * 재는 법:
 *   node observatory/verify-links.mjs      # 종료코드 0=성한 링크만 · 1=깨진 링크 있음
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';

rejectUnknownFlags(process.argv.slice(2), ['--universe'], 'universe links');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/**
 * ⚠️⚠️ `.data` 가 왜 여기 있는가 — **실측으로 데인 자리다.**
 *
 * 콘솔이 「저장소 받아 오기」로 남의 저장소를 `app/universe/.data/clones/` 에 받는다.
 * 그 저장소에도 `docs/**.md` 가 있고, 그 안의 링크는 **그 저장소의 사정**이다.
 * ⇒ 훑개가 그것까지 세면서 **깨진 링크 7건**을 냈다. 우주는 그 문서를 고칠 권한도,
 *   고칠 이유도 없다(남의 저장소는 읽기만 한다). 관문이 **남의 집을 검사한 것**이다.
 * ⛔ 「어차피 gitignore 니까」로 넘기면 안 됐다 — 훑개는 git 을 안 보고 디스크를 본다.
 */
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'out', '.harness', 'typedocs', '.data']);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) { continue; }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full, out); } else if (name.endsWith('.md')) { out.push(full); }
  }
  return out;
};

/** 펜스 블록과 인라인 코드를 공백으로 지운다 — 길이를 지켜 줄 번호를 보존한다. */
const stripCode = (text) => {
  const blanked = text.replace(/^([ \t]*)(```|~~~)[\s\S]*?^\1?\2[ \t]*$/gm, (m) => m.replace(/[^\n]/g, ' '));
  return blanked.replace(/`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, ' '));
};

const broken = [];
let linkCount = 0;
let fileCount = 0;

for (const file of walk(ROOT)) {
  fileCount += 1;
  const raw = readFileSync(file, 'utf8');
  const text = stripCode(raw);
  /* ⚠️ 대상에 공백을 허용한다. 공백을 막았더니 `[실측 은하 A](실측 은하 A.json)` 같은
     **깨진 링크를 조용히 놓쳤다**(실측) — 오탐을 줄이려다 미탐을 만든 것이다. */
  for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = match[1].replace(/\s+"[^"]*"$/, '').split('#')[0].trim();
    if (!target || /^(https?:|mailto:|tel:)/.test(target)) { continue; }
    linkCount += 1;
    if (!existsSync(resolve(dirname(file), target))) {
      const line = text.slice(0, match.index).split('\n').length;
      broken.push({ file: relative(ROOT, file), line, target });
    }
  }
}

/* ⚠️ **아무 데서도 안 쓰이는 그림은 낡아도 아무도 모른다.** 실제로 `round-orbit.svg` 가
   그랬다 — 내용은 맞았지만 어느 문서에서도 안 불렸다. 그리면서 안 거는 것은
   「그렸다」가 아니라 「어딘가에 뒀다」이다. */
const assetDir = join(ROOT, 'docs/img');
const orphans = [];
let assetCount = 0;
try {
  const referenced = readdirSync(assetDir);
  assetCount = referenced.length;
  const allText = walk(ROOT).map((file) => readFileSync(file, 'utf8')).join('\n');
  for (const asset of referenced) {
    if (!allText.includes(asset)) { orphans.push(asset); }
  }
} catch { /* docs/img 이 없으면 볼 것이 없다 */ }

console.log(`── 문서 링크 — 문서 ${fileCount}개 · 상대 링크 ${linkCount}개 · 그림 ${assetCount}개`);
if (orphans.length > 0) {
  console.error(`  ⛔ 아무 데서도 안 쓰이는 그림 ${orphans.length}개: ${orphans.join(' · ')}`);
  console.error('     그리면서 안 거는 것은 「그렸다」가 아니라 「어딘가에 뒀다」이다.');
  process.exit(1);
}

/* ⚠️ **0은 무죄가 아니다.** 이 저장소에는 문서도 링크도 분명히 있다. 0을 셌다는 것은
   위반이 없다는 뜻이 아니라 **파서가 고장 났다**는 뜻이다.
   오늘만 다섯 번 같은 형태로 당했다 — cohesion 0건(정규식 가정 3개가 틀림) ·
   img-alt 0건(패턴에 NEVERMATCH) · 변이가 안 먹음 · 성운이 배포판 템플릿 · 링크 오탐. */
if (fileCount === 0 || linkCount === 0) {
  console.error('  ⛔ 아무것도 못 셌다 — 위반이 없는 것이 아니라 **훑개가 고장 난 것**이다.');
  process.exit(1);
}
if (broken.length === 0) {
  console.log('  ✅ 가리키는 곳이 없는 링크 없음');
  process.exit(0);
}
console.log(`  ⛔ 깨진 링크 ${broken.length}건`);
for (const item of broken) { console.log(`     ${item.file}:${item.line} → ${item.target}`); }
process.exit(1);
