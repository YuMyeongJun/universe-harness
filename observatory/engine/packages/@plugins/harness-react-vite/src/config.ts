/**
 * 프로젝트 설정 로더 — `fe-harness.config.json`.
 *
 * 이 파일이 **표준의 경계**다. 하네스 코드에는 저장소 이름이 하나도 없고, 저장소마다 다른 것은
 * 전부 이 JSON 한 장에 모인다. 새 프로젝트에 얹는 일 = 이 JSON 을 쓰는 일이다.
 *
 * 찾는 순서(먼저 찾은 것이 이긴다):
 *   1. `--config <경로>`
 *   2. `<repoRoot>/fe-harness.config.json`
 *   3. `<repoRoot>/harness/fe-harness.config.json`
 *   4. 없으면 **중립 기본값**으로 돈다(단일 앱 React+Vite). 이때는 경고를 낸다 —
 *      조용히 기본값으로 도는 것이 가장 나쁜 실패다(엉뚱한 경로를 재고 초록불을 낸다).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { IHarnessCommands } from '@core/fe-agent-harness';
import { stripJsonc } from '@core/fe-agent-harness';

import { DEFAULT_REACT_VITE_PATHS } from './paths.ts';
import type { IReactVitePaths } from './paths.ts';
import type { ILintTarget } from './ReactViteHarness.ts';

/** JSON 파일에 그대로 적는 모양. 정규식은 **문자열**로 받아 여기서 컴파일한다. */
export interface IHarnessProjectFile {
  $schema?: string;
  project?: Partial<Omit<IReactVitePaths, 'sharedSourceEntry' | 'heavyVendor' | 'initialLoadBudgetBytes'>> & {
    sharedSourceEntry?: string;
    heavyVendor?: string;
    initialLoadBudgetKB?: number;
  };
  commands?: Partial<IHarnessCommands> & { testFile?: string };
  lintTargets?: ILintTarget[];
  contract?: {
    /** 켤 규칙 묶음. 기본 `["toss", "a11y", "tailwind"]`. 사내 컨벤션은 `"house-style"`. */
    presets?: string[];
    model?: string;
    staticOnly?: boolean;
  };
  wiki?: {
    knowledgeDir?: string;
    indexPath?: string;
    houseRulesPath?: string;
    description?: string;
    regenerateCommand?: string;
    model?: string;
  };
}

export interface IResolvedProjectConfig {
  configPath: string | null;
  paths: IReactVitePaths;
  commands: Partial<IHarnessCommands>;
  /** s04 가 한 폴더만 테스트할 때 쓰는 명령. `<PATH>` 가 치환된다. */
  testFileCommand: string;
  lintTargets: ILintTarget[];
  contract: { presets: string[]; model: string; staticOnly: boolean };
  wiki: IHarnessProjectFile['wiki'];
}

export const CONFIG_FILE_NAMES = [
  'fe-harness.config.json',
  'fe-harness.config.jsonc',
  'harness/fe-harness.config.json',
  'harness/fe-harness.config.jsonc',
];


const readJson = async (filePath: string): Promise<IHarnessProjectFile | null> => {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(stripJsonc(raw)) as IHarnessProjectFile;
  } catch (error) {
    throw new Error(`${filePath} 를 JSON 으로 못 읽었다: ${String(error)}`);
  }
};

export const loadProjectConfig = async (options: {
  repoRoot: string;
  configPath?: string;
  onWarn?: (message: string) => void;
}): Promise<IResolvedProjectConfig> => {
  const warn = options.onWarn ?? ((message: string) => console.warn(message));
  const candidates = options.configPath
    ? [path.resolve(options.repoRoot, options.configPath)]
    : CONFIG_FILE_NAMES.map((name) => path.join(options.repoRoot, name));

  let file: IHarnessProjectFile | null = null;
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
        '⚠️ fe-harness.config.json 을 찾지 못했다 — 중립 기본값(단일 앱 React+Vite)으로 돈다.',
        `   찾은 자리: ${candidates.join(' · ')}`,
        '   경로가 실제와 다르면 스테이지가 **엉뚱한 파일을 재고 초록불을 낸다.** 설정을 먼저 써라.',
      ].join('\n'),
    );
    file = {};
  }

  const project = file.project ?? {};
  const paths: IReactVitePaths = {
    ...DEFAULT_REACT_VITE_PATHS,
    ...project,
    sharedSourceEntry: project.sharedSourceEntry
      ? new RegExp(project.sharedSourceEntry)
      : DEFAULT_REACT_VITE_PATHS.sharedSourceEntry,
    heavyVendor: project.heavyVendor ? new RegExp(project.heavyVendor, 'i') : DEFAULT_REACT_VITE_PATHS.heavyVendor,
    initialLoadBudgetBytes: project.initialLoadBudgetKB
      ? project.initialLoadBudgetKB * 1024
      : DEFAULT_REACT_VITE_PATHS.initialLoadBudgetBytes,
  };

  const { testFile, ...commands } = file.commands ?? {};

  return {
    configPath,
    paths,
    commands,
    testFileCommand:
      testFile ??
      (paths.appWorkspace
        ? `yarn workspace ${paths.appWorkspace} exec vitest run <PATH> --reporter=basic`
        : 'npx vitest run <PATH> --reporter=basic'),
    lintTargets: file.lintTargets ?? [{ workspace: paths.appWorkspace, target: './src' }],
    contract: {
      presets: file.contract?.presets ?? ['toss', 'a11y', 'tailwind'],
      model: file.contract?.model ?? 'sonnet',
      staticOnly: file.contract?.staticOnly ?? false,
    },
    wiki: file.wiki,
  };
};

/** 코어의 것을 다시 내보낸다 — 이 이름으로 쓰는 곳이 있다. */
export { stripJsonc };
