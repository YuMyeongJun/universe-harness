#!/usr/bin/env node
/**
 * 러너 CLI — 스테이지 하나를 끝까지 돌린다. **어느 저장소에서든 같은 명령**이다.
 *
 *   fe-harness init                                        # 저장소를 재서 설정 초안을 만든다
 *   fe-harness setup                                       # 프로젝트 쪽 배선을 깐다
 *   fe-harness scan                                        # 관문을 지금 코드베이스에 걸어 본다
 *   fe-harness verify --stage s01-vite-monorepo-tangle     # 내가 고친 코드를 검증한다
 *   fe-harness list
 *   fe-harness run s01-vite-monorepo-tangle
 *   fe-harness run s04-toss-quality --agent-model sonnet --keep
 *   fe-harness run s02-spa-deeplink --static-only          # 관문 LLM 레인 끄기
 *   fe-harness run s01-... --repo-root /path/to/repo --config harness/fe-harness.config.json
 *
 * ⚠️ 저장소 루트는 **cwd** 다(패키지 매니저 스크립트는 루트에서 돈다). 패키지 위치로부터
 *    `../../..` 를 세지 마라 — 하네스가 별도 저장소로 빠진 지금 그 셈은 항상 틀린다.
 */
import { resolveRulePresets } from '@core/fe-agent-contracts';
import { formatInitializeResult, initializeProjectSettings, runEpisode } from '@core/fe-agent-harness';

import { parseArgv } from './argv.ts';
import { loadProjectConfig } from './config.ts';
import { initProjectConfig } from './init.ts';
import { formatScan, scanCodebase } from './scan.ts';
import { verifyWorkingTree } from './verify.ts';
import { ReactViteHarness } from './ReactViteHarness.ts';

/* 오타 하나에 스택 트레이스를 뱉지 않는다 — 사람이 읽을 한 줄로 끝낸다. */
let parsed;
try {
  parsed = parseArgv(process.argv.slice(2));
} catch (error) {
  console.error(`⛔ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const { positionals, flags, booleans } = parsed;
const flag = (name: string): string | undefined => flags[name];

const main = async () => {
  const [command, stageId] = positionals;
  const repoRoot = flag('--repo-root') ?? process.env.FE_HARNESS_REPO_ROOT ?? process.cwd();

  /* setup 은 프로젝트 쪽 배선(스크립트·구동 스크립트)을 까는 명령이라 설정보다 먼저 온다. */
  if (command === 'setup') {
    const report = await initializeProjectSettings({
      repoRoot,
      configPath: flag('--config'),
      agentModel: flag('--agent-model'),
      runnerFormat: booleans.has('--shell') ? 'both' : 'node',
      linkedInstall: booleans.has('--linked'),
      force: booleans.has('--force'),
      dryRun: booleans.has('--dry-run'),
    });
    console.log(formatInitializeResult(report, repoRoot));
    return;
  }

  /* init 은 설정을 **만드는** 명령이라 설정을 읽기 전에 갈라진다. */
  if (command === 'init') {
    const result = await initProjectConfig({
      repoRoot,
      outPath: flag('--config'),
      force: booleans.has('--force'),
    });
    console.log(`✅ ${result.configPath}\n`);
    for (const note of result.notes) {
      console.log(`   잰 것: ${note}`);
    }
    console.log('\n⚠️ 기계가 못 재는 것 — 직접 채워라(안 채우면 스테이지가 엉뚱한 것을 잰다):');
    for (const todo of result.todos) {
      console.log(`   · ${todo}`);
    }
    return;
  }

  const project = await loadProjectConfig({ repoRoot, configPath: flag('--config') });

  /* Contract 는 하네스가 흡수했다 — 묶음·모델만 넘기면 관문을 스스로 세운다. */
  const harness = new ReactViteHarness({
    repoRoot,
    keepSandbox: booleans.has('--keep'),
    paths: project.paths,
    commands: project.commands,
    lintTargets: project.lintTargets,
    testFileCommand: project.testFileCommand,
    contractPresets: project.contract.presets,
    contractModel: flag('--contract-model') ?? project.contract.model,
    contractStaticOnly: booleans.has('--static-only') || project.contract.staticOnly,
  });

  /* scan — 훈련장을 돌리기 전에 "이 관문이 우리 코드에서 무엇을 잡나" 를 먼저 본다. */
  if (command === 'scan') {
    const presets = project.contract.presets;
    const result = await scanCodebase({
      repoRoot,
      targets: project.lintTargets.length
        ? [...new Set(project.lintTargets.map(() => `${project.paths.appDir}/src`))]
        : [`${project.paths.appDir}/src`],
      rules: resolveRulePresets(presets),
      sampleCount: Number(flag('--sample') ?? 8),
      ruleFilter: flag('--rule'),
    });
    console.log(formatScan(result, presets));
    return;
  }

  /* verify — **지금 워킹트리**를 재고 판정한다. 사람/도구를 가진 에이전트의 작업 검증용이다. */
  if (command === 'verify') {
    const result = await verifyWorkingTree({
      harness,
      baseRef: flag('--base') ?? 'HEAD',
      stageId: flag('--stage'),
    });
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (!command || command === 'list') {
    console.log(`설정: ${project.configPath ?? '(없음 · 중립 기본값)'}\n`);
    for (const stage of harness.stages) {
      console.log(`${stage.id}\t${stage.title}\n\t${stage.intent}`);
    }
    return;
  }

  if (command !== 'run' || !stageId) {
    console.error(
      [
        '사용법:',
        '  fe-harness init [--config <출력경로>] [--force]      저장소를 재서 설정 초안을 만든다',
        '  fe-harness setup [--linked] [--shell] [--force]      프로젝트 배선(스크립트·구동 스크립트)을 깐다',
        '  fe-harness scan [--rule <id>] [--sample 8]           관문을 지금 코드에 걸어 본다',
        '  fe-harness verify [--stage <id>] [--static-only]     지금 워킹트리를 검증한다(작업 검증)',
        '  fe-harness list                                      스테이지 목록',
        '  fe-harness run <stageId> [--agent-model sonnet] [--contract-model sonnet]',
        '                            [--static-only] [--keep] [--repo-root <경로>] [--config <경로>]',
      ].join('\n'),
    );
    process.exit(1);
  }

  const outcome = await runEpisode({ harness, stageId, agentModel: flag('--agent-model') ?? 'sonnet' });
  console.log(`\n${outcome.solved ? 'SOLVED' : 'NOT SOLVED'} · reward ${outcome.reward}`);
  console.log(`궤적: ${outcome.trajectoryPath}`);
};

void main();
