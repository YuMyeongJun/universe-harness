/**
 * 「우주가 아는 **은하**를 그대로 나른다」 — 콘솔의 첫 화면이 보는 자리.
 *
 * ⛔⛔ **좌표를 찾는 규칙을 여기서 다시 짜지 않는다.** `galaxies.local/` → `galaxies/`
 *    순서와 상대경로 절대화는 이미 `lib/galaxy-load.mjs` 의 몫이다. 서버가 그것을 다시
 *    구현하면 **두 자리가 조용히 갈린다** — 이 저장소가 R47·R91·R143 에서 반복해서 데인
 *    자리다(좌표를 직접 읽는 자리가 다섯이었고 상대 경로가 한 번 더 붙었다).
 *    ⇒ 이 파일은 **그 모듈을 불러서 쓰고**, 목록의 정본은 `universe.config.json` 에서 읽는다.
 *
 * 이 파일이 지키는 것 — 전부 「안 본 것이 초록으로 세어지는」 자리를 막는 일이다:
 *
 *  1. **한쪽에만 있는 것을 조용히 빼지 않는다.**
 *     ⚠️ 실측(R121): 좌표를 만들어 놓고 `universe.config.json` 에 안 올렸더니 관측이
 *     **「아무것도 안 재고 초록불」**을 냈다. 그 침묵이 결함이다.
 *     ⇒ 등재됐는데 좌표가 없는 것(`no-coordinate`)도, 좌표는 있는데 등재가 안 된 것
 *       (`not-registered`)도 **둘 다 목록에 실어** ⛔ 로 말한다.
 *  2. **경로가 이 기계에 없으면 「없다」고 말한다** — ⚪ 다. 목록에서 지우지 않는다.
 *     지우면 「원래 없었다」와 구별이 안 된다.
 *  3. **기준선(`observed`)이 없으면 「아직 안 쟀다」다**(⚪). ✅ 로도 「위반 0」으로도 만들지
 *     않는다. 여기서는 건수를 세지 않는다 — 재는 것은 `observe`(observation.ts)의 몫이다.
 *  4. **`universe.config.json` 을 못 읽으면 빈 목록을 주지 않는다.** 빈 목록은 화면에서
 *     「은하가 없다」로 읽힌다 — 그건 「못 읽었다」와 다르다. ⇒ `registered: null` + 사유.
 *
 * ⛔⛔ **응답을 파일로 떨구거나 로그에 남기지 않는다.** `galaxies.local/` 의 좌표는 **절대 경로**
 *    이고 그건 남의 홈 경로다. 이 저장소는 공개 MIT 라 커밋되는 자리엔 상대 경로만 둔다
 *    (그래서 `galaxies.local/` 이 gitignore 다 — R152). 화면은 로컬이라 보여도 되지만,
 *    그 값이 파일·로그로 새면 커밋 대상이나 붙여넣기로 흘러 나간다.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HARNESS_ROOT } from './paths.js';

/* ── 좌표를 찾는 **유일한** 자리를 빌려 온다 ──────────────────────────
   ⚠️ `lib/` 는 저장소 뿌리의 `.mjs` 라 `tsconfig.server.json` 의 rootDir(`server/src`) 밖이다.
      그래서 정적 import 로는 못 들어온다 ⇒ 런타임 동적 import 로 **그 파일 자체**를 쓴다.
      ⛔ 「그래서 여기에 베껴 둔다」는 갈래를 만들지 않는다. 그것이 두 자리가 갈리는 시작이다. */

interface IGalaxyLoadModule {
  /** 좌표가 사는 곳 — **로컬 명부가 먼저다.** 순서까지 그 모듈의 것이다. */
  GALAXY_DIRS: string[];
  findGalaxyFile: (root: string, name: string) => Promise<string | null>;
  loadGalaxy: (
    root: string,
    name: string,
    registered?: string[],
  ) => Promise<{ galaxy?: unknown; problem?: string }>;
}

const loaderPath = (): string => join(HARNESS_ROOT, 'lib/galaxy-load.mjs');

let loaderCache: IGalaxyLoadModule | null = null;
const galaxyLoader = async (): Promise<IGalaxyLoadModule> => {
  if (loaderCache !== null) return loaderCache;
  const mod = (await import(pathToFileURL(loaderPath()).href)) as unknown as IGalaxyLoadModule;
  loaderCache = mod;
  return mod;
};

/* ── 화면과 맞춘 모양 ───────────────────────────────────────── */

/**
 * 이 은하가 지금 어떤 상태인가. ⛔ **「괜찮다」가 기본값이 아니다.**
 *  · `listed`           — 등재됐고 좌표도 있다. (그 이상은 아래 칸들이 말한다)
 *  · `no-coordinate`    — ⛔ 등재됐는데 좌표 파일이 없다.
 *  · `unreadable`       — ⛔ 좌표 파일은 있는데 못 읽었다(문법 등). 「없는 은하」가 **아니다**.
 *  · `not-registered`   — ⛔ 좌표는 있는데 `universe.config.json` 에 없다 ⇒ 관측이 안 잰다.
 *  · `bad-name`         — ⛔ 이름의 모양이 좌표 파일 이름이 될 수 없다.
 */
export type GalaxyState =
  | 'listed'
  | 'no-coordinate'
  | 'unreadable'
  | 'not-registered'
  | 'bad-name';

/** 기준선 — **있으면** 언제 무엇을 쟀는지. ⛔ 없으면 이 객체 자체가 `null` 이다(⚪). */
export interface IGalaxyBaseline {
  measuredAt: string | null;
  commit: string | null;
  /** 그때 훑은 **파일 수**. ⚠️ `0` 이면 「아무것도 안 봤다」다 — 분모가 여기 있다(R162). */
  files: number | null;
  dirtyFiles: number | null;
  fingerprint: string | null;
  /** 법칙별 기준선 건수. ⛔ 이건 **그때 잰 값**이지 지금 값이 아니다. */
  laws: Record<string, number>;
}

export interface IGalaxyEntry {
  name: string;
  state: GalaxyState;
  /** `universe.config.json` 의 `galaxies` 에 있는가. **목록의 정본은 그 배열이다.** */
  registered: boolean;
  coordinate: {
    found: boolean;
    /** 우주 뿌리 기준 **상대** 경로. 좌표 파일이 어느 명부에 있는지 사람이 봐야 한다. */
    file: string | null;
    /** `galaxies.local` 인가 `galaxies` 인가. 순서는 `lib/galaxy-load.mjs` 가 정한다. */
    dir: string | null;
    /** gitignore 되는 자리인가(= 절대 경로를 담아도 되는 자리인가). */
    local: boolean;
    /** 못 읽었으면 그 모듈이 쓴 **문장 그대로**. 서버가 고쳐 적지 않는다. */
    problem: string | null;
  };
  description: string | null;
  /**
   * 은하가 사는 자리(절대화된 것). ⛔ **`null` 은 「좌표를 못 읽어서 모른다」**이지
   * 「경로가 없다」가 아니다 — 그건 아래 `pathExists` 가 말한다.
   * ⚠️ 로컬 명부의 값은 **남의 홈 경로**다. 화면에만 쓴다(머리말 참조).
   */
  path: string | null;
  /** 이 기계에 실재하는가. ⛔ `null` = **못 봤다**(좌표가 없어 볼 것이 없었다). */
  pathExists: boolean | null;
  appWorkspace: string | null;
  /** 훑개가 보는 자리. ⚠️ 이게 틀리면 파일 0개를 훑고 「0건」이 기준선이 된다(R162). */
  appDir: string | null;
  laws: string[] | null;
  /** 좌표에 **선언된** 명령. `//` 로 시작하는 주석 칸은 뺀다. 지어낸 것은 없다. */
  commands: Record<string, string>;
  /** 좌표가 「이 저장소엔 없다」고 적어 둔 것. 없는 명령을 지어내지 않은 흔적이다. */
  missingCommands: string | null;
  /** ⛔ `null` = **기준선이 없다 ⇒ 아직 안 쟀다**(⚪). `0` 건과 섞지 않는다. */
  baseline: IGalaxyBaseline | null;
  /** ⛔ 말해야 하는 것 — 조용히 빼는 대신 여기 적는다. 없으면 `null`. */
  problem: string | null;
  /** 화면에 그대로 띄울 줄들. 판정 어휘(⛔·⚪·ⓘ)를 서버가 문장으로 박는다. */
  notes: string[];
}

export interface IGalaxyList {
  /** 목록의 정본이 사는 파일 — 우주 뿌리 기준 상대 경로. */
  configFile: string;
  /**
   * `universe.config.json` 의 `galaxies` 배열 **그대로**.
   * ⛔ `null` 은 **못 읽었다**(⚪)이지 「은하가 없다」가 아니다.
   */
  registered: string[] | null;
  /** 등재 순서대로, **그 뒤에** 등재 안 된 좌표를 붙인다. 어느 쪽도 빼지 않는다. */
  galaxies: IGalaxyEntry[];
  /** ⛔ 화면 맨 위에 그대로 띄울 것 — 양쪽이 어긋난 자리. 없으면 빈 배열. */
  problems: string[];
  /** ⚪ 못 쟀다 — 목록 자체를 만들 수 없었던 이유. `null` 이면 **잰 것**이다. */
  unmeasured: string | null;
}

/* ── 읽기 ──────────────────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * 은하 이름의 **모양**. 이름이 곧 좌표 **파일 이름**이 되므로 여기서 막는다(R76).
 * ⛔ 막았다고 목록에서 빼지 않는다 — `bad-name` 으로 **실어서** 말한다.
 */
const NAME_SHAPE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 좌표 안의 주석 칸 — `//` 로 시작하는 키는 사람에게 하는 말이다(`bin/galaxy.mjs` 규약). */
const NOTE_MISSING = '//없는 명령';

const commandsOf = (
  galaxy: Record<string, unknown>,
): { commands: Record<string, string>; missing: string | null } => {
  const raw = galaxy['commands'];
  const commands: Record<string, string> = {};
  let missing: string | null = null;
  if (!isRecord(raw)) return { commands, missing };
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') continue;
    if (k === NOTE_MISSING) {
      missing = v;
      continue;
    }
    if (k.startsWith('//')) continue;
    commands[k] = v;
  }
  return { commands, missing };
};

/**
 * 기준선을 옮긴다. ⛔ **없으면 `null`** — 빈 객체로 접으면 화면이 「쟀는데 0건」을 그린다.
 * ⛔ 여기서 건수를 **세지 않는다.** 좌표에 적힌 값을 그대로 나르기만 한다.
 */
const baselineOf = (galaxy: Record<string, unknown>): IGalaxyBaseline | null => {
  const observed = galaxy['observed'];
  if (!isRecord(observed)) return null;
  const rawLaws = observed['laws'];
  const laws: Record<string, number> = {};
  if (isRecord(rawLaws)) {
    for (const [k, v] of Object.entries(rawLaws)) {
      const n = asNumber(v);
      if (n !== null) laws[k] = n;
    }
  }
  return {
    measuredAt: asString(observed['measuredAt']),
    commit: asString(observed['commit']),
    files: asNumber(observed['files']),
    dirtyFiles: asNumber(observed['dirtyFiles']),
    fingerprint: asString(observed['fingerprint']),
    laws,
  };
};

const stringList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;

/**
 * 좌표 파일이 **어느 명부**에 있나. ⛔ 순서를 다시 짜는 것이 아니다 —
 * 그 모듈이 이미 고른 파일의 경로에서 **되읽기만** 한다.
 */
const dirOf = (file: string): string | null => {
  const rel = relative(HARNESS_ROOT, file);
  /* ⛔ 아는 이름 둘 중 하나로 **접지 않는다.** 그 모듈이 명부를 늘리면 여기서 조용히 `null`
     이 되고, 화면은 「어디에 있는지 모르는 좌표」를 「없는 좌표」처럼 그린다. */
  return rel.split(/[\\/]/)[0] ?? null;
};

const appDirOf = (galaxy: Record<string, unknown>): string | null => asString(galaxy['appDir']);

/** 좌표 하나를 **판정 어휘째로** 서술한다. */
const describe = async (
  name: string,
  registered: boolean,
  loader: IGalaxyLoadModule,
  registeredNames: string[],
): Promise<IGalaxyEntry> => {
  const blank = {
    name,
    registered,
    description: null,
    path: null,
    pathExists: null,
    appWorkspace: null,
    appDir: null,
    laws: null,
    commands: {},
    missingCommands: null,
    baseline: null,
  };

  if (!NAME_SHAPE.test(name)) {
    /* ⛔ 목록에서 빼지 않는다. 이름이 이상하다는 것 자체가 사람이 봐야 하는 사실이다. */
    const problem = `⛔ 은하 이름의 모양이 좌표 파일 이름이 될 수 없다: ${JSON.stringify(name)}`;
    return {
      ...blank,
      state: 'bad-name',
      coordinate: { found: false, file: null, dir: null, local: false, problem: null },
      problem,
      notes: [problem],
    };
  }

  const file = await loader.findGalaxyFile(HARNESS_ROOT, name);
  if (file === null) {
    /**
     * ⛔ **여기가 R121 이다.** 등재는 됐는데 좌표가 없다 — 조용히 빼면 화면은
     *    「은하 4개, 전부 정상」을 그리고, 아무도 그 하나를 다시 안 본다.
     */
    const problem = registered
      ? `⛔ 등재됐는데 좌표 파일이 없다 — ${loader.GALAXY_DIRS.map((d) => `${d}/${name}.json`).join(' 도 ')} 도 없다.\n` +
        '   목록에서 조용히 빼지 않았다. 좌표를 만들거나 `universe.config.json` 에서 내려라.'
      : `⛔ 좌표 파일을 못 찾았다: ${name}`;
    return {
      ...blank,
      state: 'no-coordinate',
      coordinate: { found: false, file: null, dir: null, local: false, problem: null },
      problem,
      notes: [problem],
    };
  }

  const rel = relative(HARNESS_ROOT, file);
  const dir = dirOf(file);
  /* ⚠️ 「로컬 명부인가」는 gitignore 되는 자리인가와 같은 뜻이다 — 절대 경로가 여기에만 산다. */
  const local = dir === 'galaxies.local';

  const loaded = await loader.loadGalaxy(HARNESS_ROOT, name, registeredNames);
  const galaxy = loaded.galaxy;
  if (!isRecord(galaxy)) {
    /**
     * ⛔ **「없는 은하」라고 말하면 안 된다.** 파일은 있다 — 읽을 수 없을 뿐이다(R90).
     *    그 모듈이 이미 그렇게 갈라 말하므로 **문장을 그대로** 싣는다.
     */
    const problem =
      loaded.problem ?? `⛔ 좌표를 못 읽었다 (없는 은하가 아니다): ${rel}`;
    return {
      ...blank,
      state: 'unreadable',
      coordinate: { found: true, file: rel, dir, local, problem: loaded.problem ?? null },
      problem,
      notes: [problem],
    };
  }

  const path = asString(galaxy['path']);
  /* ⛔ 좌표를 못 읽은 것과 경로가 없는 것은 다르다 — 앞은 `null`, 뒤는 `false` 다. */
  const pathExists = path === null ? null : existsSync(path);
  const { commands, missing } = commandsOf(galaxy);
  const baseline = baselineOf(galaxy);

  const notes: string[] = [];
  let problem: string | null = null;

  if (!registered) {
    /**
     * ⛔ **R121 의 반대편.** 좌표는 있는데 등재가 안 됐다 ⇒ `observe` 는 이 은하를
     *    **아예 안 재고**, 그 침묵이 초록으로 보인다. 화면이 그것을 알아야 한다.
     */
    problem =
      `⛔ 좌표는 있는데 \`universe.config.json\` 의 \`galaxies\` 에 없다 — 관측이 이 은하를 안 잰다.\n` +
      `   좌표: ${rel}`;
    notes.push(problem);
  }

  if (path === null) {
    notes.push('⚪ 좌표에 `path` 가 없다 — 어디를 재야 하는지 모른다.');
  } else if (pathExists === false) {
    /* ⛔ 「없다」고 **말한다.** 목록에서 지우면 「원래 없었다」와 구별이 안 된다. */
    notes.push(`⚪ 경로가 이 기계에 없다 — 못 잰다: ${path}`);
  }

  if (baseline === null) {
    /* ⛔ 「위반 0」이 아니다. 기준선이 없으면 **아직 안 쟀다**이고 그건 ⚪ 다. */
    notes.push('⚪ 기준선이 없다(`observed` 가 없다) — **아직 안 쟀다.** 「위반 0」이 아니다.');
  } else {
    if (baseline.files === 0) {
      /* ⛔⛔ R162 그 자리다 — 파일 0개를 훑고 「0건」이 기준선으로 심겼다. */
      notes.push(
        '⛔ 기준선이 **파일 0개**를 훑고 심겼다 — 그 은하의 「0건」은 「위반이 없다」가 아니라 ' +
          `「안 봤다」다(appDir: ${JSON.stringify(appDirOf(galaxy))}).`,
      );
      problem ??= '⛔ 기준선이 파일 0개를 훑고 심겼다 — 영원히 초록인 은하다.';
    } else if (baseline.files === null) {
      notes.push('⚪ 기준선에 훑은 파일 수가 없다 — 분모가 없으면 건수는 뜻이 없다.');
    } else {
      notes.push(
        `ⓘ 기준선이 있다 — 파일 ${baseline.files}개를 ${baseline.measuredAt ?? '(시각 없음)'} 에 쟀다. ` +
          '⛔ 지금 값이 아니다 — 지금을 알려면 다시 재라(`observe`).',
      );
    }
  }

  if (Object.keys(commands).length === 0) {
    notes.push('⚪ 선언된 명령이 없다 — 이 은하에서는 명령 축을 못 잰다.');
  }

  return {
    name,
    state: registered ? 'listed' : 'not-registered',
    registered,
    coordinate: { found: true, file: rel, dir, local, problem: null },
    description: asString(galaxy['description']),
    path,
    pathExists,
    appWorkspace: asString(galaxy['appWorkspace']),
    appDir: asString(galaxy['appDir']),
    laws: stringList(galaxy['laws']),
    commands,
    missingCommands: missing,
    baseline,
    problem,
    notes,
  };
};

/** 명부 폴더에 **실제로 있는** 좌표 파일 이름들. 없는 폴더는 없는 것으로 친다(빈 목록). */
const filesInDir = (dir: string): string[] => {
  const abs = join(HARNESS_ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));
};

/* ── 목록 ──────────────────────────────────────────────────── */

const CONFIG = 'universe.config.json';

/** 못 쟀을 때의 답 — 지어낸 빈 목록 대신 **이유**를 준다. */
const unmeasuredList = (why: string): IGalaxyList => ({
  configFile: CONFIG,
  /* ⛔ `[]` 가 아니라 `null` 이다. 빈 배열은 화면에서 「은하가 없다」로 읽힌다. */
  registered: null,
  galaxies: [],
  problems: [],
  unmeasured: why,
});

/**
 * 우주가 아는 은하 전부. **등재된 것 + 좌표만 있는 것**, 어느 쪽도 빼지 않는다.
 *
 * ⛔ 실패해도 예외를 던지지 않는다 — 「config 를 못 읽었다」는 **결과**이고 ⚪ 다.
 */
export const listGalaxies = async (): Promise<IGalaxyList> => {
  let loader: IGalaxyLoadModule;
  try {
    loader = await galaxyLoader();
  } catch (e) {
    return unmeasuredList(
      `좌표를 찾는 모듈을 못 불렀다: ${loaderPath()}\n` +
        '서버는 좌표 찾는 규칙을 직접 짜지 않는다 — 그 모듈이 있어야 잰다.\n' +
        `${(e as Error).message}`,
    );
  }

  let registeredNames: string[];
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(HARNESS_ROOT, CONFIG), 'utf8'));
    if (!isRecord(parsed)) return unmeasuredList(`${CONFIG} 이 객체가 아니다 — 목록을 못 읽었다.`);
    const list = stringList(parsed['galaxies']);
    if (list === null) {
      /* ⛔ 칸이 없는 것과 「은하가 0개」는 다르다. 없으면 못 읽은 것이다. */
      return unmeasuredList(
        `${CONFIG} 에 \`galaxies\` 배열이 없다 — 목록의 정본이 없다(은하가 0개인 것과 다르다).`,
      );
    }
    registeredNames = list;
  } catch (e) {
    return unmeasuredList(
      `${CONFIG} 을 못 읽었다 — 빈 목록을 주지 않는다(「은하가 없다」로 읽히기 때문이다).\n` +
        `${(e as Error).message}`,
    );
  }

  const entries: IGalaxyEntry[] = [];
  const seen = new Set<string>();
  for (const name of registeredNames) {
    if (seen.has(name)) continue; // 같은 이름이 두 번 등재된 것 — 아래 problems 가 말한다
    seen.add(name);
    entries.push(await describe(name, true, loader, registeredNames));
  }

  /**
   * ⛔ **좌표만 있는 것을 여기서 붙인다.** 이것을 안 하면 「목록에 없는 좌표」는 화면에서
   *    영영 안 보이고, 그게 R121 의 침묵이다. 명부 폴더 이름도 그 모듈의 것을 쓴다.
   */
  for (const dir of loader.GALAXY_DIRS) {
    for (const name of filesInDir(dir)) {
      if (seen.has(name)) continue;
      seen.add(name);
      entries.push(await describe(name, false, loader, registeredNames));
    }
  }

  const problems: string[] = [];
  const dupes = registeredNames.filter((n, i) => registeredNames.indexOf(n) !== i);
  for (const d of [...new Set(dupes)]) {
    problems.push(`⛔ ${CONFIG} 의 \`galaxies\` 에 같은 이름이 두 번 있다: ${d}`);
  }
  for (const e of entries) if (e.problem !== null) problems.push(`[${e.name}] ${e.problem}`);

  return {
    configFile: CONFIG,
    registered: registeredNames,
    galaxies: entries,
    problems,
    /* 목록 자체는 쟀다 — 은하 하나하나의 ⚪ 는 각 항목의 `notes` 가 들고 있다. */
    unmeasured: null,
  };
};
