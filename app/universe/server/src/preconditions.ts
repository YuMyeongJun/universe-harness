/**
 * 전제 선언 층 — **재기 전에 「잴 수 있는가」를 먼저 묻는다.**
 *
 * ⛔⛔ 이 파일이 지키는 규율 하나: **「못 쟀다」는 「실패」가 아니다.**
 *   · ❌ 실패    = 쟀는데 결과가 나쁘다 (제품 결함)
 *   · ⚪ 못 쟀다 = **잴 수가 없었다** (환경이 없다) — 통과도 실패도 아니다
 *   둘을 같은 칸에 넣으면 사람은 **제품 결함이 아닌 것을 파고**, 결국 도구를 안 믿게 된다.
 *
 * ⛔ **실패 메시지를 읽어서 「이건 환경 탓인가」를 맞히려 들지 않는다.** 돌리기 전에 **묻는다.**
 *   이 저장소의 선례: 갓 클론한 우주에서 `dist` 가 없어 빨간불 6개가 났는데,
 *   「관문 자신이 **나는 엔진이 필요하다**고 말한다」로 고쳤다. 문자열로 짐작하지 않는다.
 *
 * ⛔ **못 재는 항목은 빈 값이 아니라 `null` 이다.** `ok: false`(재 봤더니 안 선다)와
 *   `ok: null`(**전제 자체를 안 쟀다**)은 다르다. 빈 칸과 「없다」는 다르다.
 *
 * 재는 법: `node dist/precondition-report.js` (한 번 불러 JSON 을 그대로 본다)
 */
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { reloadSession } from './collect.js';
import { HARNESS_ROOT } from './paths.js';

/** 이 콘솔이 재기 전에 확인하는 전제. **여기 없는 것은 확인하지 않는다** — 열거가 곧 선언이다. */
export type PreconditionId = 'browser-binary' | 'session-alive' | 'required-env';

export interface IPrecondition {
  id: PreconditionId;
  /**
   * · `true`  — 재 봤고 **선다**
   * · `false` — 재 봤고 **안 선다** (이 주행의 결과는 전부 ⚪ 다)
   * · `null`  — ⛔ **이 전제를 안 쟀다.** 「괜찮다」가 아니다. 빈 칸도 아니다.
   */
  ok: boolean | null;
  /** 왜 그렇게 판정했는가. **`ok` 가 `true` 가 아니면 반드시 채운다.** */
  detail?: string;
}

/**
 * 한 주행의 결과. ⭐ **`preconditions` 가 `cases` 보다 먼저 실린다** —
 * 읽는 사람이 「이 숫자를 믿어도 되는가」를 숫자보다 먼저 보게 한다.
 */
export interface IRun<TCase> {
  preconditions: IPrecondition[];
  /** 전제가 전부 `ok: true` 일 때만 참이다. `null` 이 하나라도 있으면 거짓이다. */
  measurable: boolean;
  /** ⛔ 못 잴 때는 `[]` 가 **아니라** `null` 이다. 빈 목록은 「0건을 쟀다」로 읽힌다. */
  cases: TCase[] | null;
  /** 못 잴 때 사람에게 보일 한 덩이. 잴 수 있으면 `null`. */
  unmeasured: string | null;
}

/**
 * 전제가 **전부** `ok === true` 인가.
 *
 * ⛔⛔ **`true` 만 통과다. `null` 은 막는다.** 다음 사람이 「`null` 은 실패가 아니니
 *    통과시키자」로 되돌리기 쉬운 자리라 여기 못 박는다:
 *
 *    · `false` 를 막는 이유 — 재 봤더니 안 선다. 자명하다.
 *    · `null` 을 막는 이유 — **안 쟀다는 것이 「괜찮다」는 뜻이 될 수 없다.**
 *      `ok !== false` 로 느슨해지는 순간 ⚪(안 쟀다)가 ✅(쟀고 괜찮다)로 **조용히 접힌다.**
 *      그러면 세션이 죽은 채 도는 루프가 「전부 통과」로 보고되고, 이 층은 존재 이유를 잃는다.
 *      `null` 은 **모르는 것**이고, 모르는 것을 통과로 세는 것이 이 저장소가 가장 싫어하는 자리다.
 *
 * ⚠️ 「이 은하는 그 축을 안 쓴다」는 `null` 이 **아니라** `ok: true` 다 — 볼 것이 없다는 뜻이고,
 *    그건 검사가 **돌았고** 막을 것이 없었다는 판정이다. 둘을 섞으면 안 쓰는 축 하나가
 *    은하의 모든 주행을 영영 ⚪ 로 만든다(`session-alive` 가 실제로 그랬다).
 */
export const stands = (list: readonly IPrecondition[]): boolean =>
  list.every((p) => p.ok === true);

/** 못 재는 이유를 사람 문장으로. 잴 수 있으면 `null`. */
export const cannotMeasureBecause = (list: readonly IPrecondition[]): string | null => {
  const blocked = list.filter((p) => p.ok !== true);
  if (blocked.length === 0) return null;
  return [
    '⚪ **못 쟀다** — 재기 전에 확인하는 전제가 서지 않았다. ❌(제품 결함)가 아니다.',
    ...blocked.map(
      (p) =>
        `   · ${p.id}: ${p.ok === null ? '**안 쟀다**' : '안 선다'}${p.detail ? ` — ${p.detail}` : ''}`,
    ),
  ].join('\n');
};

/** 잴 수 있었던 주행. */
export const measuredRun = <T>(preconditions: IPrecondition[], cases: T[]): IRun<T> => ({
  preconditions,
  measurable: true,
  cases,
  unmeasured: null,
});

/** ⛔ 못 잰 주행 — `cases` 를 **`null` 로 두고 「안 잰다」고 선언한다.** */
export const unmeasuredRun = <T>(preconditions: IPrecondition[]): IRun<T> => ({
  preconditions,
  measurable: false,
  cases: null,
  unmeasured: cannotMeasureBecause(preconditions) ?? '전제를 못 쟀다.',
});

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/* ── ① browser-binary ─────────────────────────────────────────────
 * ⛔ 「띄워 보고 실패하면 환경 탓」이 아니다. **Playwright 에게 직접 묻는다** —
 *    "네 chromium 실행 파일이 어디냐" 를 묻고, 그 자리에 파일이 있는지만 본다.
 *    돌리기 전에 알 수 있는 것을 돌려 보고 알아내면, 실패 메시지가 바뀌는 날 조용히 틀린다. */
export const browserBinary = async (): Promise<IPrecondition> => {
  const id = 'browser-binary' as const;
  let executablePath: string;
  try {
    /* 동적으로 부른다 — 패키지 자체가 없을 때 **모듈 로드에서 죽지 않고 판정으로 남기려고**. */
    const pw = await import('playwright');
    executablePath = pw.chromium.executablePath();
  } catch (e) {
    return {
      id,
      ok: false,
      detail: `Playwright 가 chromium 실행 파일 자리를 알려주지 못한다: ${message(e)}\n   \`npm i\` 와 \`npx playwright install chromium\` 을 먼저 돌려라.`,
    };
  }
  if (executablePath === '') {
    return { id, ok: false, detail: 'Playwright 가 chromium 실행 파일 경로를 빈 문자열로 준다.' };
  }
  if (!existsSync(executablePath)) {
    return {
      id,
      ok: false,
      detail: `Playwright 가 가리키는 자리에 chromium 이 없다: ${executablePath}\n   \`npx playwright install chromium\` 을 먼저 돌려라. (⚪ 못 쟀다이지 ❌ 실패가 아니다.)`,
    };
  }
  return { id, ok: true, detail: executablePath };
};

/* ── ② session-alive ──────────────────────────────────────────────
 * ⚠️⚠️ **SPA 는 세션이 갈려도 새로고침 전까지 옛 계정이 화면에 남는다.**
 *      새로고침 없이 재면 **거짓 초록**이 나온다 — 그래서 `reloadSession` 이
 *      **반드시 새로고침한 뒤** URL 을 준다.
 * ⚠️ 세션에는 TTL 이 있다고 전해 들었다(다른 팀 전달값 「1시간」 — ⛔ 원문 대조 전이라
 *    **임계값으로 쓰지 않는다**). 그래서 시계로 판정하지 않고 **주행 직전에 다시 새로고침해서
 *    잰다.** 오래 도는 루프 중간에 세션이 죽으면 그 뒤 결과는 ⚪ 여야 하지 ❌ 가 아니다. */

/** 로그인 URL 과 같은 화면인가 — **경로만** 본다(쿼리의 `?redirect=` 는 매번 다르다). */
const samePlace = (a: string, b: string): boolean => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const norm = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p);
    return x.host.toLowerCase() === y.host.toLowerCase() && norm(x.pathname) === norm(y.pathname);
  } catch {
    return false;
  }
};

const minutes = (ms: number): string => `${Math.floor(ms / 60_000)}분`;

/**
 * 이 은하/주행이 **세션 축을 쓰는가.** ⛔ 우주가 짐작하지 않는다 — **은하가 선언한다**(§9).
 *
 * · `'not-declared'` — 안 쓴다. **막을 것이 없다 → `ok: true`** (`required-env` 의 옵트인과 같은 결)
 * · `'declared'`     — 쓴다. 그러면 **실제로 재야 하고**, 못 재면 `null` → 주행은 ⚪
 * · `'unknown'`      — 좌표를 못 읽어 **쓰는지조차 모른다** → `null`
 */
export type SessionUse = 'declared' | 'not-declared' | 'unknown';

/**
 * 좌표에서 읽을 칸의 이름. ⛔ **여기 한 곳에만 적는다** — 이름이 두 곳에 생기면 조용히 갈린다.
 *
 * ⚠️ **URL 은 좌표에 안 적는다.** `galaxies/*.json` 은 커밋된다 —
 *    로그인 주소를 거기 적으면 회사 주소가 공개 저장소로 실려 나간다
 *    (이 저장소가 절대 경로로 이미 데였다: `galaxies.local/` 이 그래서 생겼다).
 *    그래서 좌표는 **「쓴다/안 쓴다」만** 선언하고, 주소는 기계 안의 실측 초안(`.data`, gitignore 됨)이 갖는다.
 */
export const SESSION_FIELD = 'requiresSession';

/**
 * @param declaredByRun 주행 **자신**의 선언. 좌표와 별개다 —
 *   화면을 걷는 주행(`scan`)은 **좌표가 뭐라 하든 살아 있는 세션이 필요하다.**
 *   ⛔ 이건 짐작이 아니라 선언이다: 이 저장소의 선례가 「관문 자신이 **나는 엔진이 필요하다**고
 *   말한다」였다. 주행도 자기가 무엇을 필요로 하는지 말할 수 있다.
 */
export const sessionUse = (coord: Coordinate, declaredByRun?: boolean): SessionUse => {
  if (declaredByRun === true) return 'declared';
  if (!coord.read) return 'unknown';
  /* ⛔ `true` 일 때만 선언으로 친다. 오타(`"yes"`·`1`)로 은하 전체를 세우지 않는다 —
     좌표 형식을 무는 건 형식 검사가 할 일이지 여기서 할 일이 아니다(R58, required-env 와 같은 결). */
  return coord.galaxy[SESSION_FIELD] === true ? 'declared' : 'not-declared';
};

export const sessionAlive = async (opts: {
  use: SessionUse;
  domain: string | null;
  loginUrl: string;
  /** chromium 이 서는가. 안 서면 세션은 **잴 수가 없다**(선언했을 때만 의미가 있다). */
  binaryOk?: boolean;
  /** 말에 쓸 좌표 이름 */
  galaxy?: string;
}): Promise<IPrecondition> => {
  const id = 'session-alive' as const;
  const where = opts.galaxy ?? galaxyName();

  /* ── 첫째 칸: **선언 안 함** — 「안 쟀다」가 아니라 **볼 것이 없다.**
     ⛔ 여기를 `null` 로 두면, 로그인이 필요 없는 은하는 **어떤 주행도 측정으로 안 세어진다.**
        그러면 사람이 ⚪ 를 배경 소음으로 읽고, 진짜 ⚪(세션이 죽었다)가 왔을 때 아무도 안 본다. */
  if (opts.use === 'not-declared') {
    return {
      id,
      ok: true,
      detail: `좌표 ${where} 가 ${SESSION_FIELD} 를 선언하지 않았고 이 주행도 세션을 요구하지 않는다 — 로그인 뒤 화면을 걷지 않으므로 막을 것이 없다. ⚠️ 로그인이 필요한 은하인데 선언을 빼먹으면 이 칸이 조용히 초록이 된다 — 선언은 **은하가** 한다(§9).`,
    };
  }
  if (opts.use === 'unknown') {
    return {
      id,
      ok: null,
      detail: `좌표 ${where} 를 못 읽어 이 은하가 세션을 쓰는지조차 모른다 — **안 잰다.**`,
    };
  }

  /* ── 둘째 칸: **선언했다.** 여기서부터 못 재면 전부 `null` 이다. ── */
  if (opts.binaryOk === false) {
    return { id, ok: null, detail: 'chromium 이 없어 브라우저를 띄울 수조차 없다 — 세션은 **안 잰다.**' };
  }
  if (opts.domain === null || opts.domain === '') {
    return {
      id,
      ok: null,
      detail: '세션을 쓴다고 선언했는데 어느 도메인의 세션인지 안 정해졌다 — **안 잰다.**',
    };
  }
  const probe = await reloadSession(opts.domain);
  if (probe.kind === 'none') {
    return { id, ok: null, detail: '브라우저가 열려 있지 않다. 잴 대상이 없어 **안 잰다.**' };
  }
  if (probe.kind === 'other') {
    return {
      id,
      ok: null,
      detail: `열려 있는 세션은 다른 도메인(${probe.domain})의 것이다 — ${opts.domain} 의 세션은 **안 잰다.**`,
    };
  }
  if (probe.kind === 'error') {
    /* ⛔ 여기서 「세션이 죽었다」고 단정하지 않는다. 새로고침이 못 끝난 것과
     *    세션이 갈린 것을 구별할 수가 없다 — 구별 못 하면 **안 잰다**고 말한다. */
    return { id, ok: null, detail: `새로고침이 끝나지 않아 세션을 **못 쟀다**: ${probe.message}` };
  }
  const age = minutes(probe.ageMs);
  if (opts.loginUrl.trim() === '') {
    return {
      id,
      ok: null,
      detail: `새로고침은 했고 지금 ${probe.url} 에 있다. 그런데 로그인 URL 이 없어 「로그인 화면으로 튕겼는지」를 가릴 기준이 없다 — **안 잰다.** (연 지 ${age})`,
    };
  }
  if (samePlace(probe.url, opts.loginUrl)) {
    return {
      id,
      ok: false,
      detail: `새로고침하니 로그인 화면으로 돌아왔다 (${probe.url}). 세션이 죽었다 — 사람이 다시 로그인해야 한다. 연 지 ${age}. ⚪ 이 주행의 결과는 못 잰 것이지 ❌ 가 아니다.`,
    };
  }
  return {
    id,
    ok: true,
    detail: `새로고침 뒤에도 ${probe.url} 에 남아 있다 (기준: 선언된 로그인 URL 경로 ${opts.loginUrl} 와 비교). 연 지 ${age}.`,
  };
};

/* ── ③ required-env ───────────────────────────────────────────────
 * ⛔ **값을 읽지 않는다. 있는지만 본다.** 봤다고 적으면 로그로 새어 나간다.
 * ⛔ 판정 규칙을 여기에 다시 쓰지 않는다 — `lib/required-env.mjs` 가 소유하고,
 *    이 서버는 **그 결과를 소비하기만** 한다. 두 곳에 규칙이 생기면 조용히 갈린다. */

/** 좌표는 **로컬 명부가 먼저다**(`lib/galaxy-load.mjs` 와 같은 순서). */
const GALAXY_DIRS = ['galaxies.local', 'galaxies'] as const;

const findGalaxyFile = (name: string): string | null => {
  for (const dir of GALAXY_DIRS) {
    const candidate = join(HARNESS_ROOT, dir, `${name}.json`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

export const galaxyName = (): string => process.env['UNIVERSE_GALAXY'] ?? 'console';

/**
 * 좌표를 한 번만 읽는다 — 전제 둘(`required-env`·`session-alive`)이 **같은 좌표**를 보는데
 * 각자 읽으면 「없다/못 읽었다」에 대해 조용히 다른 말을 하게 된다.
 *
 * ⚠️ **「없다」와 「못 읽었다」를 가른다** — 파일이 있는데 문법이 깨진 것을 「없는 은하」라고
 *    말하면 사람은 등록을 뒤지러 간다. 문제는 문법인데(`lib/galaxy-load.mjs` 가 겪은 그것).
 */
type Coordinate =
  | { read: true; galaxy: Record<string, unknown> }
  | { read: false; why: string };

const readGalaxy = (name: string): Coordinate => {
  const file = findGalaxyFile(name);
  if (file === null) {
    return {
      read: false,
      why: `좌표를 못 찾았다 (${GALAXY_DIRS.map((d) => `${d}/${name}.json`).join(' · ')})`,
    };
  }
  try {
    return { read: true, galaxy: JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> };
  } catch (e) {
    return { read: false, why: `좌표를 못 읽었다 (없는 것이 아니다): ${message(e)}` };
  }
};

export const requiredEnv = async (
  name = galaxyName(),
  coord: Coordinate = readGalaxy(name),
): Promise<IPrecondition> => {
  const id = 'required-env' as const;
  if (!coord.read) {
    return {
      id,
      ok: null,
      detail: `${coord.why} — 무엇이 필요한지는 **은하가 선언**하는데 그 선언을 못 읽었으니 **안 잰다.**`,
    };
  }

  let mod: { missingEnv?: unknown; cannotStandMessage?: unknown };
  try {
    mod = (await import(pathToFileURL(join(HARNESS_ROOT, 'lib/required-env.mjs')).href)) as {
      missingEnv?: unknown;
      cannotStandMessage?: unknown;
    };
  } catch (e) {
    return {
      id,
      ok: null,
      detail: `판정 도구(lib/required-env.mjs)를 못 불렀다: ${message(e)} — **안 잰다.**`,
    };
  }
  if (typeof mod.missingEnv !== 'function') {
    return {
      id,
      ok: null,
      detail:
        'lib/required-env.mjs 가 missingEnv 를 주지 않는다 — 규칙을 여기서 다시 쓰지 않으므로 **안 잰다.**',
    };
  }

  const missing = (mod.missingEnv as (g: unknown, e: NodeJS.ProcessEnv) => string[])(
    coord.galaxy,
    process.env,
  );
  if (missing.length === 0) {
    /* ⚠️ **「선언한 것이 전부 있다」와 「아무것도 선언 안 했다」는 다르다.**
     *    둘 다 은하는 서지만, 같은 문장으로 말하면 사람은 「검사가 돌았다」고 잘못 읽는다.
     *    ⛔ 판정은 여전히 D 의 모듈이 한다 — 여기서는 **말을 가르기 위해서만** 선언을 본다. */
    const declared = coord.galaxy['requiredEnv'];
    return {
      id,
      ok: true,
      detail:
        declared === undefined || declared === null
          ? `좌표 ${name} 이 requiredEnv 를 선언하지 않았다 — 옵트인이라 막을 것이 없다 (검사가 돌았고, 볼 것이 없었다).`
          : `좌표 ${name} 이 선언한 requiredEnv 가 전부 있다 (⛔ 값은 읽지 않았다 — 있는지만 봤다).`,
    };
  }
  const say = mod.cannotStandMessage;
  return {
    id,
    ok: false,
    detail:
      typeof say === 'function'
        ? (say as (n: string, m: string[]) => string)(name, missing)
        : `좌표 ${name} 이 요구한 환경변수 ${missing.length}개가 비어 있다: ${missing.join(' · ')} (값은 읽지 않았다).`,
  };
};

/* ── 셋을 한 번에 ────────────────────────────────────────────────── */

export interface IPreconditionInput {
  /** 세션을 잴 도메인. 선언된 은하에서 이게 없으면 `session-alive` 는 `null`(안 잰다)이다. */
  domain?: string | null;
  /** 로그인 URL. 없으면 「튕겼는지」를 가릴 기준이 없다 → `null`. ⛔ 좌표가 아니라 기계 안 초안에서 온다. */
  loginUrl?: string;
  galaxy?: string;
  /**
   * **이 주행 자신이** 살아 있는 세션을 요구하는가.
   * ⛔ 좌표의 `requiresSession` 과 **OR** 다. 둘 중 하나라도 선언하면 잰다 —
   *    화면을 걷는 주행은 좌표가 뭐라 하든 세션이 필요하고, 그건 주행이 스스로 말한다.
   */
  requiresSession?: boolean;
}

/**
 * ⛔ 순서를 지킨다: **싼 것부터, 그리고 화면을 건드리는 것은 맨 뒤로.**
 *    `session-alive` 는 (선언됐을 때) 실제로 **새로고침**을 하므로 부작용이 있다 —
 *    선언 안 한 은하·chromium 이 없는 경우가 먼저 걸러지면 헛도는 새로고침을 안 한다.
 */
export const measurePreconditions = async (
  input: IPreconditionInput = {},
): Promise<IPrecondition[]> => {
  const name = input.galaxy ?? galaxyName();
  /* 좌표는 **한 번만** 읽는다 — 전제 둘이 같은 좌표를 보는데 각자 읽으면 말이 갈린다. */
  const coord = readGalaxy(name);
  const binary = await browserBinary();
  const env = await requiredEnv(name, coord);
  const session = await sessionAlive({
    use: sessionUse(coord, input.requiresSession),
    domain: input.domain ?? null,
    loginUrl: input.loginUrl ?? '',
    binaryOk: binary.ok === true,
    galaxy: name,
  });
  /* 선언한 순서대로 싣는다 — 읽는 사람이 늘 같은 자리에서 찾게. */
  return [binary, session, env];
};
