#!/usr/bin/env node
/**
 * **규칙이 사람이 정한 이름을 열거하고 있는가** — 관측 법칙 §9 의 재는 법.
 *
 * ⚠️ 같은 고장이 **네 번** 났다. `svg`·`Icon*` 만 아는 규칙, `?` 를 세다 `??` 를 오인한 규칙,
 * 소문자 `input` 만 보는 규칙, Tailwind 접두사를 열거한 규칙.
 * **넷 다 자기 코드에서는 안 보였다** — 우리가 안 쓰는 작명은 우리 말뭉치에 없기 때문이다.
 *
 * ⛔ **「열거 0개」가 목표가 아니다.** 언어가 정한 이름(`div`·`button`·`className`)은
 * 열거해도 안 낡는다. 위험한 것은 **사람이 정하는 이름**이다.
 * ⇒ 목표는 **「판단하지 않은 열거 0개」** — 이름 충돌 검사(R22)와 같은 방식이다.
 *
 * 재는 법:
 *   node observatory/verify-enumeration.mjs            # 0=판단 안 된 열거 없음
 *   node observatory/verify-enumeration.mjs --update    # 지금 열거를 기준선에 적는다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

/** 「아직 안 적음」 표식. ⚠️ 처음엔 `⚠️` 로 썼는데 **사람이 판단에 주의사항을 달 때도
 *  `⚠️` 를 쓴다.** 표식이 겹치면 제대로 적은 판단이 「안 적음」으로 보인다 — 실제로 그랬다.
 *  표식은 사람이 안 쓸 모양이어야 한다. */
const PLACEHOLDER = 'TODO:';
/* 기준선은 옛 모양(문자열)과 새 모양(`{열거, 판단}`) 둘 다 읽는다 — 갈아타는 동안 깨지지 않게. */
const reasonOf = (entry) => (typeof entry === 'string' ? entry : entry?.판단);
const namesOf = (entry) => (typeof entry === 'string' ? null : entry?.열거);


const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--update'], 'universe enumeration');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/* 배달본에서 직접 부르면 사유를 대고 죽는다 — 생 스택트레이스 대신(R91). */
await requireUniverseSource(ROOT, 'universe enumeration');
const RULES_DIR = join(ROOT, 'observatory/engine/packages/@core/fe-agent-contracts/src/rules');
const BASELINE = join(ROOT, 'observatory/enumeration-baseline.json');

/* 정규식 안의 단어 중 이것들은 문법·플래그라 이름이 아니다. */
const NOISE = new Set(['test', 'exec', 'gimsuy', 'gm', 'gi']);

const files = (await readdir(RULES_DIR)).filter((name) => name.endsWith('.ts') && name !== 'index.ts');
const found = [];

for (const file of files) {
  const text = await readFile(join(RULES_DIR, file), 'utf8');
  /* ⛔ **거리 창(900자)으로 짝지었더니 가장 큰 열거를 놓쳤다(R109).**
     `quality/naming-intent` 는 id 와 pattern 사이 주석이 길어 창 밖으로 밀렸다 —
     **그릇 낱말 25개를 나열하는 규칙**이 열거 감사에 안 보였다.
     R35 가 처방을 뽑을 때 배운 것과 같다: **`id:` 경계로 자른다.** 거리로 짝짓지 않는다. */
  /* ⛔ **정규식 밖의 열거는 아무도 안 봤다(R111).** 규칙 파일의 **모듈 수준 상수**
     (`const HTTP_STATUS = new Set([...])`)는 규칙 안이 아니라 파일 꼭대기에 산다 —
     `id:` 로 자른 조각 어디에도 안 들어간다. 규칙에 붙이면 **엉뚱한 규칙의 것**이 되므로
     `상수/이름` 으로 따로 센다. */
  for (const m of text.matchAll(/^const ([A-Z][A-Z0-9_]*) = (?:new Set\(\[|\[)([^\]]*)\]/gm)) {
    const [, constName, body] = m;
    const names = [...new Set([...body.matchAll(/'([^']+)'|(\d+)/g)].map((x) => x[1] ?? x[2]))];
    if (names.length === 0) {
      continue;
    }
    found.push({ id: `상수/${constName}`, names });
  }

  const chunks = text.split(/(?=\n\s*id: ')/);
  for (const chunk of chunks) {
    const idMatch = /id: '([\w/-]+)'/.exec(chunk);
    /* ⚠️ 줄 끝에 앵커를 걸었더니 `repo/*` 셋을 잃었다 — 패턴 뒤에 주석이 붙은 줄이 있다.
       **경계는 `id:` 로, 패턴 추출은 느슨하게.** 둘을 섞어야 열여섯이 아니라 열일곱이 나온다. */
    const patternMatch = /pattern: (\/[^\n]+\/)/.exec(chunk);
    if (!idMatch) {
      continue;
    }
    const [, id] = idMatch;
    /* ⛔ **`scan:` 규칙 안의 열거는 아무도 안 봤다(R110).** 감사가 `pattern:` 만 봐서
       규칙 셋(`copy-state`·`cohesion`·`magic-number`)이 통째로 빠져 있었다 — 셋 다
       이름을 쓴다(`default*` 접두사 · `Props` 접미사 · `status`).
       패턴이 없으면 **그 규칙 안의 정규식 전부**를 본다. 넓게 잡고 **판단을 강제**한다. */
    const pattern = patternMatch
      ? patternMatch[1]
      : [...chunk.matchAll(/(?<![\w)\]])\/(?![/*])((?:\\.|\[[^\]]*\]|[^/\n\\])+)\/[gimsuy]*/g)]
        .map((m) => m[0]).join(' ');
    if (pattern === '') {
      continue;
    }
    const names = [...new Set([...pattern.matchAll(/(?<![\\\w])([A-Za-z][A-Za-z0-9]{2,})/g)].map((m) => m[1]))]
      .filter((name) => !NOISE.has(name))
      .sort();
    if (names.length > 0) { found.push({ id, names }); }
  }
}

/* 관측 법칙 §8 — 아무것도 못 훑었으면 통과가 아니다. */
if (files.length === 0 || found.length === 0) {
  console.error(`⛔ 규칙 파일 ${files.length}개에서 패턴을 하나도 못 읽었다 — 훑개가 고장 났다.`);
  process.exit(1);
}

const baseline = await readFile(BASELINE, 'utf8').then((t) => JSON.parse(t)).catch(() => ({}));

if (argv.includes('--update')) {
  const next = {};
  for (const { id, names } of found) {
    next[id] = {
      열거: names,
      판단: reasonOf(baseline[id]) ?? `${PLACEHOLDER} 사유를 적어라 — 언어가 정한 이름인가(안 낡는다), 사람이 정하는 이름인가(낡는다)`,
    };
  }
  await writeFile(BASELINE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const blank = Object.values(next).filter((v) => String(v.판단).startsWith(PLACEHOLDER)).length;
  console.log(`✅ 기준선에 규칙 ${found.length}개를 적었다${blank > 0 ? ` — 그중 ${blank}개는 **사유가 비어 있다.**` : ''}`);
  process.exit(0);
}

console.log(`── 열거 감사 — 패턴에 이름을 쓰는 규칙 ${found.length}개`);
/* ⛔ **열거를 넓혀도 판단을 다시 안 물었다(R110).** 처방 감사는 「문구가 바뀌었는데 판단은
   그대로」를 잡는데(R55) 열거 감사는 **판단한 이름을 기억하지 않았다** — `default*` 를
   `initial*`·`preset*` 까지 넓혀도 초록불이었다. 이름을 같이 적고 바뀌면 다시 묻는다. */
const unjudged = found.filter(({ id }) => {
  const why = reasonOf(baseline[id]);
  return !why || why.startsWith(PLACEHOLDER);
});
/* 이름이 바뀐 것 — 판단은 있지만 **그 판단이 지금 열거를 안 봤다.** */
const drifted = found.filter(({ id, names }) => {
  const was = namesOf(baseline[id]);
  return was !== null && was !== undefined && was.join(' ') !== names.join(' ');
});
const stale = Object.keys(baseline).filter((id) => !found.some((f) => f.id === id));

for (const { id, names } of found) {
  const why = reasonOf(baseline[id]);
  const judged = why && !why.startsWith(PLACEHOLDER);
  console.log(`  ${judged ? '✅' : '⛔'} ${id}`);
  console.log(`       ${judged ? why : `열거: ${names.join(' ')}`}`);
}
if (stale.length > 0) {
  console.log(`\n  ⚠️ 기준선에 있는데 이제 패턴이 없는 규칙 ${stale.length}개: ${stale.join(' · ')}`);
}
if (drifted.length > 0) {
  console.error(`\n⛔ 열거가 바뀌었는데 판단은 그대로인 규칙 ${drifted.length}개: ${drifted.map((d) => d.id).join(' · ')}`);
  for (const d of drifted) {
    console.error(`   ${d.id}\n     기준선: ${namesOf(baseline[d.id]).join(' ')}\n     지금  : ${d.names.join(' ')}`);
  }
  console.error('   다시 읽고 `--update` 한 뒤 사유를 고쳐라 — 넓힌 열거는 새 열거다.');
  process.exit(1);
}
if (unjudged.length > 0) {
  console.error(`\n⛔ 판단하지 않은 열거 ${unjudged.length}개. **「열거 0개」가 아니라 「판단하지 않은 열거 0개」가 목표다.**`);
  console.error('   언어가 정한 이름이면 사유를 적고, 사람이 정하는 이름이면 **의미로** 다시 잡아라(관측 법칙 §9).');
  process.exit(1);
}
console.log(`\n✅ 열거 ${found.length}건 전부 판단돼 있다.`);
