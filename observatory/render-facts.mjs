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
import { GATES } from '../lib/gates.mjs';
import { dailyCommands, gateCommands } from '../lib/commands.mjs';
import { openEngine } from '../lib/engine.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--check'], 'universe facts');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/* 배달본에서 직접 부르면 사유를 대고 죽는다 — 생 스택트레이스 대신(R91). */
await requireUniverseSource(ROOT, 'universe facts');
/* ⚠️ README 의 상태 절도 **여덟 판 동안 낡아 있었다**(R84) — 가장 먼저 읽히는 자리다. */
const DOCS = [join(ROOT, 'docs/04-results.md'), join(ROOT, 'README.md'), join(ROOT, 'docs/README.md'), join(ROOT, 'docs/02-usage.md')];
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
  /**
   * ⛔ **관문 수와 명령 수도 생성한다** — 둘 다 손으로 적혀 있다가 낡았다.
   *   · `docs/04-results.md` 가 「관문은 **지금** 25개」라 했는데 26개였다.
   *   · `docs/README.md` 가 「명령 **여섯 개**」라 했는데 32개였다 —
   *     ⚠️ `docs/02-usage.md` 는 **자기 머리말에서 똑같은 일을 겪었다고 적어 두고도**
   *        옆 문서의 같은 문장은 그대로였다(R53). 손 목록은 한 자리만 고쳐진다.
   * ⇒ 「지금 상태다」라고 **주장하는 수치**는 전부 이 블록으로 들어온다.
   */
  `| 관문(\`universe check\`) | ${GATES.length} |`,
  `| 명령 | ${dailyCommands().length + gateCommands().length} |`,
  `| ↳ 사람이 치는 것 | ${dailyCommands().length} |`,
  `| ↳ 관문이 알아서 부르는 것 | ${gateCommands().length} |`,
  `| 판 | ${config.version} |`,
].join('\n');

/**
 * ── **등록된 은하 목록도 생성한다.**
 *
 * ⚠️⚠️ 실측(2026-09-08): `galaxies/README.md` 의 「등록된 은하」 표가 **`_(아직 없음)_`** 이었다.
 * 실제로는 넷이 등록돼 있었다. 은하가 하나도 없다는 말은 이 제품에서 **「실측 대상이 없다」**는
 * 뜻이라 가장 무거운 거짓말이고, 하필 은하 문서의 첫 표가 그 말을 하고 있었다.
 * ⛔ 손으로 적으면 또 낡는다 — 좌표 파일이 정본이고 이 표는 그 그림자다.
 *
 * ⛔ **경로는 안 찍는다.** 안쪽 은하는 상대 경로지만 남의 저장소는 절대 경로이고,
 * 그것이 공개 저장소에 올라간 사고가 이미 있었다(R152 · 좌표 감사가 그래서 생겼다).
 * 여기 도는 것은 `galaxies/` 뿐이고 `galaxies.local/` 은 **안 본다** — 거기가 남의 좌표가 사는 자리다.
 */
const GALAXIES_DOC = join(ROOT, 'galaxies/README.md');
const GALAXY_BEGIN = '<!-- GALAXIES:BEGIN -->';
const GALAXY_END = '<!-- GALAXIES:END -->';

const galaxyRows = [];
for (const name of config.galaxies) {
  const g = JSON.parse(await readFile(join(ROOT, 'galaxies', `${name}.json`), 'utf8').catch(() => 'null'));
  if (!g) { galaxyRows.push(`| \`${name}\` | ⛔ 좌표 파일이 없다 | — | — |`); continue; }
  const cmds = Object.keys(g.commands ?? {}).filter((k) => !k.startsWith('//'));
  galaxyRows.push(`| \`${g.name ?? name}\` | ${g.laws?.length ?? 0}개 | ${g.solarSystems?.length ?? 0}개 | ${cmds.length ? cmds.map((c) => `\`${c}\``).join(' · ') : '—'} |`);
}
const galaxyBody = [
  `| 은하 | 켠 법칙 | 태양계 | 선언한 명령 |`,
  `|---|---:|---:|---|`,
  ...galaxyRows,
].join('\n');

const BLOCKS = [
  ...DOCS.map((doc) => ({ doc, begin: BEGIN, end: END, body })),
  { doc: GALAXIES_DOC, begin: GALAXY_BEGIN, end: GALAXY_END, body: galaxyBody },
];

let stale = 0;
for (const { doc, begin, end, body: blockBody } of BLOCKS) {
  const text = await readFile(doc, 'utf8');
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start === -1 || stop === -1) {
    console.error(`⛔ ${doc} 에 ${begin} / ${end} 표식이 없다.`);
    process.exit(1);
  }
  const next = `${text.slice(0, start + begin.length)}\n${blockBody}\n${text.slice(stop)}`;
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
  console.log(`✅ 문서 ${BLOCKS.length}편의 「지금 상태」 수치가 실측과 같다.`);
  process.exit(0);
}
console.log(`✅ 문서 ${BLOCKS.length}편의 「지금 상태」를 다시 적었다 — 법칙 ${config.laws.length} · 규칙 ${rules.length} · 주인 없는 규칙 ${orphans.length} · 은하 ${config.galaxies.length}`);
