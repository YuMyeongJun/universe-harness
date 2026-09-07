#!/usr/bin/env node
/**
 * tc-run — 주행 결과를 계약 모양으로 접고 세고, **끝났는지** 말한다.
 *
 * 종료 코드:
 *   0 — 끝났다. **「fail 0」이 아니라 「판단하지 않은 fail 0」이다.**
 *   1 — 판단하지 않은 fail 이 있다
 *   3 — **못 쟀다.** 전제가 안 섰거나 검증 분모가 0이다. 실패도 통과도 아니다.
 *
 * ⭐ 계약: `--json` 이면 이 도구가 돈 이상 stdout 은 **항상 유효 JSON**이다 (`tool` · `ran`
 *    · `exitCode`). `exit 3` 에서도 그렇다. stdout 이 비어 있다는 것은 오직 도구가 아예
 *    **안 돌았다**는 뜻이다 — 소비 쪽은 종료 코드가 아니라 **stdout 파싱**으로 먼저 가른다.
 *    (`tc-lint` 와 같은 계약이다. README ⭐ 절 참고)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildRunReport, evaluateDone, type IRunInput } from './report.js';
import { fromPlaywrightJson, type IAdapterOptions, type IPwJsonReport } from './playwright.js';

const EXIT_UNMEASURED = 3;

const readOption = (argv: string[], name: string): string | undefined => {
  const index = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (index === -1) return undefined;
  const token = argv[index] as string;
  if (token.includes('=')) return token.split('=').slice(1).join('=');
  return argv[index + 1];
};

const main = (): number => {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');

  const bail = (code: number, reason: string): number => {
    if (asJson) {
      process.stdout.write(
        `${JSON.stringify(
          { tool: 'tc-run', ok: false, exitCode: code, ran: true, unmeasuredReason: reason },
          null,
          2,
        )}\n`,
      );
    } else {
      console.error(reason);
    }
    return code;
  };

  // `--origins <파일>` 처럼 플래그가 먹은 값은 위치 인자가 아니다.
  const eaten = new Set<string>();
  for (const name of ['origins']) {
    const i = argv.findIndex((a) => a === `--${name}`);
    if (i !== -1 && argv[i + 1] !== undefined) eaten.add(argv[i + 1] as string);
  }
  const file = argv.find((a) => !a.startsWith('--') && !eaten.has(a));
  if (file === undefined) {
    return bail(
      EXIT_UNMEASURED,
      '⚪ [tc-run] 대상 파일이 없다.\n' +
        '   쓰임: tc-run <결과.json> [--from-playwright] [--origins <origins.json>] [--json]',
    );
  }

  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), file), 'utf8');
  } catch (error) {
    return bail(EXIT_UNMEASURED, `⚪ [tc-run] 파일을 읽지 못했다: ${file} — ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return bail(EXIT_UNMEASURED, `⚪ [tc-run] JSON 파싱 실패: ${file} — ${(error as Error).message}`);
  }

  let input: IRunInput;
  if (argv.includes('--from-playwright')) {
    const originsFile = readOption(argv, 'origins');
    let options: IAdapterOptions = {};
    if (originsFile !== undefined) {
      try {
        options = { origins: JSON.parse(readFileSync(resolve(process.cwd(), originsFile), 'utf8')) };
      } catch (error) {
        return bail(
          EXIT_UNMEASURED,
          `⚪ [tc-run] --origins 를 읽지 못했다: ${originsFile} — ${(error as Error).message}`,
        );
      }
    }
    input = fromPlaywrightJson(parsed as IPwJsonReport, options);
  } else {
    const candidate = parsed as Partial<IRunInput>;
    if (!Array.isArray(candidate.cases) || !Array.isArray(candidate.preconditions)) {
      return bail(
        EXIT_UNMEASURED,
        `⚪ [tc-run] 입력에 preconditions[] · cases[] 가 없다: ${file}. ` +
          'Playwright 리포트라면 --from-playwright 를 붙여라.',
      );
    }
    input = { preconditions: candidate.preconditions, cases: candidate.cases };
  }

  const report = buildRunReport(input);
  const done = evaluateDone(report);

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...report,
          ok: done.done,
          exitCode: done.exitCode,
          done,
          // 이 도구가 **안 재는 것**도 출력에 적는다 — 소비 쪽이 "다 쟀다"로 읽지 않게
          notMeasured:
            '판단의 내용이 맞는지는 재지 않는다. accepted 사유의 길이는 보지만 타당성은 못 본다.',
        },
        null,
        2,
      )}\n`,
    );
    return done.exitCode;
  }

  const mark = (s: string): string => (s === 'passed' ? '✅' : s === 'failed' ? '❌' : '⚪');

  console.log('── 전제');
  for (const p of report.preconditions) {
    const icon = p.ok === true ? '✅' : p.ok === false ? '❌' : '⚪';
    console.log(`  ${icon} ${p.id}${p.detail ? ` — ${p.detail}` : ''}`);
  }
  console.log(`\n측정 가능: ${report.measurable ? '예' : '**아니오**'}`);
  for (const why of report.unmeasurableBecause) console.log(`  └ ${why}`);

  console.log('\n── 케이스');
  for (const c of report.cases) {
    // 분모 밖인 이유를 정확히 적는다 — ⚪ 로 접혀서 빠진 것과 출처 때문에 빠진 것은 다르다.
    const verify = c.countsAsVerification
      ? ''
      : c.status === 'unmeasured'
        ? ' (검증 분모 밖 — 못 쟀다)'
        : ` (검증 분모 밖 — origin: ${c.origin})`;
    console.log(`  ${mark(c.status)} ${c.id} [${c.attribution}]${verify}`);
    if (c.unmeasuredReason) console.log(`     └ ⚪ ${c.unmeasuredReason}`);
    if (c.status === 'failed') {
      console.log(`     └ 판단: ${c.verdict ? `${c.verdict.kind} — ${c.verdict.why}` : '**없다**'}`);
    }
  }

  const s = report.stats;
  console.log(
    `\n── 전체 ${s.total}건 / ✅ ${s.expected} · ❌ ${s.unexpected} · ⚪ ${s.skipped} · 갈림 ${s.flaky}`,
  );
  console.log(
    `── 검증 분모 ${report.verification.denominator}건 ` +
      `(구현에서 나온 TC ${report.verification.excluded.derivedFromCode} · ` +
      `출처 미상 ${report.verification.excluded.unknownOrigin} · ⚪ ${report.verification.excluded.unmeasured} 뺐다)`,
  );
  if (report.verification.selfScoringIds.length > 0) {
    console.log(`   ⛔ 자기 채점: ${report.verification.selfScoringIds.join(' · ')}`);
  }
  if (done.unattributed.length > 0) {
    console.log(`   ⚠️ 탓을 못 가른 fail: ${done.unattributed.join(' · ')} — 자동 수정이 못 다룬다`);
  }
  if (done.unjudged.length > 0) {
    console.log('\n⛔ 판단하지 않은 fail:');
    for (const u of done.unjudged) console.log(`   · ${u.id} — ${u.reason}`);
  }
  console.log(`\n${done.done ? '✅' : done.exitCode === 3 ? '⚪' : '❌'} ${done.reason}`);

  return done.exitCode;
};

process.exit(main());
