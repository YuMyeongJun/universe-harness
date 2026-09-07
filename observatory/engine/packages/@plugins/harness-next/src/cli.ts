#!/usr/bin/env node
/**
 * 러너 CLI — **어느 Next 저장소에서든 같은 명령**이다.
 *
 *   next-harness list                                    스테이지 목록
 *   next-harness verify [--stage <id>] [--static-only]   지금 워킹트리를 검증한다
 *   next-harness run s01-use-client-boundary [--keep]    훈련장 한 바퀴
 *
 * ⚠️ 저장소 루트는 **cwd** 다(패키지 매니저 스크립트는 루트에서 돈다). 패키지 위치로부터
 *    `../../..` 를 세지 마라 — 벤더링된 지금 그 셈은 항상 틀린다.
 */
import { createContractEvaluator, resolveRulePresets } from '@core/fe-agent-contracts';
import { runEpisode } from '@core/fe-agent-harness';

import { parseArgv } from './argv.ts';
import { loadNextConfig } from './config.ts';
import { createNextHarness, createNextPlugin } from './createNextHarness.ts';
import { verifyWorkingTree } from './verify.ts';

const { positionals, flags, booleans } = parseArgv(process.argv.slice(2));
const flag = (name: string): string | undefined => flags[name];

const main = async () => {
  const [command, stageId] = positionals;
  const repoRoot = flag('--repo-root') ?? process.env.NEXT_HARNESS_REPO_ROOT ?? process.cwd();
  const project = await loadNextConfig({ repoRoot, configPath: flag('--config') });

  const harness = createNextHarness({
    repoRoot,
    keepSandbox: booleans.has('--keep'),
    paths: project.paths,
    commands: project.commands,
    lintTargets: project.lintTargets,
    contractPresets: project.contract.presets,
    contractModel: flag('--contract-model') ?? project.contract.model,
    contractStaticOnly: booleans.has('--static-only') || project.contract.staticOnly,
  });

  if (!command || command === 'list') {
    console.log(`설정: ${project.configPath ?? '(없음 · 중립 기본값)'}\n`);
    for (const stage of harness.stages) {
      console.log(`${stage.id}\t${stage.title}\n\t${stage.intent}`);
    }
    return;
  }

  if (command === 'verify') {
    /* 게이트와 규칙은 플러그인 객체에서 그대로 꺼낸다 — 하네스와 같은 부품을 쓴다는 것이 요점이다. */
    const plugin = createNextPlugin({
      paths: project.paths,
      /* ⛔ 빈 칸을 메우지 않는다(R146) — 기본값은 설정을 만들 때 들어가야 한다. */
      commands: { ...project.commands },
      lintTargets: project.lintTargets,
    });
    const result = await verifyWorkingTree({
      repoRoot,
      evaluator: createContractEvaluator({
        baseRules: resolveRulePresets(project.contract.presets),
        model: flag('--contract-model') ?? project.contract.model,
        staticOnly: booleans.has('--static-only') || project.contract.staticOnly,
      }),
      buildAndTest: plugin.buildAndTest!,
      staticRules: plugin.staticRules ?? [],
      baseRef: flag('--base') ?? 'HEAD',
      stage: flag('--stage') ? harness.findStage(flag('--stage')!) : null,
    });
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command !== 'run' || !stageId) {
    console.error(
      [
        '사용법:',
        '  next-harness list                                    스테이지 목록',
        '  next-harness verify [--stage <id>] [--static-only] [--base <ref>]',
        '                                                       지금 워킹트리를 검증한다',
        '  next-harness run <stageId> [--agent-model sonnet] [--contract-model sonnet]',
        '                             [--static-only] [--keep] [--repo-root <경로>] [--config <경로>]',
      ].join('\n'),
    );
    process.exit(1);
  }

  const outcome = await runEpisode({ harness, stageId, agentModel: flag('--agent-model') ?? 'sonnet' });
  console.log(`\n${outcome.solved ? 'SOLVED' : 'NOT SOLVED'} · reward ${outcome.reward}`);
  console.log(`궤적: ${outcome.trajectoryPath}`);
};

void main();
