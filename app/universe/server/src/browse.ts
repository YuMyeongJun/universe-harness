/**
 * 폴더 훑개 — **화면이 폴더를 「고를」 수 있게 하는 자리.**
 *
 * ## ⛔⛔ 왜 브라우저의 폴더 선택기를 안 쓰는가 (실측이 아니라 규격이다)
 *
 * 사람은 「로컬 경로 입력 말고 폴더를 고르게」를 원하고, 브라우저에는 그런 것이 둘 있다.
 * **둘 다 못 쓴다** — 편의 문제가 아니라 **절대 경로를 안 주기 때문**이다:
 *
 *  · `<input webkitdirectory>` — 파일 목록을 주지만 `webkitRelativePath` 는
 *    **고른 폴더 이름부터의 상대 경로**다. 앞이 잘려서 서버가 그 폴더를 못 찾는다.
 *  · `showDirectoryPicker()` — 핸들을 주지만 경로 문자열이 **아예 없다**(설계가 그렇다).
 *
 * 서버는 `bin/galaxy.mjs` 에 **실제 경로**를 넘겨야 한다. ⇒ 고르는 일을 **서버가 훑어** 준다.
 * 화면은 폴더를 타고 내려가고, 고른 자리의 **절대 경로는 서버가 알고 있다.**
 *
 * ## ⛔ 이 모듈이 하지 않는 것
 *
 *  1. **파일 내용을 안 읽는다.** 이름과 「폴더인가」만 낸다. `package.json`·`.git` 도
 *     **있는지만** 본다 — 열지 않는다.
 *  2. **파일을 안 낸다.** 고를 수 있는 것은 폴더뿐이라 파일을 실으면 못 고르는 줄만 는다.
 *  3. **숨김 폴더를 기본으로 안 낸다**(`.` 로 시작). ⚠️ `.git` 은 **표시로만** 쓴다.
 *  4. ⛔ **경로를 지어내지 않는다.** 못 읽으면 「못 읽었다」고 말하고 빈 목록을 주지 않는다 —
 *     빈 목록은 「폴더가 없다」로 읽히고 그건 §8 의 그 사고다.
 *
 * ## ⚠️ 어디까지 보여 주는가 — **홈 아래로 가둔다**
 *
 * 이 서버는 `127.0.0.1` 에만 붙지만, 그렇다고 **파일 시스템 전체를 훑어 주지는 않는다.**
 * 브라우저에서 열리는 화면이 기계의 아무 폴더나 나열할 수 있으면, 이 콘솔을 띄운 채
 * 다른 탭이 열린 상황에서 **알 이유가 없는 이름들이 새는 경로**가 된다.
 * ⇒ 뿌리는 **홈 디렉터리**이고 그 밖은 거절한다. ⛔ 「로컬이니까 괜찮다」로 넘기지 않았다.
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';

import { dataDir } from './paths.js';

export interface IBrowseEntry {
  name: string;
  path: string;
  /** 이 폴더가 그 자체로 「잴 저장소」로 보이는가 — 표시일 뿐, 고르는 것은 사람이다. */
  hasPackageJson: boolean;
  hasGit: boolean;
}

export interface IShortcut {
  label: string;
  path: string;
}

export interface IBrowseResult {
  dir: string;
  /** 홈보다 위로는 못 올라간다 — 뿌리에서는 `null` 이다. */
  parent: string | null;
  home: string;
  entries: IBrowseEntry[];
  /** 이 폴더 자신이 저장소로 보이는가 — 「여기를 고른다」 버튼을 화면이 이 값으로 켠다. */
  self: { hasPackageJson: boolean; hasGit: boolean };
  /**
   * ⭐ **지름길** — 숨김 폴더(`.` 로 시작)는 목록에 안 나오는데, 「받아 오기」가 받아 온 저장소는
   * 하필 `.data/clones/` 에 떨어진다. ⛔ 그래서 **두 화면이 이어지지 않았다**:
   * 받아 온 것을 「잴 저장소」에서 고를 길이 없었다.
   * ⇒ 숨김 규칙은 그대로 두고(그게 옳다), **실재할 때만** 지름길을 준다.
   */
  shortcuts: IShortcut[];
}

const HOME = homedir();

/** 홈 **안**인가. ⛔ 문자열 `startsWith` 로 보지 않는다 — `/Users/ab` 가 `/Users/a` 를 통과한다. */
const insideHome = (dir: string): boolean => {
  const rel = relative(HOME, dir);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export const browseProblem = (raw: unknown): string | null => {
  if (raw === undefined || raw === null || raw === '') return null; // 안 주면 홈이다
  if (typeof raw !== 'string') return '폴더 경로는 문자열이라야 합니다.';
  if (raw.includes('\0')) return '폴더 경로에 쓸 수 없는 문자가 있습니다.';
  const dir = resolve(raw);
  if (!insideHome(dir)) {
    /* ⛔ 「없다」고 하지 않는다 — 있는데 **안 보여 주는 것**이고, 그 둘은 다른 말이다. */
    return `홈 폴더(${HOME}) 밖은 훑지 않습니다: ${dir}`;
  }
  return null;
};

/**
 * 한 폴더를 훑는다.
 * ⚠️ `withFileTypes` 를 쓴다 — 항목마다 `stat` 을 또 부르면 폴더가 큰 자리에서 눈에 띄게 느리고,
 *    심볼릭 링크에서 대상까지 따라가 **볼 이유가 없는 자리로 새어 나간다.**
 */
export const browse = async (raw?: string): Promise<IBrowseResult> => {
  const dir = raw === undefined || raw === '' ? HOME : resolve(raw);
  const found = await readdir(dir, { withFileTypes: true });
  const entries: IBrowseEntry[] = found
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => {
      const full = join(dir, e.name);
      return {
        name: e.name,
        path: full,
        hasPackageJson: existsSync(join(full, 'package.json')),
        hasGit: existsSync(join(full, '.git')),
      };
    })
    /* 이름순. ⛔ 「저장소처럼 보이는 것 먼저」로 안 섞는다 — 순서가 판정처럼 읽힌다. */
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  /* ⛔ 없는 자리는 지름길로 안 낸다 — 눌러서 ⚪ 가 뜨는 버튼은 만들지 않는다. */
  const clones = join(dataDir(), 'clones');
  const shortcuts: IShortcut[] = [];
  if (existsSync(clones) && insideHome(clones)) {
    shortcuts.push({ label: '받아 온 저장소', path: clones });
  }
  if (dir !== HOME) shortcuts.push({ label: '홈', path: HOME });

  const up = dirname(dir);
  return {
    dir,
    shortcuts,
    parent: dir === HOME || !insideHome(up) ? null : up,
    home: HOME,
    entries,
    self: { hasPackageJson: existsSync(join(dir, 'package.json')), hasGit: existsSync(join(dir, '.git')) },
  };
};
