/**
 * 「**TC 양식을 내주고, 채워 온 TC 를 받아 돌린다**」 — 콘솔의 서버 쪽.
 *
 * 사용자가 요구한 여섯 중 마지막 둘이다:
 * 「TC 만 있다면 **TC 를 업로드해서 자동수행**, **TC 양식은 다운로드**받게 하고」.
 *
 * ## ⛔⛔ 여기서 판정하지 않는다 — `qa/dist/tc/cli.js` 를 부른다
 *
 * 「끝났는가」·「검증 분모가 0인가」·「판단이 판단인가」·「양식의 칸 이름이 맞는가」는
 * 전부 그 도구와 그 아래 `qa/src/run/` 이 안다. 서버가 그걸 **다시 구현하면 두 자리가
 * 조용히 갈린다** — 갈린 뒤엔 화면이 「통과」라고 말하는데 관문은 빨간불인 상태가 된다.
 * ⇒ **부르고, 도구가 낸 것을 그대로 나른다.** (`clone.ts` 머리말과 같은 규율.)
 *
 * ## ⛔ 종료코드 3 을 **실패로 접지 않는다**
 *
 * 이 도구의 계약은 `0 끝났다 · 1 판단하지 않은 fail 있다 · 3 **못 쟀다**` 다.
 * 3 은 「전제가 안 섰다」·「검증 분모가 0이다」·「양식을 못 읽었다」일 때 나온다 —
 * **그건 실패가 아니라 「모른다」다.** 여기서 3 을 1 처럼 나르면 사람은 없는 실패를
 * 고치러 가고, 진짜 구멍(아무것도 검증하지 않는 TC)은 그대로 남는다(§8).
 * ⇒ `ok` 는 **오직 `exitCode === 0`** 이고, `unmeasured` 를 **따로** 나른다.
 *
 * ## ⛔ 사람이 준 **경로**를 받지 않는다 — **내용**을 받는다
 *
 * 「파일 경로를 주세요」로 만들면 그 순간 이 서버는 **우주 밖 아무 파일이나 읽는 자리**가 된다.
 * (`adopt` 가 「받아 온 자리 안의 초안만」으로 막은 것과 같은 구멍이다.)
 * ⇒ 올린 **텍스트**를 서버가 자기 자리(`.data/tc-uploads/…`)에 쓰고, 그 자리만 도구에 준다.
 *
 * ## ⛔ `--run` 을 화면에서 받지 않는다
 *
 * `tc-form` 은 `--run "<명령>"` 으로 **아무 명령이나** 돌릴 수 있다. 그 칸을 화면에 열면
 * 콘솔이 **원격 명령 실행기**가 된다. ⇒ 이 서버는 그 플래그를 **아예 안 만든다.**
 * 브라우저 주행은 은하가 선언한 축(`commands.e2e`)으로 도는 것이지 사람이 타이핑하는 게 아니다.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { dataDir, HARNESS_ROOT } from './paths.js';
import { runNodeTool } from './run-tool.js';

/** 도구가 사는 자리. ⛔ 빌드 산출이다 — 없으면 「못 쟀다」이지 「TC 가 없다」가 아니다. */
const TC_CLI = join(HARNESS_ROOT, 'qa/dist/tc/cli.js');

/** 올린 양식이 잠깐 머무는 자리 — **gitignore 되는 `.data/` 안**이다. */
const uploadsDir = (): string => join(dataDir(), 'tc-uploads');

export type TcFormat = 'tsv' | 'csv';

export interface ITemplateFile {
  name: string;
  text: string;
}

export interface ITemplateResult {
  ok: boolean;
  format: TcFormat;
  /** ⛔ **둘 다** 준다. 전제 양식을 빼면 「전제 0개」가 되고 그건 통과가 아니라 못 쟀다(3)다. */
  files: ITemplateFile[];
  /** 도구가 사람에게 한 말 — 그대로. */
  say: string;
  exitCode: number | null;
}

/**
 * **양식을 내준다.** 모델을 **0번** 부른다 — 칸 이름은 계약(`qa/src/run/contract.ts`)에서 온다.
 *
 * ⛔ 서버가 양식을 **손으로 짜지 않는다.** 도구를 실제로 돌려서 나온 파일을 읽는다 —
 *    손으로 짜면 계약이 바뀌었을 때 화면만 옛 칸을 나눠 주고, 그걸 채워 온 사람은
 *    **거부당한다.** 그때 사람은 자기가 틀린 줄 안다.
 */
export const emitTemplate = async (format: TcFormat): Promise<ITemplateResult> => {
  const out = join(uploadsDir(), `template-${format}`);
  /* ⛔ 묵은 산출을 읽지 않는다 — 지우고, 만들고, 그 자리에서만 읽는다. */
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const run = await runNodeTool(TC_CLI, ['--emit', out, '--format', format], { timeoutMs: 30_000 });
  if (run.exitCode !== 0) {
    rmSync(out, { recursive: true, force: true });
    return {
      ok: false,
      format,
      files: [],
      say: `${run.stdout}${run.stderr}`.trim(),
      exitCode: run.exitCode,
    };
  }

  /* 도구가 찍은 줄에서 **파일 이름을 읽어 온다**(`   · <경로>`). ⛔ 이름을 서버가 짓지 않는다. */
  const { readFileSync, existsSync } = await import('node:fs');
  const named = [...`${run.stdout}`.matchAll(/^\s*·\s*(\S+)$/gm)].map((m) => m[1] as string);
  const files: ITemplateFile[] = [];
  for (const full of named) {
    if (!existsSync(full)) continue;
    files.push({ name: full.split('/').pop() as string, text: readFileSync(full, 'utf8') });
  }
  rmSync(out, { recursive: true, force: true });

  if (files.length === 0) {
    /* ⛔ **빈 목록을 성공으로 내주지 않는다.** 도구는 0 으로 끝났는데 파일을 못 읽었으면
       그건 「양식이 없다」가 아니라 **여기서 못 읽은 것**이다. */
    return {
      ok: false,
      format,
      files: [],
      say: `도구는 끝났는데 양식 파일을 못 읽었습니다. 도구가 한 말:\n${run.stdout}`.trim(),
      exitCode: run.exitCode,
    };
  }
  return { ok: true, format, files, say: run.stdout.trim(), exitCode: 0 };
};

export interface ITcRunInput {
  cases: string;
  preconditions?: string;
  /** 케이스 파일 이름 — **구분자를 정하는 데만** 쓴다(`.csv` 면 쉼표). */
  casesName?: string;
  preconditionsName?: string;
}

export interface ITcRunResult {
  /** ⛔ **오직 `exitCode === 0`.** 3(못 쟀다)은 여기서 `false` 지만 실패가 **아니다**. */
  ok: boolean;
  /** ⭐ **못 쟀는가**(3). 화면은 이걸 ⚪ 로 그린다 — ❌ 로 그리면 없는 실패를 고치러 간다. */
  unmeasured: boolean;
  exitCode: number | null;
  killed: boolean;
  /** 도구가 `--json` 으로 낸 것. ⛔ 못 읽었으면 `null` 이고 그것도 **사실**이다. */
  report: unknown;
  /** 사람이 읽을 말 — 도구의 stderr 를 **그대로**. */
  say: string;
}

/** 올린 이름이 파일 이름으로 쓸 만한가. ⛔ 경로가 섞이면 받지 않는다. */
const safeName = (name: string | undefined, fallback: string): string => {
  if (typeof name !== 'string' || name === '') return fallback;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return fallback;
  if (!/^[\w.-]{1,80}$/.test(name)) return fallback;
  return name;
};

export const tcInputProblem = (body: unknown): string | null => {
  const it = body as ITcRunInput | null;
  if (it === null || typeof it !== 'object') return '올린 것이 없습니다.';
  if (typeof it.cases !== 'string' || it.cases.trim() === '') return 'TC 케이스 양식을 올려 주세요.';
  if (it.cases.length > 4_000_000) return '케이스 양식이 너무 큽니다(4MB 넘음).';
  if (it.preconditions !== undefined && typeof it.preconditions !== 'string') {
    return '전제 양식의 모양이 틀렸습니다.';
  }
  if ((it.preconditions?.length ?? 0) > 4_000_000) return '전제 양식이 너무 큽니다(4MB 넘음).';
  return null;
};

/**
 * **채워 온 양식을 돌린다.**
 *
 * ⛔ 판정을 여기서 하지 않는다. ⛔ `--run` 을 만들지 않는다(머리말).
 * ⛔ 올린 것을 **저장소 안에 남기지 않는다** — 돌고 나면 지운다. 남기면 그게 다음 사람의
 *    「이미 있는 TC」로 읽히고, 아무도 그게 누가 언제 올린 것인지 모른다.
 */
export const runTc = async (input: ITcRunInput): Promise<ITcRunResult> => {
  const dir = join(uploadsDir(), `run-${String(process.pid)}-${String(process.hrtime.bigint())}`);
  mkdirSync(dir, { recursive: true });
  try {
    const casesPath = join(dir, safeName(input.casesName, 'tc-cases.tsv'));
    writeFileSync(casesPath, input.cases, 'utf8');
    const args = ['--cases', casesPath, '--json'];
    if (typeof input.preconditions === 'string' && input.preconditions.trim() !== '') {
      const prePath = join(dir, safeName(input.preconditionsName, 'tc-preconditions.tsv'));
      writeFileSync(prePath, input.preconditions, 'utf8');
      args.push('--preconditions', prePath);
    }

    const run = await runNodeTool(TC_CLI, args, { timeoutMs: 300_000 });
    /* ⭐ 계약: `--json` 이면 도구가 **돈 이상** stdout 은 항상 유효 JSON 이다 — exit 3 에서도.
       ⛔ 그래서 못 읽었다는 것은 「결과가 없다」가 아니라 **도구가 안 돌았다**는 뜻이다. */
    let report: unknown = null;
    try {
      report = run.stdout.trim() === '' ? null : JSON.parse(run.stdout);
    } catch {
      report = null;
    }
    return {
      ok: run.exitCode === 0,
      unmeasured: run.exitCode === 3 || run.exitCode === null || run.killed,
      exitCode: run.exitCode,
      killed: run.killed,
      report,
      say: `${run.stderr}`.trim() === '' && report === null ? run.stdout.trim() : run.stderr.trim(),
    };
  } finally {
    /* ⛔ 올린 것을 남기지 않는다 — 성공했든 아니든. */
    rmSync(dir, { recursive: true, force: true });
  }
};
