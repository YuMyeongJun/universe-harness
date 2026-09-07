/**
 * 프로젝트 설정 로더 — `next-harness.config.json`.
 *
 * 이 파일이 **표준의 경계**다. 플러그인 코드에는 저장소 이름이 하나도 없고, 저장소마다 다른 것은
 * 전부 이 JSON 한 장에 모인다. 새 프로젝트에 얹는 일 = 이 JSON 을 쓰는 일이다.
 *
 * 찾는 순서(먼저 찾은 것이 이긴다):
 *   1. `--config <경로>`
 *   2. `<repoRoot>/next-harness.config.json`
 *   3. `<repoRoot>/harness/next-harness.config.json`
 *   4. 없으면 **중립 기본값**으로 돌되 경고를 낸다 — 조용히 기본값으로 도는 것이 가장 나쁜
 *      실패다(엉뚱한 경로를 재고 초록불을 낸다).
 *
 * ⚠️ `stripJsonc` 는 `@plugins/harness-react-vite` 에도 같은 것이 있다. 플러그인끼리 의존하지
 *    않는다는 규칙 때문에 지금은 **일부러 중복**시켰다 — 코어(`@core/fe-agent-harness`)로
 *    올리는 것이 맞다. 감시자에게 보고된 항목이다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { IHarnessCommands } from '@core/fe-agent-harness';
import { stripJsonc } from '@core/fe-agent-harness';

import { DEFAULT_NEXT_PATHS } from './paths.ts';
import type { INextPaths } from './paths.ts';

/** lint 게이트 대상. 게이트 통과 조건은 **여기 있는 것 전부 0 error** 다. */
export interface ILintTarget {
  /** 모노레포 워크스페이스 이름. 단일 앱이면 빈 문자열. */
  workspace: string;
  /** eslint 에 넘길 경로. Next 는 `app`·`src` 처럼 라우트 폴더가 대상이 되는 일이 잦다. */
  target: string;
}

/** JSON 파일에 그대로 적는 모양. */
export interface INextProjectFile {
  $schema?: string;
  project?: Partial<INextPaths>;
  commands?: Partial<IHarnessCommands>;
  lintTargets?: ILintTarget[];
  contract?: {
    /** 켤 규칙 묶음. 기본 `["toss", "a11y", "tailwind"]`. 사내 컨벤션은 `"house-style"`. */
    presets?: string[];
    model?: string;
    staticOnly?: boolean;
  };
}

export interface IResolvedNextConfig {
  configPath: string | null;
  paths: INextPaths;
  commands: Partial<IHarnessCommands>;
  lintTargets: ILintTarget[];
  contract: { presets: string[]; model: string; staticOnly: boolean };
}

export const CONFIG_FILE_NAMES = [
  'next-harness.config.json',
  'next-harness.config.jsonc',
  'harness/next-harness.config.json',
  'harness/next-harness.config.jsonc',
];


const readJson = async (filePath: string): Promise<INextProjectFile | null> => {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(stripJsonc(raw)) as INextProjectFile;
  } catch (error) {
    throw new Error(`${filePath} 를 JSON 으로 못 읽었다: ${String(error)}`);
  }
};

/** 패키지 매니저를 모르는 중립 기본 명령. 저장소가 yarn/pnpm 이면 설정에서 덮어쓴다. */
export const NEUTRAL_NEXT_COMMANDS = {
  install: 'npm ci',
  /* ⚠️ `next build` 를 직접 부르지 않는다 — 저장소의 스크립트를 부른다(소비 저장소를 고치지 않는 원칙). */
  build: 'npm run build',
  test: 'npm test',
  /* ⚠️ `next lint` 는 Next 15 에서 deprecate 되고 16 에서 빠졌다. 기본값은 ESLint CLI 직행이다. */
  lintJson: 'npx eslint <TARGET> --format json -o <OUT>',
};

export const loadNextConfig = async (options: {
  repoRoot: string;
  configPath?: string;
  onWarn?: (message: string) => void;
}): Promise<IResolvedNextConfig> => {
  const warn = options.onWarn ?? ((message: string) => console.warn(message));
  const candidates = options.configPath
    ? [path.resolve(options.repoRoot, options.configPath)]
    : CONFIG_FILE_NAMES.map((name) => path.join(options.repoRoot, name));

  let file: INextProjectFile | null = null;
  let configPath: string | null = null;
  for (const candidate of candidates) {
    file = await readJson(candidate);
    if (file) {
      configPath = candidate;
      break;
    }
  }

  if (!file) {
    warn(
      [
        '⚠️ next-harness.config.json 을 찾지 못했다 — 중립 기본값(단일 앱 Next App Router)으로 돈다.',
        `   찾은 자리: ${candidates.join(' · ')}`,
        '   특히 `project.buildOutputDir`(next.config 의 `distDir`)과 `project.appRouterDir`(`app` vs `src/app`)이',
        '   실제와 다르면 스테이지가 **빈 디렉터리를 재고 초록불을 낸다.** 설정을 먼저 써라.',
      ].join('\n'),
    );
    file = {};
  }

  const paths: INextPaths = { ...DEFAULT_NEXT_PATHS, ...(file.project ?? {}) };

  return {
    configPath,
    paths,
    commands: file.commands ?? {},
    lintTargets: file.lintTargets ?? [{ workspace: paths.appWorkspace, target: '.' }],
    contract: {
      presets: file.contract?.presets ?? ['toss', 'a11y', 'tailwind'],
      model: file.contract?.model ?? 'sonnet',
      staticOnly: file.contract?.staticOnly ?? false,
    },
  };
};

/** 코어의 것을 다시 내보낸다 — 이 이름으로 쓰는 곳이 있다. */
export { stripJsonc };
