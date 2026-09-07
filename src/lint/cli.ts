#!/usr/bin/env node
/**
 * tc-lint — TC 티켓 정적 관문 CLI
 *
 * 종료 코드:
 *   0 — 위반 없음 (⚪ 는 있을 수 있다. 있으면 이름을 부르고 나간다)
 *   1 — 위반 있음
 *   3 — **못 쟀다.** 대상 파일이 0개이거나 읽지 못했다. 실패도 통과도 아니다.
 *
 * ⚠️ 스캔한 파일이 0개면 자동 통과가 아니다. 그건 검사가 아무것도 안 본 것이다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { parseTicket } from './parse.js';
import { lintTicket, type IFinding } from './rules.js';

const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const EXIT_UNMEASURED = 3;

const collectMarkdown = (target: string): string[] => {
  const stat = statSync(target);
  if (stat.isFile()) return target.endsWith('.md') ? [target] : [];
  const out: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(target, entry.name);
    if (entry.isDirectory()) out.push(...collectMarkdown(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
};

const main = (): number => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const targets = args.length > 0 ? args : ['tickets'];
  const cwd = process.cwd();

  const files: string[] = [];
  for (const target of targets) {
    const abs = resolve(cwd, target);
    try {
      files.push(...collectMarkdown(abs));
    } catch {
      console.error(`⚪ [tc-lint] 대상을 읽지 못했다: ${target}`);
      return EXIT_UNMEASURED;
    }
  }

  if (files.length === 0) {
    console.error(
      `⚪ [tc-lint] 대상 파일이 0개다 (${targets.join(', ')}).\n` +
        '   0개는 "위반 없음"이 아니라 **검사가 아무것도 안 본 것**이다. 통과로 세지 않는다.',
    );
    return EXIT_UNMEASURED;
  }

  let errorCount = 0;
  let unmeasuredCount = 0;
  const unmeasuredNames: string[] = [];

  for (const file of files) {
    const rel = relative(cwd, file);
    let findings: IFinding[];
    try {
      findings = lintTicket(parseTicket(rel, readFileSync(file, 'utf8')));
    } catch (error) {
      console.error(`⚪ ${rel} — 파싱 실패: ${(error as Error).message}`);
      unmeasuredCount += 1;
      unmeasuredNames.push(rel);
      continue;
    }

    if (findings.length === 0) {
      console.log(`✅ ${rel}`);
      continue;
    }

    console.log(`\n${rel}`);
    for (const f of findings) {
      const mark = f.severity === 'error' ? '❌' : '⚪';
      console.log(`  ${mark} [${f.rule}] ${f.message}`);
      console.log(`     └ ${f.why}`);
      if (f.severity === 'error') errorCount += 1;
      else {
        unmeasuredCount += 1;
        unmeasuredNames.push(`${rel}:${f.rule}`);
      }
    }
  }

  console.log(`\n── 티켓 ${files.length}건 / 위반 ${errorCount}건 / ⚪ 못 쟀다 ${unmeasuredCount}건`);
  if (unmeasuredNames.length > 0) {
    // 못 잰 축은 **따로 이름을 부른다.** 통과 쪽에 섞지 않는다.
    console.log('   ⚪ 안 잰 축:');
    for (const name of unmeasuredNames) console.log(`      · ${name}`);
  }
  console.log(
    '\n⛔ 이 관문이 못 잡는 것: 필드가 다 채워졌지만 **얕은 TC**. 형식만 재고 내용은 재지 않는다.',
  );

  return errorCount > 0 ? EXIT_VIOLATION : EXIT_OK;
};

process.exit(main());
