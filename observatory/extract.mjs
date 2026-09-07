#!/usr/bin/env node
/**
 * **성공 궤적 → 지식 카드** — 학습 고리의 **돌아오는 절반**을 잇는다(R155).
 *
 * ## 왜 이 파일이 없었나 — 그게 결함이었다
 *
 * 이 우주에는 바퀴가 둘인데 **한 쪽만 이어져 있었다**:
 *   · 실패 궤적 → 성운 후보 — `observatory/learn.mjs`. **관문에 등재돼 돈다.** ✅
 *   · 성공 궤적 → 지식 카드 — `extractWikiCards`. 엔진 안에 있고 자기 시험까지 있는데
 *     **우주가 부르는 곳이 하나도 없었다.** 배달도 안 됐다. ⛔
 * 즉 지식이 **나가기만 하고 돌아오지 않았다.** R09 가 「EnvHarness 를 채점기로만 쓴다」고
 * 적어 둔 자리의 나머지 반쪽이다.
 *
 * ## ⛔ 이것은 모델을 부른다 — 그래서 기본이 안전해야 한다
 *
 * 궤적 **한 건마다 한 번** 모델을 부른다. 그래서:
 *   · `--dry-run` 이 **기본**이다. 무엇이 카드가 될지만 보여 주고 **모델을 안 부른다.**
 *   · 진짜로 뽑으려면 `--write` 를 줘야 한다. 그때 **몇 건을 부를지 먼저 말한다.**
 * ⚠️ 「공짜인 줄 알고 돌렸다」가 이 저장소가 가장 싫어하는 사건이다(R145).
 *
 * ## 카드는 **은하 곁에** 산다
 * 카드는 그 은하의 관례에서 나온 것이라 우주의 것이 아니다 —
 * `<은하>/universe/knowledge/` 에 쌓는다(`universe/` 는 그 팀이 커밋하는 자리다).
 *
 * 재는 법:
 *   node observatory/extract.mjs --galaxy tiny-galaxy            # 무엇이 될지만 본다(모델 0회)
 *   node observatory/extract.mjs --galaxy tiny-galaxy --write    # 진짜로 뽑는다(모델 N회)
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { findGalaxyFile, resolveGalaxyPath } from '../lib/galaxy-load.mjs';
import { openEngine } from '../lib/engine.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--galaxy', '--write', '--model'], 'universe extract');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const root = await requireUniverseHome(flag('--universe'));
const config = JSON.parse(await readFile(path.join(root, 'universe.config.json'), 'utf8'));
const galaxyName = flag('--galaxy') ?? config.galaxies?.[0];

const file = await findGalaxyFile(root, galaxyName);
if (!file) {
  console.error(`⛔ 없는 은하: ${galaxyName}\n   등록된 것: ${(config.galaxies ?? []).join(' · ') || '(없음)'}`);
  process.exit(1);
}
const galaxy = resolveGalaxyPath(root, JSON.parse(await readFile(file, 'utf8')));

/* ── 무엇이 카드가 될 수 있나 ─────────────────────────────── */

const trajectoryDir = path.join(galaxy.path, '.harness', 'trajectories');
const files = (await readdir(trajectoryDir).catch(() => []))
  .filter((name) => name.endsWith('.jsonl'))
  .map((name) => path.join(trajectoryDir, name));

console.log(`── 지식 추출 — 은하 ${galaxyName}`);
console.log(`   궤적   ${trajectoryDir}`);

/* 관측 법칙 §8 — 0 은 무죄가 아니다. 궤적이 없으면 **못 쟀다**이지 「배울 것이 없다」가 아니다. */
if (files.length === 0) {
  console.log('\n⚠️ **못 쟀다** — 궤적이 하나도 없다. 3차 팽창을 한 번 돌린 뒤에 다시 불러라.');
  process.exit(EXIT_UNMEASURED);
}

/**
 * 성공한 것만 카드가 된다 — `extractWikiCards` 가 안에서 다시 거르지만,
 * **몇 건을 부를지 먼저 말하려면** 여기서도 세어야 한다. ⛔ 모델을 부르기 전에 수를 말한다.
 */
const solved = [];
for (const target of files) {
  const rows = (await readFile(target, 'utf8')).split('\n').filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
  /* 3차는 `nebula-end` 의 decision, 훈련 스테이지는 submit 의 decision 으로 끝을 적는다. */
  const green = rows.some((r) => (r.kind === 'nebula-end' && r.decision === 'GREEN')
    || (r.kind === 'submit' && r.decision === 'SOLVED'));
  if (green) {
    solved.push(target);
  }
}

console.log(`   궤적 ${files.length}건 중 **성공 ${solved.length}건** — 카드는 성공에서만 나온다.`);
if (solved.length === 0) {
  console.log('\n⚠️ **뽑을 것이 없다** — 성공한 궤적이 없다. 실패는 카드가 아니라 성운으로 간다(`universe learn`).');
  process.exit(0);
}

/* ── ⛔ 기본은 안 부른다 ───────────────────────────────────── */

const knowledgeDir = path.join(galaxy.path, 'universe', 'knowledge');
const indexPath = path.join(galaxy.path, 'universe', 'KNOWLEDGE.md');

if (!argv.includes('--write')) {
  console.log('\n(--write 를 안 줬다 — **모델을 부르지 않는다.** 뽑으면 이렇게 된다:)');
  for (const target of solved) {
    console.log(`   · ${path.basename(target)}`);
  }
  console.log(`\n   카드가 쌓일 곳: ${path.relative(process.cwd(), knowledgeDir)}`);
  console.log(`   진짜로 뽑으려면: node observatory/extract.mjs --galaxy ${galaxyName} --write`);
  console.log(`   ⛔ 그때 **모델을 ${solved.length}번** 부른다 — 궤적 한 건에 한 번이다.`);
  process.exit(0);
}

console.log(`\n⛔ **모델을 ${solved.length}번 부른다** (궤적 한 건에 한 번).`);

const { contracts } = await openEngine(root, config, ['contracts']);
const cards = await contracts.extractWikiCards(solved, {
  repoRoot: galaxy.path,
  knowledgeDir,
  indexPath,
  /* 이미 문서가 말하고 있는 것을 카드로 만들지 않기 위해 넣는다. 없으면 안 넣는다 — 지어내지 않는다. */
  houseRulesPath: path.join(galaxy.path, 'CLAUDE.md'),
  skillDescription: `${galaxyName} 은하에서 성공한 주행에서 뽑은 지식. ⛔ 손으로 고치지 마라 — 다시 뽑으면 덮인다.`,
  regenerateCommand: `node observatory/extract.mjs --galaxy ${galaxyName} --write`,
  model: flag('--model'),
});

console.log(`\n✅ 카드 ${cards.length}장 — ${path.relative(process.cwd(), knowledgeDir)}`);
console.log('⚠️ **이 카드가 다음 주행을 낫게 하는지는 아직 안 쟀다**(§8).');
console.log('   브리핑에 넣으려면 `universe new … --from … --skills` 를 줘라 — **기본은 꺼져 있다.**');
