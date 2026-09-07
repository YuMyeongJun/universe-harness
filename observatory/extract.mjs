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
 *
 * ## ⛔ 성공했다고 다 카드가 아니다 — **대본 주행은 뺀다**(R160)
 *
 * 실측(R159): 성공 궤적 **176건 중 175건이 같은 대본**(`--lane script`)이었다. 관문이
 * 커밋마다 돌리는 그 대본이다. 결정론이라 175번 돌려도 하는 말이 같은데, 그대로 뽑으면
 * **같은 카드 175장에 모델 175번**이다. ⇒ 기본으로 뺀다(`--include-script` 로 되돌린다).
 * ⚠️ 레인이 **안 적힌 옛 궤적**은 「모른다」다 — 통과로도 제외로도 안 센다(§8).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { findGalaxyFile, resolveGalaxyPath } from '../lib/galaxy-load.mjs';
import { openEngine } from '../lib/engine.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';
import { laneOf, partitionByLane, SCRIPT_LANE } from '../lib/trajectory-lane.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--galaxy', '--write', '--model', '--include-script'], 'universe extract');
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
    /* ⛔ 레인은 **궤적에서 읽는다**(`nebula-start.lane`) — 파일 이름으로 짐작하지 않는다.
       이름은 사람이 정하는 것이라 대본 별을 `RealRun` 이라 부르면 그대로 속는다. */
    solved.push({ file: target, lane: laneOf(rows) });
  }
}

console.log(`   궤적 ${files.length}건 중 **성공 ${solved.length}건** — 카드는 성공에서만 나온다.`);
if (solved.length === 0) {
  console.log('\n⚠️ **뽑을 것이 없다** — 성공한 궤적이 없다. 실패는 카드가 아니라 성운으로 간다(`universe learn`).');
  process.exit(0);
}

/* ── ⛔ 대본 주행을 뺀다 — 그리고 **몇 건을 왜 뺐는지 말한다**(R160) ──────── */

const { model, script, unknown } = partitionByLane(solved);
const includeScript = argv.includes('--include-script');

console.log(`\n── 레인으로 갈랐다 (궤적의 \`nebula-start.lane\`)`);
console.log(`   ✅ 모델 레인 ${model.length}건 — 사람이 부른 주행이다. 카드 후보다.`);
/* ⛔ **조용히 빼지 않는다.** 0건이어도 말한다 — 안 말하면 「원래 없었다」와 구별이 안 된다(§8). */
if (includeScript) {
  console.log(`   ⚠️ 대본(${SCRIPT_LANE}) ${script.length}건 — \`--include-script\` 를 줘서 **안 뺐다.**`);
  console.log('      대본은 결정론이라 같은 대본이 **같은 카드**를 낸다 — 그만큼 모델을 더 부른다.');
} else {
  console.log(`   ⛔ 대본(${SCRIPT_LANE}) ${script.length}건 — **뺐다.**`);
  console.log('      관문이 커밋마다 돌리는 그 대본이다. 결정론이라 몇 번을 돌려도 하는 말이 같다 —');
  console.log('      그대로 뽑으면 **같은 카드가 그 수만큼** 나오고 모델도 그만큼 부른다(R159 실측).');
  console.log(`      그래도 뽑으려면: --include-script`);
}
/**
 * ⚪ **레인이 안 적힌 궤적** — 「모른다」다.
 *
 * ⛔ 통과로도 제외로도 세지 않는다. 레인을 적기 시작한 것은 R160 이라 그 앞의 궤적에는
 * 이 칸이 아예 없다. 없는 것을 「모델 주행이었다」로 읽으면 옛 대본이 그대로 카드가 되고,
 * 「대본이었다」로 읽으면 **진짜 모델 주행까지 조용히 사라진다.** 어느 쪽도 짐작이다.
 * ⇒ 뺄 근거가 없으므로 후보에는 남기되, **모델 레인과 같은 칸에 세지 않는다.**
 */
if (unknown.length > 0) {
  console.log(`   ⚪ 레인을 **모르는** 궤적 ${unknown.length}건 — 레인을 적기 전(R160)의 옛 궤적이다.`);
  console.log('      **통과도 제외도 아니다**(§8). 뺄 근거가 없어 후보에는 남기지만,');
  console.log('      「모델 주행이었다」는 뜻이 **아니다** — 이 안에 대본이 섞여 있을 수 있다.');
}

const candidates = includeScript ? solved : [...model, ...unknown];
console.log(`\n   ⇒ 카드 후보 **${candidates.length}건** (모델 ${model.length} + 모름 ${unknown.length}${includeScript ? ` + 대본 ${script.length}` : ''})`);

if (candidates.length === 0) {
  console.log('\n⚠️ **뽑을 것이 없다** — 성공한 궤적이 전부 대본이다. 모델 주행을 한 번 돌린 뒤에 다시 불러라.');
  console.log('   ⛔ 이것은 「배울 것이 없다」가 아니라 **「같은 대본만 있다」**다.');
  process.exit(0);
}

/* ── ⛔ 기본은 안 부른다 ───────────────────────────────────── */

const knowledgeDir = path.join(galaxy.path, 'universe', 'knowledge');
const indexPath = path.join(galaxy.path, 'universe', 'KNOWLEDGE.md');

if (!argv.includes('--write')) {
  console.log('\n(--write 를 안 줬다 — **모델을 부르지 않는다.** 뽑으면 이렇게 된다:)');
  for (const target of candidates) {
    /* 후보마다 **레인을 같이 찍는다** — 「왜 이것이 후보인가」를 사람이 그 줄에서 본다. */
    console.log(`   · ${path.basename(target.file)}   (레인 ${target.lane ?? '⚪ 모름'})`);
  }
  console.log(`\n   카드가 쌓일 곳: ${path.relative(process.cwd(), knowledgeDir)}`);
  console.log(`   진짜로 뽑으려면: node observatory/extract.mjs --galaxy ${galaxyName} --write`);
  console.log(`   ⛔ 그때 **모델을 ${candidates.length}번** 부른다 — 궤적 한 건에 한 번이다.`);
  process.exit(0);
}

console.log(`\n⛔ **모델을 ${candidates.length}번 부른다** (궤적 한 건에 한 번).`);

const { contracts } = await openEngine(root, config, ['contracts']);
const cards = await contracts.extractWikiCards(candidates.map((c) => c.file), {
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
