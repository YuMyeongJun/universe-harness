#!/usr/bin/env node
/**
 * **위키 본문이 발행본과 같은가** — 사람이 위키를 손으로 고쳤는지 잡는 유일한 방법.
 *
 * ⚠️ `universe beacon` 은 「내가 보낸 것 ↔ 렌더 결과」만 본다. **위키 본문을 안 읽는다.**
 * 이 검사가 그 구멍을 메운다.
 *
 * ⛔ **이 스크립트는 위키를 못 가져온다.** Confluence 는 MCP 를 통해서만 읽히고
 * 그건 스크립트의 손이 닿는 곳이 아니다. 그래서 **누군가 받아다 줘야 한다** —
 * 에이전트가 `getConfluencePage` 로 `contentFormat: "markdown"` 을 받아
 * `<디렉터리>/<slug>.md` 로 저장하면 이 스크립트가 대조한다.
 *
 * ## 왜 정규화가 필요한가 — 실측
 *
 * 왕복(파일 → Confluence → 다시 받기)은 **글자를 안 지킨다.** 두 장(짧은 것·긴 것)을
 * 재보니 어긋남이 **여섯 가지 문법 패턴으로만** 났고 **내용 손실은 0건**이었다:
 *
 * | 종류 | 무엇 | 처리 |
 * |---|---|---|
 * | A | 표 구분선 `\|---\|` 정규화 | 비교에서 뺀다(정보가 0이다) |
 * | B | 불릿 `-` → `*` | 하나로 통일 |
 * | C | 문단 안 줄바꿈에 trailing 공백 2개 추가 | strip |
 * | D | 목록 앞 빈 줄 삽입 | 빈 줄을 접는다 |
 * | E | `~` → `\~` 이스케이프 | 되돌린다 |
 * | F | **강조 안의 코드가 쪼개진다** | ⛔ 정규화하지 않는다 — **소스에서 안 만든다** |
 *
 * F 를 정규화로 흡수하지 않는 이유: 그 자리는 **진짜 사람 수정이 가장 쉽게 숨는 곳**이다.
 * 렌더러가 애초에 그 형태를 안 쓰게 고쳤다(지금 발행본에 0건).
 *
 * ⚠️ **못 잰 것**: 표본 두 장에 `~~취소선~~` 과 `[텍스트](링크)` 가 하나도 없어
 * 그 두 패턴은 확인하지 못했다. 발행본에 그것이 생기면 다시 재야 한다.
 *
 * 재는 법:
 *   node observatory/verify-wiki.mjs <위키본문디렉터리>
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe'], 'universe wiki');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const wikiDir = argv.find((token) => !token.startsWith('--'));

if (!wikiDir) {
  console.error('⛔ 위키 본문을 받아 둔 디렉터리를 달라: node observatory/verify-wiki.mjs <디렉터리>');
  console.error('   에이전트가 getConfluencePage 로 contentFormat "markdown" 을 받아 <slug>.md 로 저장해야 한다.');
  process.exit(1);
}

/** 왕복이 바꾸는 것만 지운다. **F 는 여기 없다** — 소스에서 안 만들기 때문이다. */
const normalize = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) /* A */
    .map((line) => line.replace(/^(\s*)[*-](\s)/, '$1-$2')) /* B */
    .map((line) => line.replace(/\s+$/, '')) /* C */
    .map((line) => line.replace(/\\([~*_[\]\\.])/g, '$1')) /* E */
    .join('\n')
    .replace(/\n{2,}/g, '\n\n') /* D */
    .trim();

const pagesDir = join(ROOT, 'beacon/out/pages');
const localFiles = (await readdir(pagesDir)).filter((name) => name.endsWith('.md')).sort();

let missing = 0;
let differing = 0;

console.log(`── 위키 본문 대조 — 발행본 ${localFiles.length}장`);
for (const file of localFiles) {
  const slug = file.replace(/\.md$/, '');
  const wikiPath = join(resolve(wikiDir), file);
  const wikiText = await readFile(wikiPath, 'utf8').catch(() => null);
  if (wikiText === null) {
    console.log(`  ⏭  ${slug} — 받아 둔 본문이 없다 (${wikiPath})`);
    missing += 1;
    continue;
  }
  const localText = await readFile(join(pagesDir, file), 'utf8');
  const a = normalize(localText);
  const b = normalize(wikiText);
  if (a === b) {
    console.log(`  ✅ ${slug}`);
    continue;
  }
  differing += 1;
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const firstDiff = aLines.findIndex((line, index) => line !== bLines[index]);
  console.log(`  ⛔ ${slug} — 위키가 발행본과 다르다 (정규화 후 첫 차이 ${firstDiff + 1}번째 줄)`);
  console.log(`     저장소: ${(aLines[firstDiff] ?? '(없음)').slice(0, 90)}`);
  console.log(`     위키  : ${(bLines[firstDiff] ?? '(없음)').slice(0, 90)}`);
}

/* 관측 법칙 §8 — 한 장도 못 받았으면 「같다」가 아니라 「못 쟀다」이다. */
if (missing === localFiles.length) {
  console.error('\n⛔ 본문을 한 장도 못 받았다 — 통과가 아니라 **아무것도 못 잰 것**이다.');
  process.exit(1);
}
if (differing > 0) {
  console.error(`\n⛔ 위키가 손으로 고쳐진 장 ${differing}개. 저장소를 고치고 다시 발행하라 — 위키가 정본이 아니다.`);
  process.exit(1);
}
console.log(`\n✅ 받아 온 ${localFiles.length - missing}장이 발행본과 같다${missing > 0 ? ` (${missing}장은 못 받아 못 쟀다)` : ''}.`);
