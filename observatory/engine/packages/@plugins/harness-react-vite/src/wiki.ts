#!/usr/bin/env node
/**
 * WikiSkill 추출 CLI — 성공 궤적에서만 지식 카드를 뽑는다.
 *
 *   fe-harness-wiki .harness/trajectories/<run>.jsonl
 *   fe-harness-wiki <run>.jsonl --dry-run
 *
 * 추출 로직은 `@core/fe-agent-contracts` 에 있다. 여기서 하는 일은 **소비 저장소의 경로를
 * 꽂는 것**뿐이고, 그 경로는 `fe-harness.config.json` 의 `wiki` 절에서 온다.
 */
import path from 'node:path';

import { extractWikiCards } from '@core/fe-agent-contracts';

import { parseArgv } from './argv.ts';
import { loadProjectConfig } from './config.ts';

const { positionals, flags, booleans } = parseArgv(process.argv.slice(2));
const flag = (name: string): string | undefined => flags[name];

const repoRoot = flag('--repo-root') ?? process.env.FE_HARNESS_REPO_ROOT ?? process.cwd();
const targets = positionals.filter((arg) => arg.endsWith('.jsonl'));

if (targets.length === 0) {
  console.error('궤적 파일(.jsonl)을 지정하라.');
  process.exit(1);
}

const project = await loadProjectConfig({ repoRoot, configPath: flag('--config') });
const wiki = project.wiki ?? {};

await extractWikiCards(targets, {
  repoRoot,
  knowledgeDir: path.join(repoRoot, wiki.knowledgeDir ?? '.claude/skills/wiki-frontend/knowledge'),
  indexPath: path.join(repoRoot, wiki.indexPath ?? '.claude/skills/wiki-frontend/SKILL.md'),
  houseRulesPath: wiki.houseRulesPath ? path.join(repoRoot, wiki.houseRulesPath) : undefined,
  skillDescription: wiki.description,
  regenerateCommand: wiki.regenerateCommand ?? 'fe-harness-wiki <궤적.jsonl>',
  model: flag('--model') ?? wiki.model ?? 'opus',
  dryRun: booleans.has('--dry-run'),
  today: new Date().toISOString().slice(0, 10),
});
