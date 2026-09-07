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

import type { IFinding } from './core.js';
import { parseTicket } from './parse.js';
import { lintTicket } from './rules.js';
import { parseSheetSpec } from './sheet/parse.js';
import { lintSheet } from './sheet/rules.js';

type Format = 'markdown' | 'sheet';

const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const EXIT_UNMEASURED = 3;

const collect = (target: string, ext: string): string[] => {
  const stat = statSync(target);
  if (stat.isFile()) return target.endsWith(ext) ? [target] : [];
  const out: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(target, entry.name);
    if (entry.isDirectory()) out.push(...collect(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
};

/** 입력 형식에 따라 파서·규칙을 고른다. 판정 어휘(IFinding·종료 코드)는 공용이다. */
const makeAdapters = (
  majorDictionary: string[] | undefined,
): Record<Format, { ext: string; lint: (file: string, src: string) => IFinding[] }> => ({
  markdown: { ext: '.md', lint: (file, src) => lintTicket(parseTicket(file, src)) },
  sheet: {
    ext: '.json',
    lint: (file, src) =>
      lintSheet(parseSheetSpec(file, src), majorDictionary ? { majorDictionary } : {}),
  },
});

/**
 * `--features-dir` — 지식 **폴더 이름**만 읽는다. 파일은 열지 않는다.
 * 없으면 `대분류` 대조는 ⚪ 로 남는다 — 조용히 통과시키지 않는다.
 */
const readFeatureNames = (dir: string): string[] | undefined => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name.normalize('NFC'));
  } catch {
    return undefined;
  }
};

/** `--flag value` 또는 `--flag=value` 를 읽고, 소비한 인자를 표시한다 */
const readOption = (argv: string[], name: string, consumed: Set<string>): string | undefined => {
  const index = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (index === -1) return undefined;
  const token = argv[index] as string;
  consumed.add(token);
  if (token.includes('=')) return token.split('=').slice(1).join('=');
  const value = argv[index + 1];
  if (value !== undefined) consumed.add(value);
  return value;
};

const main = (): number => {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');

  /**
   * 린터가 **스스로 판정한** 모든 종료는 여기를 지난다.
   *
   * ⭐ **계약: `--json` 이면 린터가 돈 이상 stdout 은 항상 유효 JSON 이다.**
   *    stdout 이 비어 있다는 것은 오직 **린터가 아예 안 돌았다**는 뜻이다
   *    (빌드 안 됨 · 클론 안 됨 — 그때 `node` 가 자기 에러로 exit 1 을 낸다).
   *    소비 쪽이 종료 코드가 아니라 **stdout 파싱**을 판별자로 쓸 수 있어야 한다.
   */
  const bail = (code: number, reason: string): number => {
    if (asJson) {
      process.stdout.write(
        `${JSON.stringify(
          { tool: 'tc-lint', ok: false, exitCode: code, ran: true, unmeasuredReason: reason, findings: [] },
          null,
          2,
        )}\n`,
      );
    } else {
      console.error(reason);
    }
    return code;
  };

  const consumed = new Set<string>();
  const rawFormat = readOption(argv, 'format', consumed) ?? 'markdown';
  if (rawFormat !== 'markdown' && rawFormat !== 'sheet') {
    return bail(EXIT_UNMEASURED, `⚪ [tc-lint] 알 수 없는 형식: ${rawFormat} (markdown | sheet)`);
  }
  const format: Format = rawFormat;

  const requireFeaturesDir = argv.includes('--require-features-dir');
  const featuresDir = readOption(argv, 'features-dir', consumed);
  let majorDictionary: string[] | undefined;
  if (featuresDir !== undefined) {
    majorDictionary = readFeatureNames(resolve(process.cwd(), featuresDir));
    if (majorDictionary === undefined) {
      return bail(EXIT_UNMEASURED, `⚪ [tc-lint] --features-dir 를 읽지 못했다: ${featuresDir}`);
    }
    if (majorDictionary.length === 0) {
      // 폴더가 0개면 "모든 대분류가 틀렸다"가 아니라 **잘못 겨눈 경로**다.
      return bail(EXIT_UNMEASURED, `⚪ [tc-lint] --features-dir 에 하위 폴더가 0개다: ${featuresDir}`);
    }
  }
  // 호출부를 고치다 플래그를 빠뜨리면 **검사가 조용히 사라진다.** 그 자리를 3 으로 만든다.
  if (requireFeaturesDir && majorDictionary === undefined) {
    return bail(
      EXIT_UNMEASURED,
      '⚪ [tc-lint] --require-features-dir 인데 --features-dir 가 없다.\n' +
        '   검사가 조용히 사라지는 것을 막기 위해 통과시키지 않는다.',
    );
  }
  const adapter = makeAdapters(majorDictionary)[format];

  const args = argv.filter((a) => !a.startsWith('-') && !consumed.has(a));
  const targets = args.length > 0 ? args : [format === 'sheet' ? 'specs' : 'tickets'];
  const cwd = process.cwd();

  const files: string[] = [];
  for (const target of targets) {
    const abs = resolve(cwd, target);
    try {
      files.push(...collect(abs, adapter.ext));
    } catch {
      return bail(EXIT_UNMEASURED, `⚪ [tc-lint] 대상을 읽지 못했다: ${target}`);
    }
  }

  if (files.length === 0) {
    return bail(
      EXIT_UNMEASURED,
      `⚪ [tc-lint] 대상 파일이 0개다 (${format} / ${targets.join(', ')}).\n` +
        '   0개는 "위반 없음"이 아니라 **검사가 아무것도 안 본 것**이다. 통과로 세지 않는다.',
    );
  }

  let errorCount = 0;
  let unmeasuredCount = 0;
  const unmeasuredNames: string[] = [];
  /** 기계가 읽는 출력 — 사람용 텍스트를 파싱하게 만들지 않는다 */
  const jsonFindings: Array<Record<string, unknown>> = [];
  const say = (line: string): void => {
    if (!asJson) console.log(line);
  };

  for (const file of files) {
    const rel = relative(cwd, file);
    let findings: IFinding[];
    try {
      findings = adapter.lint(rel, readFileSync(file, 'utf8'));
    } catch (error) {
      console.error(`⚪ ${rel} — 파싱 실패: ${(error as Error).message}`);
      unmeasuredCount += 1;
      unmeasuredNames.push(rel);
      continue;
    }

    if (findings.length === 0) {
      say(`✅ ${rel}`);
      continue;
    }

    say(`\n${rel}`);
    for (const f of findings) {
      const mark = f.severity === 'error' ? '❌' : '⚪';
      say(`  ${mark} ${f.at ? `${f.at} ` : ''}[${f.rule}] ${f.message}`);
      say(`     └ ${f.why}`);
      jsonFindings.push({
        file: rel,
        rule: f.rule,
        // 외부 계약에서는 `error` 가 아니라 `violation` 이다 — 도구 오류와 헷갈리지 않게
        severity: f.severity === 'error' ? 'violation' : 'unmeasured',
        ...(f.tab === undefined ? {} : { tab: f.tab }),
        ...(f.rowIndex === undefined ? {} : { rowIndex: f.rowIndex }),
        message: f.message,
        why: f.why,
      });
      if (f.severity === 'error') errorCount += 1;
      else {
        unmeasuredCount += 1;
        unmeasuredNames.push(`${rel}:${f.rule}`);
      }
    }
  }

  const exitCode = errorCount > 0 ? EXIT_VIOLATION : EXIT_OK;

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          tool: 'tc-lint',
          ok: errorCount === 0,
          exitCode,
          ran: true,
          format,
          files: files.length,
          violations: errorCount,
          unmeasured: unmeasuredCount,
          findings: jsonFindings,
          // 관문이 재지 않는 것을 출력에도 적는다 — 소비 쪽이 "다 쟀다"로 읽지 않게
          notMeasured: '필드가 다 채워졌지만 얕은 TC 는 잡지 않는다. 형식만 재고 내용은 재지 않는다.',
        },
        null,
        2,
      )}\n`,
    );
    return exitCode;
  }

  const unit = format === 'sheet' ? '스펙' : '티켓';
  console.log(`\n── ${unit} ${files.length}건 / 위반 ${errorCount}건 / ⚪ 못 쟀다 ${unmeasuredCount}건`);
  if (unmeasuredNames.length > 0) {
    // 못 잰 축은 **따로 이름을 부른다.** 통과 쪽에 섞지 않는다.
    console.log('   ⚪ 안 잰 축:');
    for (const name of unmeasuredNames) console.log(`      · ${name}`);
  }
  console.log(
    '\n⛔ 이 관문이 못 잡는 것: 필드가 다 채워졌지만 **얕은 TC**. 형식만 재고 내용은 재지 않는다.',
  );

  return exitCode;
};

process.exit(main());
