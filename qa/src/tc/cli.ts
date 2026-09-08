#!/usr/bin/env node
/**
 * tc-form — **TC 양식을 내주고, 채워 온 양식을 받아 돌린다.**
 *
 * 사용자가 원한 둘 중 두 번째다: 「TC 만 있다면 TC 를 업로드해서 자동수행, TC 양식은 다운로드」.
 *
 *   tc-form --emit <디렉터리> [--format tsv|csv]      # 양식을 내려받는다(모델 0회)
 *   tc-form --cases <파일> [--preconditions <파일>]    # 채운 양식을 읽어 판정한다
 *           [--run "<명령>"] [--playwright <리포트.json>] [--json]
 *
 * 종료 코드 — **계약이 정한다**(`../run/report.ts`). 여기서 다시 정하지 않는다:
 *   0 — 끝났다. ⛔ 「fail 0」이 아니라 **「판단하지 않은 fail 0」**이다.
 *   1 — 판단하지 않은 fail 이 있다
 *   3 — **못 쟀다.** 전제가 안 섰거나 · 검증 분모가 0이거나 · 양식을 못 읽었다.
 *
 * ⭐ 계약: `--json` 이면 이 도구가 돈 이상 stdout 은 **항상 유효 JSON** 이다 — `exit 3` 에서도.
 *    stdout 이 비었다는 것은 오직 도구가 **안 돌았다**는 뜻이다(`tc-run`·`tc-lint` 와 같다).
 *
 * ## ⛔ 이 도구가 **안 하는 것** (§8)
 *   · **판정을 다시 구현하지 않는다.** 「끝났는가」·「검증 분모」·「판단이 판단인가」는
 *     `../run/` 이 안다. 여기서는 부르고 나를 뿐이다.
 *   · Playwright 를 **모른다.** `--run` 은 준 명령을 그대로 돌리고 **그 종료코드를 전제로 세운다.**
 *     결과는 `--playwright` 로 준 JSON 리포트에서 읽는다. 리포터를 우리가 고르지 않는다.
 *   · `.xlsx` 는 **못 읽는다**(zip 이다). 엑셀이면 「CSV UTF-8」로 내보내라.
 *   · 양식을 0줄 읽었으면 「케이스가 없다」가 아니라 **「못 읽었다」**다 → 3.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildRunReport, evaluateDone, type IRunInput } from '../run/report.js';
import { fromPlaywrightJson, type IPwJsonReport } from '../run/playwright.js';
import type { IOriginEntry } from '../run/playwright.js';
import type { Attribution, IPrecondition } from '../run/contract.js';
import { parseArgv, unknownFlagMessage, type IFlagSpec } from './argv.js';
import { readCaseRows, readPreconditionRows, rowsOf, type IFormProblem } from './form.js';
import { mergeFormWithRun } from './merge.js';
import {
  renderCaseTemplate,
  renderPreconditionTemplate,
  templateFileName,
} from './schema.js';
import { delimiterForFile, type SvFormat } from './sv.js';

const EXIT_OK = 0;
const EXIT_UNMEASURED = 3;

const SPEC: IFlagSpec = {
  boolean: ['--json'],
  value: ['--emit', '--format', '--cases', '--preconditions', '--playwright', '--run'],
};

const USAGE =
  '쓰임:\n' +
  '  tc-form --emit <디렉터리> [--format tsv|csv]\n' +
  '  tc-form --cases <파일> [--preconditions <파일>] [--run "<명령>"] [--playwright <리포트.json>] [--json]';

interface IBail {
  code: number;
  reason: string;
}

const emitJson = (payload: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const bail = (asJson: boolean, { code, reason }: IBail): number => {
  if (asJson) {
    emitJson({ tool: 'tc-form', ok: false, ran: true, exitCode: code, unmeasuredReason: reason });
  } else {
    console.error(reason);
  }
  return code;
};

/* ── 양식 내주기 ───────────────────────────────────────────────────────── */

const emitTemplates = (dir: string, format: SvFormat, asJson: boolean): number => {
  const target = resolve(process.cwd(), dir);
  const files = [
    { path: join(target, templateFileName('cases', format)), body: renderCaseTemplate(format) },
    {
      path: join(target, templateFileName('preconditions', format)),
      body: renderPreconditionTemplate(format),
    },
  ];
  const already = files.filter((f) => existsSync(f.path)).map((f) => f.path);
  if (already.length > 0) {
    /* ⛔ 덮어쓰지 않는다 — 채워 놓은 양식을 빈 양식으로 지우는 것이 이 도구의 최악이다. */
    return bail(asJson, {
      code: EXIT_UNMEASURED,
      reason: `⚪ [tc-form] 이미 있다: ${already.join(' · ')} — 덮어쓰지 않는다. 다른 디렉터리를 줘라.`,
    });
  }
  mkdirSync(target, { recursive: true });
  for (const f of files) writeFileSync(f.path, f.body, 'utf8');

  if (asJson) {
    emitJson({ tool: 'tc-form', ok: true, ran: true, exitCode: EXIT_OK, emitted: files.map((f) => f.path) });
    return EXIT_OK;
  }
  console.log('── TC 양식을 내줬다');
  for (const f of files) console.log(`   · ${f.path}`);
  console.log('\n   칸 이름은 **계약에서 온 것**이다(qa/src/run/contract.ts). ⛔ 고치면 거부된다.');
  console.log('   ⛔ 전제 양식을 안 내면 「전제 0개」다 — 통과가 아니라 **못 쟀다**(3).');
  console.log('\n   채운 뒤: tc-form --cases <케이스> --preconditions <전제>');
  return EXIT_OK;
};

/* ── 채운 양식 읽기 ────────────────────────────────────────────────────── */

const readForm = <T>(
  file: string,
  read: (rows: string[][]) => { rows: T[]; problems: IFormProblem[]; dataRows: number },
): { rows: T[]; problems: IFormProblem[]; dataRows: number } | IBail => {
  const path = resolve(process.cwd(), file);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return { code: EXIT_UNMEASURED, reason: `⚪ [tc-form] 못 읽었다: ${file} — ${(error as Error).message}` };
  }
  let delimiter: string;
  try {
    delimiter = delimiterForFile(path);
  } catch (error) {
    return { code: EXIT_UNMEASURED, reason: `⚪ [tc-form] ${(error as Error).message}` };
  }
  try {
    return read(rowsOf(raw, delimiter));
  } catch (error) {
    return { code: EXIT_UNMEASURED, reason: `⚪ [tc-form] 표를 못 읽었다: ${file} — ${(error as Error).message}` };
  }
};

const isBail = (v: unknown): v is IBail =>
  typeof v === 'object' && v !== null && 'code' in v && 'reason' in v;

const main = (): number => {
  const argv = process.argv.slice(2);
  const args = parseArgv(argv, SPEC);
  const asJson = args.has('--json');

  if (args.unknown.length > 0) {
    return bail(asJson, { code: EXIT_UNMEASURED, reason: unknownFlagMessage(args.unknown, SPEC, 'tc-form') });
  }

  const formatRaw = args.get('--format') ?? 'tsv';
  if (formatRaw !== 'tsv' && formatRaw !== 'csv') {
    return bail(asJson, {
      code: EXIT_UNMEASURED,
      reason: `⚪ [tc-form] 모르는 --format: ${formatRaw} — tsv | csv 뿐이다`,
    });
  }
  const format: SvFormat = formatRaw;

  const emit = args.get('--emit');
  if (emit !== undefined) return emitTemplates(emit, format, asJson);

  const casesFile = args.get('--cases');
  if (casesFile === undefined) {
    return bail(asJson, { code: EXIT_UNMEASURED, reason: `⚪ [tc-form] 대상이 없다.\n${USAGE}` });
  }

  const caseRead = readForm(casesFile, readCaseRows);
  if (isBail(caseRead)) return bail(asJson, caseRead);

  const preFile = args.get('--preconditions');
  const preRead =
    preFile === undefined
      ? { rows: [] as IPrecondition[], problems: [] as IFormProblem[], dataRows: 0 }
      : readForm(preFile, readPreconditionRows);
  if (isBail(preRead)) return bail(asJson, preRead);

  const problems = [...caseRead.problems, ...preRead.problems];
  if (problems.length > 0) {
    /* ⛔ 문제가 있는 양식으로는 **판정하지 않는다.** 반만 읽고 판정하면 안 읽힌 칸이
       「안 적은 것」으로 세어져 초록이 는다. */
    const lines = problems.map((p) => `   · ${p.where}: ${p.message}`).join('\n');
    return bail(asJson, {
      code: EXIT_UNMEASURED,
      reason: `⚪ [tc-form] 양식을 못 읽었다 — 문제 ${problems.length}건 (케이스 줄 ${caseRead.dataRows} · 전제 줄 ${preRead.dataRows})\n${lines}`,
    });
  }
  if (caseRead.dataRows === 0) {
    return bail(asJson, {
      code: EXIT_UNMEASURED,
      reason:
        `⚪ [tc-form] 케이스를 **0줄** 읽었다: ${casesFile}. ` +
        '⛔ 「TC 가 없다」가 아니라 **못 쟀다**다 — 머리 줄만 있거나 전부 주석이다.',
    });
  }

  /* ── 있으면 주행한다 ─────────────────────────────────────────────────
     ⛔ 우리는 Playwright 를 모른다. 준 명령을 돌리고 **그 종료코드를 전제로 세운다.** */
  const runCommand = args.get('--run');
  const runPreconditions: IPrecondition[] = [];
  if (runCommand !== undefined) {
    if (args.get('--playwright') === undefined) {
      return bail(asJson, {
        code: EXIT_UNMEASURED,
        reason:
          '⚪ [tc-form] --run 을 줬는데 --playwright 가 없다. ' +
          '명령을 돌려도 **결과를 어디서 읽을지** 모른다 — 리포트 경로를 줘라 ' +
          '(예: npx playwright test --reporter=json > pw.json).',
      });
    }
    if (!asJson) console.log(`── 주행: ${runCommand}`);
    const child = spawnSync(runCommand, { shell: true, stdio: asJson ? 'ignore' : 'inherit' });
    const code = child.status;
    runPreconditions.push({
      id: 'tc-run-command',
      /* ⛔ 종료코드를 못 읽으면(신호로 죽음) `null` 이다 — 「섰다」가 아니라 **모른다**. */
      ok: code === null ? null : code === 0,
      detail:
        code === null
          ? `명령이 신호로 죽어 종료코드를 못 읽었다: ${runCommand}`
          : `\`${runCommand}\` 가 종료코드 ${code} 로 끝났다`,
    });
  }

  /* ── 주행 결과를 계약 모양으로 ───────────────────────────────────────── */
  let run: IRunInput | null = null;
  const pwFile = args.get('--playwright');
  if (pwFile !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(resolve(process.cwd(), pwFile), 'utf8'));
    } catch (error) {
      return bail(asJson, {
        code: EXIT_UNMEASURED,
        reason: `⚪ [tc-form] Playwright 리포트를 못 읽었다: ${pwFile} — ${(error as Error).message}`,
      });
    }
    /* 출처·탓은 **양식이 안다** — 어댑터에 그대로 넘겨 준다. 기계가 지어내지 않게. */
    const origins: Record<string, IOriginEntry> = {};
    const attribution = new Map<string, Attribution>();
    for (const c of caseRead.rows) {
      origins[c.id] = { origin: c.origin, originRef: c.originRef ?? null };
      attribution.set(c.id, c.attribution);
    }
    run = fromPlaywrightJson(parsed as IPwJsonReport, {
      origins,
      attributionOf: (id) => attribution.get(id) ?? 'unknown',
    });
  }

  const merged = mergeFormWithRun(
    { cases: caseRead.rows, preconditions: [...preRead.rows, ...runPreconditions] },
    run,
  );

  /* ⛔ 여기서부터는 **계약이 판정한다.** 우리는 부르고 나른다. */
  const report = buildRunReport(merged.input);
  const done = evaluateDone(report);

  if (asJson) {
    emitJson({
      ...report,
      /* ⛔ 어느 도구가 뱉었는지는 **경로마다 같아야** 한다 — 거절 경로는 `tc-form` 인데
         성공 경로만 계약의 `tool`(tc-run)이면 소비 쪽이 도구 이름으로 못 가른다.
         계약이 찍은 이름은 버리지 않고 `contractTool` 로 같이 낸다. */
      tool: 'tc-form',
      contractTool: report.tool,
      ok: done.done,
      exitCode: done.exitCode,
      done,
      form: {
        casesRead: caseRead.dataRows,
        preconditionsRead: preRead.dataRows,
        notRun: merged.notRun,
        notInForm: merged.notInForm,
        disagreed: merged.disagreed,
      },
      notMeasured:
        '양식이 적은 것이 사실인지는 재지 않는다. originRef 가 진짜 그 자리를 가리키는지도 안 본다.',
    });
    return done.exitCode;
  }

  console.log(`\n── 양식 — 케이스 ${caseRead.dataRows}줄 · 전제 ${preRead.dataRows}줄 읽었다`);
  if (merged.notRun.length > 0) {
    console.log(`   ⚪ 주행에 없던 TC ${merged.notRun.length}건: ${merged.notRun.join(' · ')}`);
    console.log('      **spec 이 없는 TC 다.** 통과도 실패도 아니다 — 분모에서 빠진다.');
  }
  if (merged.notInForm.length > 0) {
    console.log(`   ⚠️ 양식이 모르는 주행 ${merged.notInForm.length}건: ${merged.notInForm.join(' · ')}`);
    console.log('      출처를 모르므로 계약이 검증 분모에서 뺀다.');
  }
  for (const d of merged.disagreed) {
    console.log(`   ⚠️ ${d.id} — 양식은 ${d.form}, 주행은 ${d.run} 이다. **주행을 썼다.**`);
  }

  console.log('\n── 전제');
  for (const p of report.preconditions) {
    console.log(`  ${p.ok === true ? '✅' : p.ok === false ? '❌' : '⚪'} ${p.id}${p.detail ? ` — ${p.detail}` : ''}`);
  }
  const mark = (s: string): string => (s === 'passed' ? '✅' : s === 'failed' ? '❌' : '⚪');
  console.log('\n── 케이스');
  for (const c of report.cases) {
    const why = c.countsAsVerification
      ? ''
      : c.status === 'unmeasured'
        ? ' (검증 분모 밖 — 못 쟀다)'
        : ` (검증 분모 밖 — origin: ${c.origin})`;
    console.log(`  ${mark(c.status)} ${c.id} [${c.attribution}]${why}`);
  }
  const s = report.stats;
  console.log(`\n── 전체 ${s.total}건 / ✅ ${s.expected} · ❌ ${s.unexpected} · ⚪ ${s.skipped} · 갈림 ${s.flaky}`);
  console.log(
    `── 검증 분모 ${report.verification.denominator}건 ` +
      `(구현에서 나온 TC ${report.verification.excluded.derivedFromCode} · ` +
      `출처 미상 ${report.verification.excluded.unknownOrigin} · ⚪ ${report.verification.excluded.unmeasured} 뺐다)`,
  );
  for (const u of done.unjudged) console.log(`   ⛔ 판단하지 않은 fail: ${u.id} — ${u.reason}`);
  if (done.unattributed.length > 0) {
    console.log(`   ⚠️ 탓을 못 가른 fail: ${done.unattributed.join(' · ')} — 자동 수정이 못 다룬다`);
  }
  console.log(`\n${done.done ? '✅' : done.exitCode === EXIT_UNMEASURED ? '⚪' : '❌'} ${done.reason}`);
  return done.exitCode;
};

process.exit(main());
