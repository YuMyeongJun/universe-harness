#!/usr/bin/env node
/**
 * tc-draft — **정책서/기획 → TC 초안.** 사용자가 원한 둘 중 첫 번째의 앞 절반이다
 * (「정책서 혹은 기획이 있다면 그 기반으로 TC 를 작성」). 뒷 절반(자동 수행)은 `tc-form` 이 한다.
 *
 * ## ⛔⛔ 이것은 **모델을 부른다** — 그래서 기본이 안전하다
 *
 *   · **기본은 모델 호출 0회.** 무엇을 몇 번 부를지만 보여 준다.
 *   · 진짜로 부르려면 `--write` 를 줘야 한다. 그때 **몇 번 부를지 먼저 말하고** 경고한다.
 *   · 정책 조각 **한 개에 한 번** 부른다 — 조각 수가 곧 호출 수이고, 곧 돈이다.
 * ⚠️ 「공짜인 줄 알고 돌렸다」가 이 저장소가 가장 싫어하는 사건이다.
 * (정본: `observatory/extract.mjs` — 같은 규율을 그대로 따랐다.)
 *
 * ## ⛔ 초안은 **검증이 아니다**
 * 나온 표의 모든 줄은 계약이 **검증 분모에서 빼는 출처**로 나간다. 그대로 `tc-form` 에 넣으면
 * 「못 쟀다」(3)가 나온다 — 그것이 맞다. 사람이 확인해야 검증이 된다(`draft.ts` 머리말).
 *
 * ## ⛔ 모델을 부르는 법을 여기서 **다시 만들지 않는다**
 * `claude` CLI 를 어떻게 부르는지는 우주의 엔진(`fe-agent-harness` 의 `callClaude`)이 안다 —
 * 인증 레인(구독)·도구 차단·빈 답 처리가 전부 거기 한 자리에 있다. 그 지식을 복사하면
 * **한 자리만 고쳐진 채 갈린다.** 엔진의 **배치**를 아는 것도 우주의 `lib/engine.mjs` 하나다.
 * ⇒ 우리는 `lib/engine.mjs` 를 부르기만 한다. 그것이 없으면(남의 저장소에 배달된 `qa/`)
 *   **못 쟀다(3)** 라고 말한다 — 몰래 다른 길로 가지 않는다.
 *
 * 쓰임:
 *   tc-draft --policy 정책서.md                       # 무엇이 될지만 본다(**모델 0회**)
 *   tc-draft --policy 정책서.md --out 초안.tsv --write  # 진짜로 부른다(**모델 N회**)
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseArgv, unknownFlagMessage, type IFlagSpec } from './argv.js';
import {
  buildPrompt,
  draftNotice,
  parseDraftReply,
  splitPolicy,
  toFormRows,
  type IDraftCase,
  type IPolicyUnit,
} from './draft.js';
import { delimiterOf, formatDelimited, type SvFormat } from './sv.js';

const EXIT_OK = 0;
const EXIT_UNMEASURED = 3;

const SPEC: IFlagSpec = {
  boolean: ['--write', '--json'],
  value: ['--policy', '--out', '--format', '--model', '--engine'],
};

const HERE = dirname(fileURLToPath(import.meta.url));
/** 시스템 프롬프트는 양식 옆에 산다 — `dist/tc/` 에서도 `src/tc/` 에서도 같은 깊이다. */
const PROMPT_FILE = resolve(HERE, '..', '..', 'templates', 'tc-draft-prompt.md');
/** 우주의 뿌리 — `qa/` 의 부모. ⛔ 엔진의 **내부 배치**는 여기서 모른다. */
const UNIVERSE_ROOT = resolve(HERE, '..', '..', '..');

interface IClaudeResult {
  text: string;
  isError: boolean;
  failure?: string;
  costUsd: number | null;
}
type CallClaude = (call: {
  systemPromptFile: string;
  input: string;
  model: string;
  toolless?: boolean;
}) => Promise<IClaudeResult>;

const emitJson = (payload: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const bail = (asJson: boolean, code: number, reason: string): number => {
  if (asJson) emitJson({ tool: 'tc-draft', ok: false, ran: true, exitCode: code, unmeasuredReason: reason });
  else console.error(reason);
  return code;
};

/**
 * 모델 호출부를 **엔진에서 빌려 온다.** ⛔ 엔진 배치를 아는 `lib/engine.mjs` 만 부른다.
 * 없으면 「못 쟀다」다 — 다른 길로 몰래 가지 않는다.
 */
const loadCallClaude = async (explicit: string | undefined): Promise<CallClaude | string> => {
  if (explicit !== undefined) {
    try {
      const mod = (await import(pathToFileURL(resolve(process.cwd(), explicit)).href)) as {
        callClaude?: CallClaude;
      };
      if (typeof mod.callClaude !== 'function') return `--engine 로 준 모듈에 callClaude 가 없다: ${explicit}`;
      return mod.callClaude;
    } catch (error) {
      return `--engine 을 못 열었다: ${explicit} — ${(error as Error).message}`;
    }
  }
  const enginePath = join(UNIVERSE_ROOT, 'lib', 'engine.mjs');
  const configPath = join(UNIVERSE_ROOT, 'universe.config.json');
  if (!existsSync(enginePath) || !existsSync(configPath)) {
    return (
      '⚪ **못 쟀다** — 우주의 엔진 배선(`lib/engine.mjs`)을 못 찾았다.\n' +
      `   찾은 자리: ${enginePath}\n` +
      '   ⛔ 모델 부르는 법을 여기서 다시 만들지 않는다(인증 레인이 갈리면 조용히 과금된다).\n' +
      '   · 우주 안에서 돌려라, 또는\n' +
      '   · `--engine <fe-agent-harness 의 dist/index.js>` 로 직접 가리켜라.'
    );
  }
  try {
    const { openEngine } = (await import(pathToFileURL(enginePath).href)) as {
      openEngine: (root: string, config: unknown, want: string[]) => Promise<Record<string, unknown>>;
    };
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
    const opened = await openEngine(UNIVERSE_ROOT, config, ['harness']);
    const harness = opened.harness as { callClaude?: CallClaude } | undefined;
    if (typeof harness?.callClaude !== 'function') return '엔진에 callClaude 가 없다 — 엔진을 빌드했나?';
    return harness.callClaude;
  } catch (error) {
    return (
      `⚪ **못 쟀다** — 엔진을 못 열었다: ${(error as Error).message}\n` +
      '   엔진 dist 가 없으면 이 레인은 안 돈다(`npm --prefix observatory/engine run build`).'
    );
  }
};

const main = async (): Promise<number> => {
  const args = parseArgv(process.argv.slice(2), SPEC);
  const asJson = args.has('--json');
  if (args.unknown.length > 0) {
    return bail(asJson, EXIT_UNMEASURED, unknownFlagMessage(args.unknown, SPEC, 'tc-draft'));
  }

  const policyFile = args.get('--policy');
  if (policyFile === undefined) {
    return bail(asJson, EXIT_UNMEASURED, '⚪ [tc-draft] --policy <정책서 파일> 이 없다.');
  }
  let text: string;
  try {
    text = readFileSync(resolve(process.cwd(), policyFile), 'utf8');
  } catch (error) {
    return bail(asJson, EXIT_UNMEASURED, `⚪ [tc-draft] 정책서를 못 읽었다: ${policyFile} — ${(error as Error).message}`);
  }

  const formatRaw = args.get('--format') ?? 'tsv';
  if (formatRaw !== 'tsv' && formatRaw !== 'csv') {
    return bail(asJson, EXIT_UNMEASURED, `⚪ [tc-draft] 모르는 --format: ${formatRaw} — tsv | csv 뿐이다`);
  }
  const format: SvFormat = formatRaw;

  const { units, dropped } = splitPolicy(text, policyFile);

  if (!asJson) {
    console.log(`── TC 초안 — ${policyFile}`);
    console.log(`   정책 조각 **${units.length}개** (본문이 비어서 뺀 조각 ${dropped}개)`);
  }
  /* §8 — 0개는 「정책이 없다」가 아니라 **못 쟀다**다. 분모를 같이 말한다. */
  if (units.length === 0) {
    return bail(
      asJson,
      EXIT_UNMEASURED,
      `⚪ [tc-draft] 정책 조각을 **0개** 읽었다 (본문이 비어서 뺀 것 ${dropped}개). ` +
        '⛔ 「TC 로 만들 것이 없다」가 아니라 **못 쟀다**다 — 빈 파일이거나, 표·그림뿐이거나(글자만 읽는다).',
    );
  }

  const outFile = args.get('--out');

  /* ── ⛔ 기본은 안 부른다 ───────────────────────────────────────────── */
  if (!args.has('--write')) {
    if (asJson) {
      emitJson({
        tool: 'tc-draft',
        ok: true,
        ran: true,
        exitCode: EXIT_OK,
        modelCalls: 0,
        wouldCall: units.length,
        droppedChunks: dropped,
        units: units.map((u) => ({ anchor: u.anchor, title: u.title })),
      });
      return EXIT_OK;
    }
    console.log('\n(--write 를 안 줬다 — **모델을 부르지 않는다.** 부르면 이렇게 된다:)');
    for (const u of units) console.log(`   · ${u.anchor}  ${u.title}`);
    console.log(`\n   ⛔ 그때 **모델을 ${units.length}번** 부른다 — 정책 조각 하나에 한 번이다.`);
    console.log(`   진짜로 뽑으려면: tc-draft --policy ${policyFile} --out <초안.${format}> --write`);
    return EXIT_OK;
  }

  if (outFile === undefined) {
    return bail(asJson, EXIT_UNMEASURED, '⚪ [tc-draft] --write 를 줬는데 --out <파일> 이 없다 — 어디에 쓸지 모른다.');
  }
  const outPath = resolve(process.cwd(), outFile);
  if (existsSync(outPath)) {
    return bail(asJson, EXIT_UNMEASURED, `⚪ [tc-draft] 이미 있다: ${outFile} — 덮어쓰지 않는다.`);
  }
  if (!existsSync(PROMPT_FILE)) {
    return bail(asJson, EXIT_UNMEASURED, `⚪ [tc-draft] 시스템 프롬프트가 없다: ${PROMPT_FILE}`);
  }

  /* ── ⛔ 부르기 전에 **몇 번 부를지 말하고 경고한다** ─────────────────── */
  const model = args.get('--model') ?? 'sonnet';
  console.error(`\n⛔ **모델을 ${units.length}번 부른다** (정책 조각 하나에 한 번, 모델 ${model}).`);
  console.error('⚠️ **토큰 사용량이 큽니다** — 조각 수만큼 호출이 나갑니다. 멈추려면 지금 Ctrl-C.');
  console.error('   (먼저 --write 없이 돌리면 무엇을 몇 번 부를지 **모델 0회**로 볼 수 있다.)');

  const callClaude = await loadCallClaude(args.get('--engine'));
  if (typeof callClaude === 'string') return bail(asJson, EXIT_UNMEASURED, callClaude);

  const drafts: Array<{ unit: IPolicyUnit; draft: IDraftCase }> = [];
  const problems: string[] = [];
  let calls = 0;
  let cost = 0;
  let costKnown = false;

  for (const unit of units) {
    calls += 1;
    if (!asJson) console.error(`   [${calls}/${units.length}] ${unit.anchor}  ${unit.title}`);
    /* eslint-disable-next-line no-await-in-loop */
    const result = await callClaude({
      systemPromptFile: PROMPT_FILE,
      input: buildPrompt(unit),
      model,
      toolless: true,
    });
    if (result.costUsd !== null) {
      cost += result.costUsd;
      costKnown = true;
    }
    if (result.isError) {
      problems.push(`${unit.anchor}: ${result.failure ?? '모델이 실패했다'}`);
      continue;
    }
    const parsed = parseDraftReply(result.text, unit.anchor);
    problems.push(...parsed.problems);
    for (const draft of parsed.cases) drafts.push({ unit, draft });
  }

  /* ⛔ 0건이면 「TC 가 없다」가 아니라 **못 쟀다**다 — 부른 횟수(분모)를 같이 말한다. */
  if (drafts.length === 0) {
    return bail(
      asJson,
      EXIT_UNMEASURED,
      `⚪ [tc-draft] 모델을 ${calls}번 불렀는데 **초안 0건**이다.\n` +
        problems.map((p) => `   · ${p}`).join('\n'),
    );
  }

  const body =
    `${draftNotice(policyFile).join('\n')}\n` +
    formatDelimited(toFormRows(drafts), delimiterOf(format));
  writeFileSync(outPath, body, 'utf8');

  if (asJson) {
    emitJson({
      tool: 'tc-draft',
      ok: true,
      ran: true,
      exitCode: EXIT_OK,
      modelCalls: calls,
      costUsd: costKnown ? cost : null,
      drafted: drafts.length,
      problems,
      out: outPath,
      notMeasured: '초안이 정책을 옳게 옮겼는지는 재지 않는다 — 사람이 originRef 의 인용문을 대조해야 한다.',
    });
    return EXIT_OK;
  }

  console.log(`\n✅ 초안 ${drafts.length}건 — ${outPath} (모델 ${calls}번${costKnown ? ` · $${cost.toFixed(4)}` : ''})`);
  if (problems.length > 0) {
    console.log(`⚠️ 못 읽은 답 ${problems.length}건:`);
    for (const p of problems) console.log(`   · ${p}`);
  }
  console.log('\n⛔ **이 표는 아직 검증이 아니다.** 모든 줄의 origin 이 검증 분모 밖이다.');
  console.log('   사람이 originRef 의 인용문을 정책서에서 대조하고 origin 을 policy 로 고쳐야 검증으로 센다.');
  console.log(`   그대로 돌려 보려면: tc-form --cases ${outFile} --preconditions <전제 양식>`);
  return EXIT_OK;
};

process.exit(await main());
