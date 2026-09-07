#!/usr/bin/env node
/**
 * tc-sync — TC 티켓을 GitHub Issue 로 올린다.
 *
 * ⭐ **기본값은 쓰지 않는다.** 원격 쓰기는 되돌리기가 비싸므로 `--apply` 를 명시해야 한다.
 *    무엇을 할 것인지 먼저 보여 주고, 사람이 보고 나서 실행한다.
 *
 * 종료 코드: 0 / 1(린트 위반이라 안 올림) / 3(못 쟀다)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { GitHubClient } from './client.js';
import { UnmeasuredError, requireRepoCoordinate } from './guards.js';
import { ensureLabels } from './labels.js';
import { applySync, fetchTicketIssues, planSync } from './issues.js';

const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const EXIT_UNMEASURED = 3;

const collect = (target: string): string[] => {
  const stat = statSync(target);
  if (stat.isFile()) return target.endsWith('.md') ? [target] : [];
  const out: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(target, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
};

const main = (): number => {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const targets = argv.filter((a) => !a.startsWith('-'));
  if (targets.length === 0) {
    console.error('사용: tc-sync <티켓 경로...> [--apply]\n  --apply 없이는 아무것도 쓰지 않는다.');
    return EXIT_UNMEASURED;
  }

  const cwd = process.cwd();
  const files: string[] = [];
  for (const target of targets) {
    try {
      files.push(...collect(resolve(cwd, target)));
    } catch {
      console.error(`⚪ [tc-sync] 대상을 읽지 못했다: ${target}`);
      return EXIT_UNMEASURED;
    }
  }
  if (files.length === 0) {
    console.error(
      `⚪ [tc-sync] 대상 티켓이 0개다 (${targets.join(', ')}).\n` +
        '   0개는 "올릴 것이 없다"가 아니라 **아무것도 안 본 것**이다.',
    );
    return EXIT_UNMEASURED;
  }

  const client = new GitHubClient({ dryRun: !apply });

  // ⚠️ 쓰기 직전이므로 좌표를 못 세우면 **실패**다. 어디에 쓸지 모르는데 쓰지 않는다.
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = requireRepoCoordinate(client.originUrl()));
  } catch (error) {
    console.error(String((error as Error).message));
    return EXIT_UNMEASURED;
  }

  console.log(`대상: ${owner}/${repo}  ·  티켓 ${files.length}건  ·  ${apply ? '⚠️ 실제로 쓴다' : '미리보기(쓰지 않음)'}`);

  let existing;
  try {
    existing = fetchTicketIssues(client, owner, repo);
  } catch (error) {
    if (error instanceof UnmeasuredError) {
      console.error(`⚪ ${(error as Error).message}`);
      return EXIT_UNMEASURED;
    }
    throw error;
  }
  console.log(`원격에 있는 TC 이슈: ${existing.length}건\n`);

  const plans = files.map((file) => {
    const rel = relative(cwd, file);
    return { plan: planSync(rel, readFileSync(file, 'utf8'), existing), source: readFileSync(file, 'utf8') };
  });

  const blocked = plans.filter(({ plan }) => plan.findings.some((f) => f.severity === 'error'));
  const labels = new Set<string>();
  for (const { plan } of plans) for (const name of plan.labels) labels.add(name);

  for (const { plan } of plans) {
    const mark = plan.action === 'create' ? '＋' : plan.action === 'update' ? '↻' : '·';
    const violations = plan.findings.filter((f) => f.severity === 'error').length;
    const unmeasured = plan.findings.filter((f) => f.severity === 'unmeasured').length;
    const state = violations > 0 ? `⛔ 위반 ${violations}건이라 올리지 않는다` : `⚪ ${unmeasured}`;
    console.log(`  ${mark} ${plan.sourcePath}  ${plan.action}  [${plan.labels.join(', ')}]  ${state}`);
  }

  console.log(`\n필요한 라벨 ${labels.size}종: ${[...labels].join(', ')}`);

  if (blocked.length > 0) {
    console.error(
      `\n⛔ 린트 위반이 있는 티켓 ${blocked.length}건은 올리지 않는다. 형식이 깨진 것을 원격에 쌓으면\n` +
        '   되돌리는 비용이 크고, 그 사이 누군가 그것을 근거로 삼는다.',
    );
    return EXIT_VIOLATION;
  }

  if (!apply) {
    console.log('\n미리보기다. 실제로 쓰려면 --apply 를 붙여라.');
    return EXIT_OK;
  }

  ensureLabels(client, owner, repo, [...labels]);
  for (const { plan, source } of plans) applySync(client, owner, repo, plan, source);
  console.log('\n완료 — 쓰기 후 재조회로 확인했다.');
  return EXIT_OK;
};

try {
  process.exit(main());
} catch (error) {
  if (error instanceof UnmeasuredError) {
    console.error(`⚪ ${(error as Error).message}`);
    process.exit(EXIT_UNMEASURED);
  }
  console.error(`⛔ ${(error as Error).message}`);
  process.exit(EXIT_VIOLATION);
}
