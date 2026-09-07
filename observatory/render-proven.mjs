#!/usr/bin/env node
/**
 * 발동이 증명된 규칙 명부 — **생성한다. 손으로 적지 않는다.**
 *
 * ⛔ 왜: `observe` 는 무발동 규칙을 보면 「0건은 무죄가 아니다 — 규칙이 약한 것인지 위반이
 * 없는 것인지는 따로 재야 안다(§8)」고 말한다. 옳은 말이지만 **답이 아니다.** 소비 팀은
 * 그 「따로 재는 것」을 할 수 없다 — 더러운 은하는 배달되지 않기 때문이다.
 *
 * 실측(R93): 진짜 은하(파일 1407개)에서 13개 중 3개가 침묵했다. 손으로 known-positive 를
 * 심어 보니 **셋 다 발동했다** — 침묵은 무죄였다. 그런데 이 확인을 팀마다 손으로 할 수는 없다.
 * 더러운 은하는 **모든 규칙을 발동시킨다**(실측). 그 사실을 명부로 만들어 배달한다.
 *
 * ⚠️ 손 목록으로 적으면 규칙이 늘 때 낡는다(R91 이 진입점 목록에서 겪었다). 그래서 **잰다.**
 *
 * 재는 법: `node observatory/render-proven.mjs --check`
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--check'], 'universe proven');
const ROOT = resolve(new URL('..', import.meta.url).pathname);
await requireUniverseSource(ROOT, 'universe proven');

const OUT = join(ROOT, 'observatory/rules-proven.json');

/* ⛔ 출처는 **규칙 표(RULE_MATRIX)** 다 — 더러운 은하를 만드는 바로 그 표라, 여기 있는 규칙은
   전부 known-positive 를 갖는다. 은하 기준선은 **법칙별 수치만** 적어서 못 쓴다(실측).
   ⚠️ 「표에 있다」와 「정말 발동한다」는 다르다 — 후자는 더러운 은하의 `expectAllRulesFire`
   가 이미 본다(무발동이면 빨간불). 그래서 이 명부는 그 관문 위에서만 참이다. */
const { RULE_MATRIX } = await import(
  join(ROOT, 'observatory/engine/packages/@core/fe-agent-contracts/src/selftest.ts')
);
const fired = [...new Set(RULE_MATRIX.map((r) => r.id))].sort();

if (fired.length === 0) {
  console.error('⛔ 규칙 표가 비었다 — 명부를 만들면 「아무 규칙도 발동 안 한다」가 배달된다(§8).');
  process.exit(1);
}

const body = `${JSON.stringify({
  '//': '생성물이다. 손으로 고치지 마라 — `universe proven` 이 더러운 은하 실측에서 만든다.',
  '//왜': '무발동 규칙을 본 팀이 「규칙이 약한 것인가」를 스스로 물을 수 없기 때문이다(§8). 여기 있는 규칙은 더러운 은하에서 발동함이 확인됐다.',
  provenRules: fired,
}, null, 2)}\n`;

const current = await readFile(OUT, 'utf8').catch(() => null);
if (argv.includes('--check')) {
  if (current !== body) {
    console.error('⛔ 발동 증명 명부가 낡았다 — 규칙이 늘거나 줄었다.');
    console.error('   `node observatory/render-proven.mjs` 로 다시 만들어라.');
    process.exit(1);
  }
  console.log(`✅ 발동 증명 명부가 지금 실측과 같다 (규칙 ${fired.length}개).`);
  process.exit(0);
}
await writeFile(OUT, body, 'utf8');
console.log(`✅ 발동 증명 명부를 만들었다 — 규칙 ${fired.length}개.`);
