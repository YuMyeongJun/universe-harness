#!/usr/bin/env node
/**
 * **문서의 「지금 상태」 수치를 생성한다.**
 *
 * ⚠️⚠️ 이 저장소는 수치를 손으로 적었다가 **여섯 번 낡았다**(자기 CLAUDE 규율에 그렇게 적혀 있다).
 * 실측(R55): README 가 「법칙 8개」라고 적어 뒀는데 실제는 10개, `04-results` 의 예시 출력은
 * 「법칙 5개 · 규칙 17개」인데 지금 픽스처는 6개·19개였다.
 *
 * ⛔ **모든 수치를 생성하지 않는다.** 예시 출력과 이력 기록은 낡는 것이 아니라 **그때의 기록**이다.
 * 생성하는 것은 「지금 상태다」라고 **주장하는 자리**뿐이다.
 *
 *   node observatory/render-facts.mjs            # 채운다
 *   node observatory/render-facts.mjs --check     # 낡았으면 exit 1
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { frontmatter } from '../lib/frontmatter.mjs';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { openEngine } from '../lib/engine.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--check'], 'universe facts');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/* 배달본에서 직접 부르면 사유를 대고 죽는다 — 생 스택트레이스 대신(R91). */
await requireUniverseSource(ROOT, 'universe facts');
/* ⚠️ README 의 상태 절도 **여덟 판 동안 낡아 있었다**(R84) — 가장 먼저 읽히는 자리다. */
const DOCS = [join(ROOT, 'docs/04-results.md'), join(ROOT, 'README.md')];
const BEGIN = '<!-- FACTS:BEGIN -->';
const END = '<!-- FACTS:END -->';

const config = JSON.parse(await readFile(join(ROOT, 'universe.config.json'), 'utf8'));
const { contracts } = await openEngine(ROOT, config, ['contracts']);
const rules = Object.values(contracts.RULE_PRESETS).flat().map((r) => r.id);

const lawRules = new Set();
for (const law of config.laws) {
  const text = await readFile(join(ROOT, 'laws', `${law}.md`), 'utf8').catch(() => '');
  for (const id of (frontmatter(text).rules ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)) {
    lawRules.add(id);
  }
}
const orphans = rules.filter((id) => !lawRules.has(id));

const body = [
  `| 지금 상태 | 값 |`,
  `|---|---:|`,
  `| 법칙 | ${config.laws.length} |`,
  `| 계약 규칙 | ${rules.length} |`,
  `| ↳ 법칙이 덮은 것 | ${rules.length - orphans.length} |`,
  `| ↳ 성운이 든 것(주인 없는 규칙) | ${orphans.length} |`,
  `| 등록된 은하 | ${config.galaxies.length} |`,
  `| 판 | ${config.version} |`,
].join('\n');

let stale = 0;
for (const doc of DOCS) {
  const text = await readFile(doc, 'utf8');
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (start === -1 || stop === -1) {
    console.error(`⛔ ${doc} 에 ${BEGIN} / ${END} 표식이 없다.`);
    process.exit(1);
  }
  const next = `${text.slice(0, start + BEGIN.length)}\n${body}\n${text.slice(stop)}`;
  if (argv.includes('--check')) {
    if (next !== text) { stale += 1; console.error(`⛔ 낡았다: ${doc}`); }
    continue;
  }
  await writeFile(doc, next, 'utf8');
}
if (argv.includes('--check')) {
  if (stale > 0) {
    console.error('   `node observatory/render-facts.mjs` 로 다시 채워라.');
    process.exit(1);
  }
  console.log(`✅ 문서 ${DOCS.length}편의 「지금 상태」 수치가 실측과 같다.`);
  process.exit(0);
}
console.log(`✅ 문서 ${DOCS.length}편의 「지금 상태」를 다시 적었다 — 법칙 ${config.laws.length} · 규칙 ${rules.length} · 주인 없는 규칙 ${orphans.length}`);
