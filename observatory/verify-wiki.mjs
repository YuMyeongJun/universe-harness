#!/usr/bin/env node
/**
 * **위키 본문이 발행본과 같은가** — 사람이 위키를 손으로 고쳤는지 잡는 유일한 방법.
 *
 * ⚠️ `universe beacon` 은 「내가 보낸 것 ↔ 렌더 결과」만 본다. **위키 본문을 안 읽는다.**
 * 이 검사가 그 구멍을 메운다.
 *
 * ## 이제 **혼자 돈다** (R151)
 *
 * ⚠️⚠️ 예전엔 못 돌았다: 「Confluence 는 MCP 로만 읽히고 스크립트의 손이 안 닿는다 —
 * 누군가 받아다 줘야 한다」(R17). 그래서 이 검사는 관문 밖에 있었다.
 * 위키를 **git 위키**로 옮기고 나서 그 전제가 사라졌다 — `clone` 하면 된다.
 *
 *   node observatory/verify-wiki.mjs              ← 스스로 클론해서 **바이트로** 대조한다
 *   node observatory/verify-wiki.mjs <디렉터리>    ← 받아 둔 본문과 대조한다(예전 길)
 *
 * ⛔ git 위키에는 **정규화를 걸지 않는다.** git 은 바이트를 그대로 들고 있어서 왕복이
 *    글자를 안 바꾼다(실측: 7장 전부 정규화 없이 동일). 정규화는 **사람 수정이 숨을 수 있는
 *    곳**이라, 필요 없어졌으면 걷어내는 것이 맞다. 아래 `normalize` 는 **예전 길에서만** 쓴다.
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
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';
import { wikiRemoteOf } from '../lib/wiki-remote.mjs';

const run = promisify(execFile);

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe'], 'universe wiki');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
let wikiDir = argv.find((token) => !token.startsWith('--'));

/**
 * 디렉터리를 안 주면 **스스로 가져온다.** 주소는 `origin` 에서 파생한다 — 좌표를 안 적는다.
 * ⛔ 못 가져오면 「다르다」가 아니라 **「못 쟀다」**다(§8). 위키가 아직 없을 수도,
 *    자격증명이 없을 수도 있는데 둘 다 **발행본이 틀렸다는 뜻이 아니다.**
 */
let fetchedDir = null;
if (!wikiDir) {
  const originUrl = await run('git', ['remote', 'get-url', 'origin'], { cwd: ROOT })
    .then((r) => r.stdout.trim())
    .catch(() => '');
  const derived = wikiRemoteOf(originUrl);
  if (derived === null) {
    console.log('⚠️ **못 쟀다** — `origin` 이 GitHub 이 아니거나 비어 있어 위키 주소를 못 세웠다.');
    console.log('   ⛔ 모르는 호스트의 위키 주소를 지어내지 않는다. 받아 둔 디렉터리를 주면 그것과 대조한다.');
    process.exit(0);
  }
  fetchedDir = await mkdtemp(join(tmpdir(), 'universe-wiki-verify-'));
  const cloned = await run('git', ['clone', '--depth', '1', derived.url, fetchedDir], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).then(() => true).catch(() => false);
  if (!cloned) {
    console.log(`⚠️ **못 쟀다** — 위키를 못 가져왔다: ${derived.url}`);
    console.log('   위키가 아직 한 장도 없거나(Wiki 탭에서 첫 장을 만들어야 git 저장소가 생긴다),');
    console.log('   자격증명이 없다. ⛔ 둘 다 **발행본이 틀렸다는 뜻이 아니다** — 통과로도 실패로도 세지 않는다.');
    await rm(fetchedDir, { recursive: true, force: true }).catch(() => {});
    process.exit(0);
  }
  wikiDir = fetchedDir;
  console.log(`── 위키를 스스로 가져왔다 — ${derived.url}`);
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
  /* ⛔ 스스로 클론해 온 것(git 위키)은 **바이트 그대로** 본다 — 정규화할 이유가 없고,
     정규화는 사람 수정이 숨는 곳이다. 받아 둔 본문(예전 길)만 왕복 정규화를 건다. */
  const a = fetchedDir ? localText.trim() : normalize(localText);
  const b = fetchedDir ? wikiText.trim() : normalize(wikiText);
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

/**
 * 관측 법칙 §8 — 한 장도 못 받았으면 「같다」가 아니라 「못 쟀다」이다.
 *
 * ⛔⛔ **종료코드도 그렇게 말해야 한다.** 예전엔 이 자리가 **1** 이었다 — 그런데 1 은
 * 이 우주에서 **「어긋난 곳이 있다」**의 코드다. 「본문을 못 받았다」와 「본문이 다르다」가
 * **종료코드로 구별되지 않았다.** 화면은 옳게 말하는데 **기계는 틀리게 말한 것**이다.
 * ⚠️ 옆 저장소 세션이 자기 검사기 둘에서 같은 충돌을 찾아(입력 없음 → 「한도 초과」와 같은 코드)
 * 규약에 맞춰 옮겼다는 말을 듣고, 여기서도 셌다.
 *
 * ⚠️ 가르는 기준을 적어 둔다(아홉 자리를 다 읽고 정했다):
 *   · **입력이 안 왔다 · 환경이 없다** → ⚪ **못 쟀다**(3). 도구는 멀쩡하다.
 *   · **훑개가 고장 났다 · 배분표를 못 읽었다** → ❌(1). 도구가 낡은 것이라 **고쳐야 한다.**
 */
if (missing === localFiles.length) {
  console.error('\n⚪ **못 쟀다** — 본문을 한 장도 못 받았다. 통과가 아니라 **아무것도 못 잰 것**이다.');
  console.error('   본문을 받아다 주고 다시 불러라 — 이 도구는 위키를 스스로 못 읽는다.');
  process.exit(EXIT_UNMEASURED);
}
if (differing > 0) {
  console.error(`\n⛔ 위키가 손으로 고쳐진 장 ${differing}개. 저장소를 고치고 다시 발행하라 — 위키가 정본이 아니다.`);
  process.exit(1);
}
if (fetchedDir) {
  await rm(fetchedDir, { recursive: true, force: true }).catch(() => {});
}
console.log(`\n✅ 받아 온 ${localFiles.length - missing}장이 발행본과 같다${missing > 0 ? ` (${missing}장은 못 받아 못 쟀다)` : ''}.`);
