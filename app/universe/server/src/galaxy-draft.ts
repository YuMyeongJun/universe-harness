/**
 * 「로컬 폴더를 받아 **은하 좌표 초안**을 만든다」 — 콘솔의 서버 쪽.
 *
 * ⛔⛔ **좌표를 여기서 만들지 않는다.** 저장소를 읽어 초안을 만드는 것은 이미
 *    `bin/galaxy.mjs` 의 몫이다. 서버가 그것을 다시 구현하면 **두 자리가 조용히 갈린다** —
 *    이 저장소가 R47·R91 에서 반복해서 데인 자리다(손 목록은 한 자리만 고쳐진다).
 *    ⇒ 이 파일은 **도구를 부르고, 도구가 한 말을 그대로 전달한다.** 판단은 사람이 한다.
 *
 * 이 파일이 지키는 것 — 전부 도구의 규율을 **화면까지 나르는** 일이다:
 *  1. **`TODO:` 가 남았으면 「완성」이라고 말하지 않는다.** 도구는 이미 개수를 세어 말한다.
 *     그 말이 서버에서 끊기면 화면은 초안을 완성본으로 보여 준다 — 그게 정확히 §8 이다.
 *  2. **태양계를 고르지 않는다.** 후보만 나른다. 폴더 이름은 사람이 정하는 것이라
 *     열거하면 낡는다(관측 법칙 §9).
 *  3. **못 읽은 것을 지어내지 않는다.** 도구가 실패하면 ⚪(못 쟀다)로 갈리고,
 *     도구가 한 말을 **그대로** 싣는다. 서버가 대신 짐작해서 채우지 않는다.
 *  4. **커밋되는 `galaxies/` 에 쓰지 않는다.** 항상 `--out` 으로 `.data/`(gitignore 되는
 *     자리)에 쓴다. 좌표를 커밋되는 자리에 올릴지는 **사람이 판단할 일**이다.
 *
 * ⚠️ 이번 조각은 **로컬 폴더까지**다. 원격 git 주소 · gh 로그인 · AI 키는 **안 만들었다**.
 */
import { execFile, type ExecFileException } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { HARNESS_ROOT, dataDir } from './paths.js';

/** 좌표 초안을 만드는 **유일한** 자리. 서버는 이것을 부르기만 한다. */
const toolPath = (): string => join(HARNESS_ROOT, 'bin/galaxy.mjs');

/**
 * 초안이 떨어지는 자리 — **`.data/` 안**이다.
 *
 * ⛔ 커밋되는 `galaxies/` 가 아니다. `git check-ignore -v app/universe/.data/...` 로 확인했다:
 *    `app/universe/.gitignore:4:.data/` 가 막는다. 초안은 사람이 보기 전의 물건이라
 *    저장소에 실려 나가면 안 된다.
 */
export const draftsDir = (): string => join(dataDir(), 'galaxy-drafts');

/** 초안 id — **서버가 만든다.** 사람이 준 이름이 경로가 되는 자리를 만들지 않는다(R76). */
const ID_SHAPE = /^[0-9a-f]{16}$/;
export const draftIdProblem = (id: string): string | null =>
  ID_SHAPE.test(id) ? null : '초안 id 가 올바르지 않습니다.';

/** 도구가 초안 안에 남긴 주석 칸. `//` 로 시작하는 키는 사람에게 하는 말이다. */
const NOTE_SOLAR = '//solarSystems';
const NOTE_WORKSPACES = '//워크스페이스 후보';
const NOTE_MISSING = '//없는 명령';

export interface IGalaxyCandidates {
  /**
   * 태양계 후보. ⛔ **고르지 않았다** — 사람이 고른다.
   * `null` 은 「도구의 문장에서 못 뽑았다」이고, `[]` 는 「도구가 없다고 말했다」다.
   * 둘을 같은 값으로 접으면 "안 본 것"이 "없는 것"으로 보인다.
   */
  solarSystems: string[] | null;
  /** 도구가 쓴 문장 원문. 위의 목록이 미덥지 않으면 이걸 그대로 읽는다. */
  solarSystemsRaw: string | null;
  /** 모노레포일 때만. 도구가 준 줄을 **그대로** 나른다 — 여기서도 고르지 않는다. */
  workspaces: string[] | null;
  /** 도구가 저장소에서 **읽어낸** 명령. 지어낸 것은 없다. */
  commands: Record<string, string>;
  /** 도구가 「이 저장소엔 없다」고 적은 것. 없는 명령을 지어내지 않은 흔적이다. */
  missingCommands: string | null;
}

export interface IGalaxyDraftTodos {
  /**
   * 도구가 **직접 센** 개수. 서버가 다시 세지 않는다 — 두 자리가 갈리면 안 되기 때문이다.
   * `null` = 도구의 말에서 개수를 못 읽었다(⚪). 이때는 「완성」이라고 절대 말하지 않는다.
   */
  count: number | null;
  /** 어디에 남았는지. 개수의 출처는 위(도구)이고, 이건 **자리를 짚어 주는 것**뿐이다. */
  at: string[];
  /** 도구가 센 개수와 짚은 자리 수가 다르면 여기에 적는다 — 조용히 맞추지 않는다. */
  note: string | null;
}

export interface IGalaxyDraftResult {
  id: string | null;
  /** 도구가 초안을 만들었는가. `false` 면 아래 `unmeasured` 가 이유다. */
  drafted: boolean;
  /** ⚪ 못 쟀다 — 도구가 한 말 **그대로**. 잰 빨강(❌)이 아니다. */
  unmeasured: string | null;
  draft: Record<string, unknown> | null;
  todos: IGalaxyDraftTodos;
  /**
   * ⛔ **`TODO:` 를 실제로 0개로 세었을 때만 `true`.** 못 셌으면 `false` 다.
   *    초안이 완성본 행세를 하는 자리를 여기서 막는다.
   */
  complete: boolean;
  /** 화면에 그대로 띄울 한 줄. 「초안」이라는 말이 사라지지 않게 서버가 문장으로 박는다. */
  summary: string;
  candidates: IGalaxyCandidates | null;
  /** 재현용 — 무엇을 어떻게 불렀는지. 사람이 손으로 다시 칠 수 있어야 한다. */
  tool: {
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    /** 초안 파일의 실제 자리(`.data/` 안). */
    out: string | null;
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `TODO:` 가 남은 **자리**를 짚는다.
 * ⚠️ 개수의 출처는 여전히 **도구**다 — 여기서 센 것은 대조용이고, 어긋나면 그렇게 적는다.
 */
const todoPaths = (value: unknown, at = '', found: string[] = []): string[] => {
  if (typeof value === 'string') {
    if (value.startsWith('TODO:')) found.push(at || '.');
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => todoPaths(v, `${at}[${i}]`, found));
    return found;
  }
  if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) todoPaths(v, at === '' ? k : `${at}.${k}`, found);
  }
  return found;
};

/** 도구가 말한 개수를 그대로 읽는다: `⛔ 사람이 채울 자리 4곳 (`TODO:`)`. */
const todoCountFromTool = (stdout: string): number | null => {
  const hit = /사람이 채울 자리\s+(\d+)\s*곳/.exec(stdout);
  if (!hit?.[1]) return null;
  const n = Number(hit[1]);
  return Number.isFinite(n) ? n : null;
};

/**
 * 태양계 후보를 도구의 문장에서 뽑는다.
 * ⛔ 저장소를 다시 훑지 않는다 — 그러면 도구와 서버가 서로 다른 후보를 말하게 된다.
 */
const solarCandidates = (note: string | null): string[] | null => {
  if (note === null) return null;
  const marker = '후보: ';
  const i = note.indexOf(marker);
  if (i < 0) return null;
  const rest = note.slice(i + marker.length).trim();
  if (rest === '' || rest === '(없음)') return []; // 도구가 「없다」고 말한 것이다
  return rest.split('·').map((s) => s.trim()).filter((s) => s !== '');
};

const candidatesOf = (draft: Record<string, unknown>): IGalaxyCandidates => {
  const solarNote = typeof draft[NOTE_SOLAR] === 'string' ? (draft[NOTE_SOLAR] as string) : null;
  const rawWorkspaces = draft[NOTE_WORKSPACES];
  const rawCommands = draft['commands'];
  const commands: Record<string, string> = {};
  let missing: string | null = null;
  if (isRecord(rawCommands)) {
    for (const [k, v] of Object.entries(rawCommands)) {
      if (typeof v !== 'string') continue;
      if (k === NOTE_MISSING) {
        missing = v;
        continue;
      }
      if (k.startsWith('//')) continue;
      commands[k] = v;
    }
  }
  return {
    solarSystems: solarCandidates(solarNote),
    solarSystemsRaw: solarNote,
    workspaces: Array.isArray(rawWorkspaces)
      ? rawWorkspaces.filter((w): w is string => typeof w === 'string')
      : null,
    commands,
    missingCommands: missing,
  };
};

const runTool = (
  args: string[],
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> =>
  new Promise((done) => {
    execFile(
      process.execPath,
      [toolPath(), ...args],
      /* cwd 는 우주 저장소로 고정한다 — 도구가 찍는 상대 경로가 부르는 자리마다 달라지면
         재현이 안 된다. 시간 제한을 둬서 도구가 매달려도 화면이 영영 기다리지 않게 한다. */
      { cwd: HARNESS_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      (err: ExecFileException | null, stdout: string, stderr: string) => {
        const code = typeof err?.code === 'number' ? err.code : err ? null : 0;
        const killed = err?.killed === true;
        done({
          exitCode: code,
          stdout,
          stderr: killed ? `${stderr}\n⛔ 도구가 시간 안에 끝나지 않아 끊었다(120초).` : stderr,
        });
      },
    );
  });

/** 못 쟀을 때의 답 — 지어낸 초안 대신 **이유**를 준다. */
const unmeasuredResult = (
  why: string,
  tool: IGalaxyDraftResult['tool'],
): IGalaxyDraftResult => ({
  id: null,
  drafted: false,
  unmeasured: why,
  draft: null,
  todos: { count: null, at: [], note: null },
  complete: false,
  summary: '⚪ 좌표 초안을 못 만들었다 — 서버가 대신 지어내지 않았다.',
  candidates: null,
  tool,
});

/** 입력이 잘못된 것인가(400) — 재기 전에 갈린다. 「못 쟀다」와 섞지 않는다. */
export const inputProblem = (name: unknown, dir: unknown): string | null => {
  if (typeof name !== 'string' || name.trim() === '') return '은하 이름을 적으세요.';
  if (typeof dir !== 'string' || dir.trim() === '') return '저장소 폴더 경로를 적으세요.';
  const abs = dir.trim();
  if (!existsSync(abs)) return `그런 폴더가 없습니다: ${abs}`;
  if (!statSync(abs).isDirectory()) return `폴더가 아닙니다: ${abs}`;
  return null;
};

/**
 * 좌표 초안을 만든다 — **도구를 불러서**.
 *
 * ⛔ 실패하면 ⚪ 로 갈린다(예외를 던지지 않는다). 「폴더에 `package.json` 이 없다」는
 *    제품이 깨진 것(❌)이 아니라 **잴 수 없는 것**이다. 도구가 그렇게 말하고, 그대로 나른다.
 */
export const makeGalaxyDraft = async (name: string, dir: string): Promise<IGalaxyDraftResult> => {
  const id = randomBytes(8).toString('hex');
  const out = join(draftsDir(), `${id}.json`);
  const command = `node bin/galaxy.mjs ${name} --dir ${dir} --out ${out}`;
  const blank = { command, exitCode: null, stdout: '', stderr: '', out: null };

  if (!existsSync(toolPath())) {
    /* ⛔ 도구가 없으면 **여기서 좌표를 만들지 않는다.** 그것이 두 자리가 갈리는 시작이다. */
    return unmeasuredResult(
      `좌표 도구를 못 찾았다: ${toolPath()}\n서버는 좌표를 직접 만들지 않는다 — 도구가 있어야 잰다.`,
      blank,
    );
  }
  mkdirSync(draftsDir(), { recursive: true });

  const ran = await runTool([name, '--dir', dir, '--out', out]);
  const tool = { command, exitCode: ran.exitCode, stdout: ran.stdout, stderr: ran.stderr, out };
  if (ran.exitCode !== 0) {
    /* 도구가 거절한 이유를 **도구의 말 그대로** 싣는다. 서버가 고쳐 쓰면 원문이 사라진다. */
    return unmeasuredResult(
      ran.stderr.trim() || `좌표 도구가 ${ran.exitCode} 로 끝났다 — 이유를 말하지 않았다.`,
      { ...tool, out: null },
    );
  }

  const raw = readFileSync(out, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    return unmeasuredResult(`초안 파일을 읽었지만 객체가 아니다: ${out}`, tool);
  }
  return describe(id, parsed, tool);
};

/** 초안 하나를 **판정 어휘째로** 서술한다. 만든 직후에도, 나중에 다시 읽을 때도 같은 자리다. */
const describe = (
  id: string,
  draft: Record<string, unknown>,
  tool: IGalaxyDraftResult['tool'],
): IGalaxyDraftResult => {
  const at = todoPaths(draft);
  const counted = todoCountFromTool(tool.stdout);
  /* 도구를 못 부른 채(다시 읽기) 서술할 때는 도구의 개수가 없다 — 그때는 자리 수를 쓴다. */
  const count = counted ?? (tool.stdout === '' ? at.length : null);
  const note =
    counted !== null && counted !== at.length
      ? `도구는 ${counted}곳이라 했고 서버는 ${at.length}곳을 짚었다 — 개수는 도구의 것을 쓴다.`
      : null;
  const complete = count === 0;
  return {
    id,
    drafted: true,
    unmeasured: null,
    draft,
    todos: { count, at, note },
    complete,
    /**
     * ⛔ **여기서 「완성」이라는 말을 못 쓰게 한다.** 도구가 「사람이 채울 자리 N곳」이라고
     *    말했는데 서버가 그 말을 삼키면, 화면은 초안을 완성본으로 보여 준다.
     */
    summary:
      count === null
        ? '⚪ 초안은 나왔지만 남은 `TODO:` 개수를 못 셌다 — 「완성」이라고 말할 수 없다.'
        : count > 0
          ? `⛔ 초안이다 — 사람이 채울 자리 ${count}곳(\`TODO:\`)이 남았다. **완성이 아니다.**`
          : '`TODO:` 는 남지 않았다. 그래도 좌표를 커밋되는 자리에 올릴지는 **사람이 정한다.**',
    candidates: candidatesOf(draft),
    tool,
  };
};

/**
 * 만들어 둔 초안을 다시 읽는다 — 후보·읽어낸 명령·못 읽은 자리를 **그대로** 보여 주는 자리.
 * ⚠️ 도구를 다시 부르지 않으므로 도구의 stdout 이 없다. 그때 `TODO:` 개수는 **자리 수**로
 *    센다는 것을 `todos.note` 가 아니라 이 주석과 위 `describe` 가 함께 지킨다.
 */
export const readGalaxyDraft = (id: string): IGalaxyDraftResult | null => {
  const file = join(draftsDir(), `${id}.json`);
  if (!existsSync(file)) return null;
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(parsed)) return null;
  return describe(id, parsed, {
    command: `(다시 읽음) ${file}`,
    exitCode: null,
    stdout: '',
    stderr: '',
    out: file,
  });
};
