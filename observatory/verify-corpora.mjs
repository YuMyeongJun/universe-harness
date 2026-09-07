#!/usr/bin/env node
/**
 * 말뭉치 감사 — **인용한 수치의 대상이 아직 있는가.**
 *
 * ⛔ 실측(R103): 겸업 규칙의 오탐률(13건 중 2건)을 다시 재려 했더니 **그 저장소가 없었다.**
 * 12건이 거기 있었다. 문서는 그 수치를 「실측」으로 인용하는데, 「실측」은 읽는 사람에게
 * **「지금도 확인할 수 있다」**로 들린다. ⚠️ 판단은 그대로 유효하다 — **수치의 재현성만** 다르다.
 *
 * 「재현 불가 0개」가 목표가 아니다(그건 거짓이 된다). **「판단하지 않은 말뭉치 0개」**가 목표다.
 *
 * 재는 법: `node observatory/verify-corpora.mjs`
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe'], 'universe corpora');
const ROOT = resolve(new URL('..', import.meta.url).pathname);
await requireUniverseSource(ROOT, 'universe corpora');

const registry = JSON.parse(await readFile(join(ROOT, 'observatory/corpora.json'), 'utf8'));
const known = new Map(registry.corpora.map((c) => [c.files, c]));

/* 문서가 인용하는 「파일 N개」·「N개 파일」 꼴을 모은다. 쉼표는 걷어낸다. */
const files = ['README.md'];
/* ⚠️ 문서만 훑으면 **규칙 주석의 인용을 놓친다** — `3,058` 이 거기 있었다(실측).
   내가 훑개를 만들 때마다 열거가 된다(§9). 인용은 코드 주석에도 산다. */
for (const f of await readdir(join(ROOT, 'observatory/engine/packages/@core/fe-agent-contracts/src/rules')).catch(() => [])) {
  if (f.endsWith('.ts')) {
    files.push(`observatory/engine/packages/@core/fe-agent-contracts/src/rules/${f}`);
  }
}
for (const dir of ['docs', 'laws']) {
  for (const f of await readdir(join(ROOT, dir)).catch(() => [])) {
    if (f.endsWith('.md')) {
      files.push(`${dir}/${f}`);
    }
  }
}
const cited = new Map();
for (const file of files) {
  const text = await readFile(join(ROOT, file), 'utf8').catch(() => '');
  /* ⛔ **「개」만 보면 출현 횟수를 말뭉치로 읽는다** — `<Input> 350개` 가 그렇게 잡혔다(실측).
     말뭉치는 **「파일」이 붙어 있는 수**다. 붙어 있지 않으면 말뭉치가 아니다. */
  for (const m of text.matchAll(/파일\s*([\d,]{3,})\s*개|([\d,]{3,})\s*(?:개\s*)?파일/g)) {
    const raw = m[1] ?? m[2];
    const n = Number(raw.replace(/,/g, ''));
    /* 세 자리 미만·연도는 말뭉치가 아니다. */
    if (!Number.isFinite(n) || n < 100 || (n > 1900 && n < 2100)) {
      continue;
    }
    if (!cited.has(n)) {
      cited.set(n, file);
    }
  }
}

console.log(`── 말뭉치 감사 — 명부 ${registry.corpora.length}개 · 문서가 인용한 수 ${cited.size}개`);
/**
 * ⛔⛔ **인용을 하나도 못 찾았으면 「전부 판단돼 있다」가 아니라 「훑개가 고장 났다」다**(§8).
 *
 * 실측: `files` 를 비워 봤더니 화면이 **「✅ 인용한 수 0개가 전부 판단돼 있다」**로 초록이었다.
 * 이 검사의 분모는 **명부**가 아니라 **문서에서 찾은 인용**인데, 그 수가 0이어도 아무 말이 없었다.
 * ⇒ 판단 안 한 인용이 새로 생겨도 훑개가 죽어 있으면 **영원히 조용하다.**
 * ⚠️ 옆 저장소 세션이 자기 검사기들을 세어 같은 구멍을 찾았고, 그 이야기를 듣고 여기서도 셌다.
 * ⛔ 하한을 손으로 적지 않는다 — **0인가**만 본다. 그건 어느 저장소에서도 참이라 낡지 않는다.
 */
if (cited.size === 0) {
  console.error('\n⛔ 문서에서 인용한 수를 **하나도 못 찾았다** — 훑개가 고장 났다(§8).');
  console.error(`   훑은 파일 ${files.length}개. 「0개가 전부 판단돼 있다」는 통과가 아니다.`);
  process.exit(1);
}

const unjudged = [...cited].filter(([n]) => !known.has(n));
const stale = registry.corpora.filter((c) => c.files >= 100 && !cited.has(c.files));

if (unjudged.length > 0) {
  console.error(`\n⛔ 명부에 없는 인용 ${unjudged.length}건 — **재현 가능한지 아무도 판단 안 했다**:`);
  for (const [n, where] of unjudged) {
    console.error(`   ${n} (${where})`);
  }
  console.error('   observatory/corpora.json 에 `reproducible` 과 사유를 적어라.');
  process.exit(1);
}
if (stale.length > 0) {
  console.log(`  ⚠️ 이제 아무 문서도 안 쓰는 말뭉치 ${stale.length}개: ${stale.map((c) => c.files).join(' · ')}`);
  console.log('     지워도 된다 — 다만 그 판단도 사람이 한다.');
}
const cannot = registry.corpora.filter((c) => !c.reproducible);
console.log(`  ✅ 인용한 수 ${cited.size}개가 전부 판단돼 있다.`);
console.log(`  ⚠️ 그중 **다시 못 재는 말뭉치 ${cannot.length}개**: ${cannot.map((c) => `${c.id}(${c.files})`).join(' · ')}`);
console.log('     「실측」이라 적혀 있어도 **지금 확인할 수는 없다** — 그때의 기록이다.');
