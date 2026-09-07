#!/usr/bin/env node
/**
 * 관측소 — **동작을 잰다.** `observe.mjs` 가 법칙 위반을 세는 곳이라면,
 * 여기는 별이 실제로 도는지(게이트)와 법칙을 지키는지(관문)를 한 번에 본다.
 *
 *   node observatory/verify.mjs --galaxy 실측 은하 A
 *   node observatory/verify.mjs --galaxy 실측 은하 A --static-only   판정 레인 끄기
 *   node observatory/verify.mjs --galaxy 실측 은하 A --base HEAD~1   변경분 기준
 *
 * 순서가 곧 설계다: **관문 → 게이트**.
 * 관문이 싸기 때문이다 — 이름 하나 때문에 20분짜리 빌드를 돌릴 이유가 없다.
 *
 * ⛔ 게이트는 여기서 중앙 집중으로 한 번만 돈다. 타입 인지 lint 저장소에서 동시 실행하면
 *    `eslint ./src` 가 10.3초 → 21분이 된다(실측).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { requireUniverseHome } from '../lib/home.mjs';
import { openEngine } from '../lib/engine.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { resolveGalaxyPath } from '../lib/galaxy-load.mjs';

/** `--universe <경로>` 를 argv 에서 먼저 꺼낸다(우주의 집을 찾기 전에 필요하다). */
const argvUniverse = () => {
  const i = process.argv.indexOf('--universe');
  return i === -1 ? undefined : process.argv[i + 1];
};

/* 우주의 집은 cwd 에서 찾는다 — 패키지 안이 아니다(lib/home.mjs 참고). */
const root = await requireUniverseHome(argvUniverse());
const argv = process.argv.slice(2);
/* 관측 법칙 §7 — 은하를 찾기 **전에** 거부한다.
   전엔 없는 은하 오류가 먼저 나서 「플래그 때문에 죽었는지」를 가릴 수 없었다. */
/* ⛔ `--stage` 를 뺐다 — **허용만 하고 읽는 코드가 없었다**(실측 R72).
   §7 이 막으려던 것의 **뒤집힌 형태**다: 도구가 아는 입력을 받고도 모드를 안 켠다.
   사람에게는 똑같이 보인다 — 「켰는데 안 켜졌다」. 없는 것은 광고하지 않는다. */
rejectUnknownFlags(argv, ['--universe', '--galaxy', '--static-only', '--base'], 'universe verify');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const config = JSON.parse(await fs.readFile(path.join(root, 'universe.config.json'), 'utf8'));
const gname = flag('--galaxy') ?? config.galaxies[0];
const g = resolveGalaxyPath(root,
  JSON.parse(await fs.readFile(path.join(root, 'galaxies', `${gname}.json`), 'utf8')));

/* 관측 장치.
   ⚠️⚠️ **여기가 `resolveEngine` 을 import 해 놓고 안 쓰고 있었다.** 경로를 직접 이어 붙였고,
   소비 저장소에서는 `observatory.path` 가 빈 문자열이라 `?? ` 가 안 걸려
   `<우주홈>/packages/@plugins/…` 라는 **없는 자리**를 가리켰다.
   실측(R46): 진짜 은하에서 `--expand` 를 돌리자 날 Node 스택(`ERR_MODULE_NOT_FOUND`)이
   튀어나왔고, 우주는 「관측소가 죽었거나 은하 좌표가 틀렸다」고 **엉뚱하게 짚었다.**
   ⇒ `observe` 와 **같은 해결기**를 쓴다. 엔진 찾기가 두 자리에 따로 있으면 또 갈라진다. */
const { enginePath, reactVite, verifyTree } = await openEngine(root, config, ['reactVite', 'verifyTree']);
const { ReactViteHarness } = reactVite;
const { verifyWorkingTree } = verifyTree;

/* 법칙 → 규칙 묶음. 은하가 켠 법칙만 관문에 건다. */
const lawFile = async (n) => fs.readFile(path.join(root, 'laws', `${n}.md`), 'utf8');
const presets = new Set();
for (const name of g.laws) {
  const text = await lawFile(name);
  const rules = (/^rules:\s*\[(.*)\]$/m.exec(text)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of rules) {
    const head = id.split('/')[0];
    presets.add({ tailwind: 'tailwind', a11y: 'a11y', quality: 'toss', repo: 'house-style', ts: 'house-style' }[head]);
  }
}

console.log(`── 은하 ${gname}`);
console.log(`   경로   ${g.path}`);
console.log(`   법칙   ${g.laws.join(' · ')}`);
console.log(`   묶음   ${[...presets].join(' · ')}\n`);

const harness = new ReactViteHarness({
  repoRoot: g.path,
  paths: { appWorkspace: g.appWorkspace, appDir: g.appDir, distDir: 'dist' },
  commands: g.commands,
  lintTargets: g.lintTargets,
  contractPresets: [...presets],
  contractStaticOnly: argv.includes('--static-only'),
});

const result = await verifyWorkingTree({ harness, baseRef: flag('--base') ?? 'HEAD' });
process.exit(result.ok ? 0 : 1);
