/**
 * 「Playwright 가 뱉은 **주행 결과를 받아, 판정과 함께 나른다**」 — 콘솔의 서버 쪽.
 *
 * ⛔⛔ **여기서 판정을 만들지 않는다.** 접는 것(전제가 안 서면 전부 ⚪) · 세는 것(분모) ·
 *    「끝났는가」(판단하지 않은 fail 0)는 전부 `qa/src/run` 의 계약이 이미 하는 일이다.
 *    서버가 그것을 다시 구현하면 **두 자리가 조용히 갈린다** — 관문은 빨간데 화면은 초록인
 *    상태가 생긴다(R47·R91 이 반복해서 잡은 자리). ⇒ 이 파일은 **부르고, 나른다.**
 *    `observation.ts` 가 `observatory/observe.mjs` 에 대해 하는 것과 **같은 자세**다.
 *
 * 이 파일이 지키는 것 — 전부 「초록으로 보이는 자리」를 막는 일이다:
 *
 *  1. **전제가 케이스보다 먼저다.** 그 순서는 `qa/src/run/report.ts` 가 지킨다 —
 *     서버는 그 결과를 **바꾸지 않고** 그대로 싣는다. 실측(다른 팀): 로그인 세션 수명이
 *     1시간이라 루프 중간에 죽고, 그때 화면은 로그인 페이지를 재고 「전부 fail」을 뱉었다.
 *     제품 결함이 아닌데도.
 *  2. **종료코드를 삼키지 않는다.** `0` 끝났다 / `1` 판단하지 않은 fail 이 있다 /
 *     `3` **못 쟀다**. 셋을 200 하나로 접으면 화면은 「다 봤는데 괜찮다」와 「안 봤다」를
 *     구별할 수 없다 — 그 구별이 이 콘솔의 존재 이유다.
 *     ⛔ **모르는 코드는 ⚪ 다.** 0·1·3 만 안다고 못 박지 않는다.
 *  3. **JSON 파싱 실패는 ⚪ 다.** 「통과」도 「빈 목록」도 아니다. 빈 목록을 주면 화면이 초록을 그린다.
 *     ⚠️ 그래서 **들어온 본문을 서버가 미리 검사하지 않는다** — 깨진 본문도 그대로 도구에게
 *     넘기고, 「⚪ JSON 파싱 실패」라는 **계약의 말**을 받아 나른다. 서버가 앞에서 400 을 내면
 *     그 판정 어휘가 하나 사라진다.
 *  4. ⛔ **4xx 를 결과에 쓰지 않는다.** 「전제가 안 섰다」·「검증 분모가 0이다」·「모르는 모양이다」는
 *     전부 **결과**이지 요청이 잘못된 것이 아니다. `galaxy-draft` 가 「그 폴더에 `package.json` 이
 *     없다」를 4xx 로 안 주는 것과 같은 갈림이다. 400 은 **질의 문자열의 모양**이 틀렸을 때뿐이다.
 *  5. **분모를 빼지 않는다.** 도구의 JSON 을 **통째로** 싣는다(`stats` · `verification`).
 *     칸을 골라 담으면 「fail 3건」이 3/3 인지 3/300 인지 모르게 된다.
 *  6. **브라우저를 띄우지 않는다.** 이 길은 **받는 길**이다 — Playwright 는 밖에서 돈다.
 */
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { dataDir, HARNESS_ROOT } from './paths.js';
import { runNodeTool } from './run-tool.js';

/** 재는 **유일한** 자리. 서버는 이것을 부르기만 한다. */
const toolPath = (): string => join(HARNESS_ROOT, 'qa/dist/run/cli.js');
/** 계약의 원본. 빌드가 낡았는지 견주려고만 본다. */
const contractSrcDir = (): string => join(HARNESS_ROOT, 'qa/src/run');

/** 도구를 어떻게 불렀나 — 사람이 손으로 다시 칠 수 있어야 「했습니다」가 검증된다. */
export interface IToolTrace {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** 어느 모양으로 읽었나. ⛔ `unknown` 을 계약 모양으로 짐작하지 않는다 — 도구가 답한다. */
export type RunShape = 'contract' | 'playwright' | 'unknown';

export interface IRunReceipt {
  /**
   * ⭐ **도구의 JSON 그대로.** 칸을 골라 담지 않는다 — `stats`(분모) · `verification` ·
   * `done` 이 여기 있고, 하나라도 빠지면 「fail 3건」의 뜻이 사라진다.
   * ⛔ `null` 은 **못 받았다**이지 「결과가 없다」가 아니다 — 그때 `unmeasured` 가 채워진다.
   */
  report: unknown;
  /** 서버가 본문을 어떤 모양으로 읽어 도구에 넘겼나. 판정이 아니라 **경로**다. */
  shape: RunShape;
  /**
   * ⚪ **못 쟀다** — 잴 수가 없었던 이유. `null` 이면 **도구가 답한 것**이다.
   * ⛔ 이것은 ❌(잰 빨강)가 아니다. 화면은 색과 문구를 갈라 그린다.
   */
  unmeasured: string | null;
  /**
   * ⭐ 도구의 종료코드. `0` 끝났다 · `1` 판단하지 않은 fail · `3` 못 쟀다 ·
   * 그 밖(또는 `null`) = **서버가 뜻을 모른다** ⇒ 위 `unmeasured` 가 채워진다.
   */
  exitCode: number | null;
  /** 도구가 아니라 **서버가** 알아챈 것(빌드가 낡았다 등). 판정이 아니다. */
  notes: string[];
  tool: IToolTrace;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 본문이 어느 모양인가. ⛔ **판정이 아니라 경로 고르기**다 — 여기서 못 알아봐도 버리지 않고
 * 그대로 도구에 넘긴다. 「모르는 모양이다」라고 말하는 것은 계약의 몫이다(⚪).
 */
export const shapeOf = (payload: unknown): RunShape => {
  if (!isRecord(payload)) return 'unknown';
  if (Array.isArray(payload['cases']) && Array.isArray(payload['preconditions'])) return 'contract';
  if (Array.isArray(payload['suites'])) return 'playwright';
  return 'unknown';
};

/** 질의 문자열의 **모양**만 본다. ⛔ 결과를 여기서 가르지 않는다. */
export const fromParamProblem = (raw: string | undefined): string | null => {
  if (raw === undefined || raw === '') return null;
  if (raw === 'playwright' || raw === 'contract') return null;
  return `from 은 playwright 또는 contract 여야 합니다: ${raw}`;
};

const newest = (dir: string): number => {
  if (!existsSync(dir)) return 0;
  let max = 0;
  for (const f of readdirSync(dir)) {
    const t = statSync(join(dir, f)).mtimeMs;
    if (t > max) max = t;
  }
  return max;
};

/**
 * 빌드가 원본보다 낡았는가. ⛔ 이건 ⚪ 가 아니라 **주의**다 — 도구는 돌았고 답도 왔다.
 * ⚠️ 그래도 적는다: 낡은 `dist` 는 **옛 판정을 화면까지 나른다.**
 */
export const staleBuildNote = (srcDir: string, builtDir: string): string[] => {
  const src = newest(srcDir);
  const built = newest(builtDir);
  /* 둘 중 하나를 못 읽으면 **모르는 것**이다 — 「최신이다」로 접지 않고 그냥 말하지 않는다. */
  if (src === 0 || built === 0 || built >= src) return [];
  return [
    '⚠️ qa/dist/run 이 qa/src/run 보다 낡았다 — 화면이 **옛 계약의 판정**을 받고 있을 수 있다. ' +
      '`cd qa && npm run build` 로 맞춰라.',
  ];
};

/* ⛔ 경로를 밖에서 받는다 — 안 그러면 이 검사를 **일부러 깨서 확인할 수가 없다**(저장소 밖을 만져야 한다). */
const stalenessNote = (): string[] =>
  staleBuildNote(contractSrcDir(), join(HARNESS_ROOT, 'qa/dist/run'));

/** 임시 파일 — ⛔ `.data/`(gitignore) 안에만 쓴다. 본문에 계정/URL 이 섞여 올 수 있다. */
let seq = 0;
const tempDir = (): string => join(dataDir(), 'runs');
const tempFile = (suffix: string): string => {
  seq += 1;
  return join(tempDir(), `run-${process.pid}-${Date.now()}-${seq}-${suffix}.json`);
};

/** 못 쟀을 때의 답 — 지어낸 초록 대신 **이유**를 준다. */
const unmeasuredReceipt = (
  shape: RunShape,
  why: string,
  tool: IToolTrace,
  notes: string[] = [],
): IRunReceipt => ({
  /* ⛔ `{}` 도 `[]` 도 아니라 `null` 이다. 빈 모양은 화면에서 「0건을 쟀다」로 읽힌다. */
  report: null,
  shape,
  unmeasured: why,
  exitCode: tool.exitCode,
  notes,
  tool,
});

export interface IReceiveOptions {
  /** 사람이 못 박은 모양. 없으면 본문에서 알아본다. */
  from?: string | undefined;
  /**
   * TC id → 출처. ⛔ **여기 없는 TC 는 `unknown` 이 되고 검증 분모에서 빠진다** — 계약이 그렇게 정했다.
   * (`--from-playwright` 일 때만 뜻이 있다.)
   */
  origins?: unknown;
}

/**
 * 주행 결과 본문을 받아 도구에 넘기고, **그 답을 그대로** 돌려준다.
 *
 * ⛔ 예외를 던지지 않는다. 「전제가 안 섰다」·「분모가 0이다」·「깨진 JSON 이다」는 전부 **결과**다.
 * ⚠️ `raw` 는 **손대지 않은 본문**이다. 서버가 미리 파싱해서 되쓰지 않는다 —
 *    되쓰면 「도구가 무엇을 읽었나」가 화면에 보이는 것과 달라진다.
 */
export const receiveRunResult = async (
  raw: string,
  options: IReceiveOptions = {},
): Promise<IRunReceipt> => {
  /* 파싱은 **경로를 고르려고만** 한다. 실패해도 던지지 않는다 — 깨진 본문은 그대로 넘어간다. */
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }
  const detected = shapeOf(payload);
  const shape: RunShape =
    options.from === 'playwright' ? 'playwright' : options.from === 'contract' ? 'contract' : detected;

  const notes = stalenessNote();
  if (options.from === undefined && detected === 'unknown') {
    notes.push(
      'ⓘ 본문이 계약 모양(preconditions[]·cases[])도 Playwright 리포트(suites[])도 아니다 — ' +
        '도구에 그대로 넘겨 계약이 답하게 뒀다.',
    );
  }

  const usePlaywright = shape === 'playwright';
  const blankCommand = `node qa/dist/run/cli.js <본문>${usePlaywright ? ' --from-playwright' : ''} --json`;

  if (!existsSync(toolPath())) {
    return unmeasuredReceipt(
      shape,
      `주행 결과 도구를 못 찾았다: qa/dist/run/cli.js\n` +
        '서버는 판정을 직접 만들지 않는다 — 계약이 빌드돼 있어야 잰다(`cd qa && npm run build`).',
      { command: blankCommand, exitCode: null, stdout: '', stderr: '' },
      notes,
    );
  }

  mkdirSync(tempDir(), { recursive: true });
  const bodyPath = tempFile('body');
  const originsPath = options.origins === undefined ? null : tempFile('origins');

  /**
   * ⭐⭐ **출처 명부의 정본은 하나다** — `qa/e2e/origins.json`.
   *
   * ⛔⛔ 실측으로 데였다. 같은 Playwright 리포트를 두 자리가 판정했는데 **답이 갈렸다**:
   *   · 축(`observatory/loop-state.mjs`)은 `--origins qa/e2e/origins.json` 을 넘겨 **검증 7건**
   *   · 콘솔은 아무것도 안 넘겨 **검증 0건 · 「전부 자기 채점」**
   * 사람이 보는 쪽이 **틀린 답**을 냈다. 화면에는 「분모가 0이다 — 이 주행은 아무것도 검증하지
   * 않았다」가 떴는데, 그 주행은 **문서에서 뽑은 TC 7건을 실제로 검증**하고 있었다.
   * ⇒ 부르는 쪽이 안 주면 **저장소의 명부를 기본으로** 쓴다. 정본이 둘이면 반드시 갈린다(R47·R91).
   * ⚠️ 부르는 쪽이 주면 그것이 이긴다 — 다른 저장소의 명부를 넘길 수 있어야 한다.
   * ⛔ 파일이 없으면 **지어내지 않는다** — 안 넘기고, 그러면 예전처럼 `unknown` 이 된다.
   */
  const houseOrigins = join(HARNESS_ROOT, 'qa/e2e/origins.json');
  const fallbackOrigins = originsPath === null && usePlaywright && existsSync(houseOrigins)
    ? relative(HARNESS_ROOT, houseOrigins)
    : null;
  /* ⛔ 절대 경로를 도구에 넘기지 않는다 — 도구의 메시지에 남의 홈 경로가 박힌다(R152).
     `runNodeTool` 의 cwd 는 언제나 저장소 뿌리라 상대경로가 그대로 재현된다. */
  const relBody = relative(HARNESS_ROOT, bodyPath);
  const relOrigins = originsPath === null ? null : relative(HARNESS_ROOT, originsPath);

  try {
    writeFileSync(bodyPath, raw, 'utf8');
    if (originsPath !== null) writeFileSync(originsPath, JSON.stringify(options.origins), 'utf8');

    const args = [
      relBody,
      ...(usePlaywright ? ['--from-playwright'] : []),
      ...(relOrigins !== null ? ['--origins', relOrigins] : []),
      ...(relOrigins === null && fallbackOrigins !== null ? ['--origins', fallbackOrigins] : []),
      '--json',
    ];
    const command = `node qa/dist/run/cli.js ${args.join(' ')}`;
    const ran = await runNodeTool(toolPath(), args);
    const tool: IToolTrace = {
      command,
      exitCode: ran.exitCode,
      stdout: ran.stdout,
      stderr: ran.killed ? `${ran.stderr}\n⛔ 도구가 시간 안에 끝나지 않아 끊었다(120초).` : ran.stderr,
    };

    /**
     * ⛔ **모르는 코드를 「끝났다」로 접지 않는다.** `null`(신호로 죽음·시간 제한)도 여기다.
     *    지금 도구는 0·1·3 만 내지만, 서버가 그걸 못 박으면 도구가 새 코드를 내는 날
     *    화면이 조용히 초록이 된다.
     */
    if (ran.exitCode !== 0 && ran.exitCode !== 1 && ran.exitCode !== 3) {
      return unmeasuredReceipt(
        shape,
        `주행 결과 도구가 ${ran.exitCode === null ? '코드 없이' : `${ran.exitCode} 로`} 끝났다 — ` +
          '0(끝났다)도 1(판단하지 않은 fail)도 3(못 쟀다)도 아니라 서버가 뜻을 모른다.\n' +
          (tool.stderr.trim() || '(도구가 아무 말도 남기지 않았다)'),
        tool,
        notes,
      );
    }

    /* ⛔ JSON 이 아니면 그것은 **⚪** 다. 빈 목록을 주면 화면이 초록을 그린다. */
    let parsed: unknown;
    try {
      parsed = JSON.parse(ran.stdout);
    } catch (e) {
      return unmeasuredReceipt(
        shape,
        '도구의 표준출력이 JSON 이 아니다 — 못 쟀다(끝났다는 뜻이 **아니다**).\n' +
          `${(e as Error).message}\n` +
          '⚠️ `--json` 일 때 사람용 출력은 stderr 로 간다. stdout 만 JSON 이다.\n' +
          `stdout 앞부분: ${JSON.stringify(ran.stdout.slice(0, 200))}`,
        tool,
        notes,
      );
    }

    if (!isRecord(parsed) || parsed['tool'] !== 'tc-run') {
      return unmeasuredReceipt(
        shape,
        `도구가 아는 모양이 아니다(tool: ${JSON.stringify(
          isRecord(parsed) ? parsed['tool'] : null,
        )}) — 서버는 짐작해서 채우지 않는다.`,
        tool,
        notes,
      );
    }

    /**
     * ⛔ **JSON 이 말한 코드와 프로세스가 낸 코드가 다르면 못 믿는다.** 도구는 둘을 같게 낸다고
     *    적어 두었다(cli.ts ⭐ 절). 갈리면 어느 쪽이 참인지 서버가 정할 일이 아니다.
     */
    const reported = typeof parsed['exitCode'] === 'number' ? parsed['exitCode'] : null;
    if (reported !== ran.exitCode) {
      return unmeasuredReceipt(
        shape,
        `도구가 JSON 에 적은 종료코드(${reported})와 실제 종료코드(${ran.exitCode})가 다르다 — ` +
          '어느 쪽이 참인지 서버가 정하지 않는다.',
        tool,
        notes,
      );
    }

    /**
     * 도구가 **못 쟀다**고 말한 자리를 그대로 옮긴다. ⛔ 여기서 새로 판정하지 않는다 —
     * `measurable:false` 도, 분모 0 도, 깨진 JSON 도 전부 도구가 이미 3 으로 말했다.
     */
    const unmeasured =
      ran.exitCode === 3
        ? typeof parsed['unmeasuredReason'] === 'string'
          ? parsed['unmeasuredReason']
          : isRecord(parsed['done']) && typeof parsed['done']['reason'] === 'string'
            ? parsed['done']['reason']
            : '도구가 「못 쟀다」(3)로 끝냈는데 이유를 안 적었다 — 아래 도구 출력 원문을 보라.'
        : null;

    return { report: parsed, shape, unmeasured, exitCode: ran.exitCode, notes, tool };
  } finally {
    /* 본문에 계정·URL 이 섞여 올 수 있다 — 답을 만들고 나면 남기지 않는다. */
    rmSync(bodyPath, { force: true });
    if (originsPath !== null) rmSync(originsPath, { force: true });
  }
};

/**
 * 봉투를 벗긴다 — `{ report, origins }` 로 오면 안쪽을 꺼낸다.
 *
 * ⚠️ 왜 두 모양을 다 받나: 주행 결과 파일은 **그대로**(`--data-binary @report.json`) 던지는 것이
 *    가장 재현하기 쉽고, 출처 표(`origins`)는 그 파일 안에 넣을 자리가 없다.
 * ⛔ **봉투일 때만 되쓴다.** 맨 본문은 한 글자도 손대지 않고 도구에 넘긴다 — 되쓰면
 *    「도구가 무엇을 읽었나」가 화면에 보이는 것과 달라지고, 깨진 본문은 여기서 죽는다.
 */
export const unwrapEnvelope = (raw: string): { raw: string; origins?: unknown } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { raw }; // 깨진 본문 — 그대로 넘긴다. ⚪ 라고 말하는 것은 계약의 몫이다.
  }
  if (!isRecord(parsed)) return { raw };
  if (parsed['report'] === undefined) return { raw };
  if (shapeOf(parsed) !== 'unknown') return { raw }; // 계약/리포트 모양이면 봉투가 아니다
  return {
    raw: JSON.stringify(parsed['report']),
    ...(parsed['origins'] === undefined ? {} : { origins: parsed['origins'] }),
  };
};
