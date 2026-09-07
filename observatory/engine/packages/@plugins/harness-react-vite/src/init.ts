/**
 * `fe-harness init` — 기존 프로젝트를 **재서** 설정 파일 초안을 만든다.
 *
 * 왜 스캐폴드인가: 얹는 비용의 대부분이 "우리 저장소의 경로가 뭐였더라" 다. 그걸 사람이
 * 손으로 적으면 틀린 값이 조용히 들어가고, 스테이지는 **엉뚱한 파일을 재고 초록불을 낸다.**
 *
 * ⛔ 기계가 못 재는 것은 **비워 두고 크게 알린다.** 그럴듯한 기본값을 채워 넣는 것이
 *    가장 나쁘다 — 사람이 확인했다고 착각한다. 지금 비우는 것은 셋이다:
 *      · deepLinks            (앱 라우트를 알아야 한다)
 *      · initialLoadBudgetKB  (현재 초기 로드를 재서 정해야 한다)
 *      · heavyVendor          (무엇이 무거운지는 이 앱의 사정이다)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { IHarnessProjectFile } from './config.ts';

interface IPackageJson {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  scripts?: Record<string, string>;
}

const readJson = async <T>(filePath: string): Promise<T | null> => {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const exists = (filePath: string) =>
  fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);

/** 락파일로 패키지 매니저를 정한다. 추측하지 않는다 — 파일이 없으면 npm 으로 본다. */
const detectPackageManager = async (repoRoot: string): Promise<'yarn' | 'pnpm' | 'npm'> => {
  if (await exists(path.join(repoRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  if (await exists(path.join(repoRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  return 'npm';
};

const globWorkspaceDirs = async (repoRoot: string, patterns: string[]): Promise<string[]> => {
  const dirs: string[] = [];
  for (const pattern of patterns) {
    const [head] = pattern.split('/*');
    const base = path.join(repoRoot, head);
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const dir = path.join(head, entry.name);
      if (await exists(path.join(repoRoot, dir, 'package.json'))) {
        dirs.push(dir);
        continue;
      }
      /* `packages/@scope/*` 처럼 한 겹 더 들어간 스코프 폴더 */
      const nested = await fs.readdir(path.join(repoRoot, dir), { withFileTypes: true }).catch(() => []);
      for (const inner of nested) {
        if (inner.isDirectory() && (await exists(path.join(repoRoot, dir, inner.name, 'package.json')))) {
          dirs.push(path.join(dir, inner.name));
        }
      }
    }
  }
  return dirs;
};

/** vite 설정에서 `outDir` 을 읽는다. 못 읽으면 `dist` — CI 의 sync 경로와 **반드시 대조하라.** */
const detectDistDir = async (repoRoot: string, viteConfig: string): Promise<string> => {
  const source = await fs.readFile(path.join(repoRoot, viteConfig), 'utf8').catch(() => '');
  const matched = /outDir:\s*['"`]([^'"`]+)['"`]/.exec(source);
  if (!matched) {
    return 'dist';
  }
  /* vite 의 outDir 은 vite 설정 위치 기준 상대 경로다. 저장소 루트 기준으로 옮긴다. */
  const resolved = path.normalize(path.join(path.dirname(viteConfig), matched[1]));
  return resolved.split(path.sep).join('/');
};

/** `aws s3 sync` 가 들어 있는 워크플로를 고른다. 여럿이면 prod 로 보이는 것을 먼저. */
const detectDeployWorkflow = async (repoRoot: string): Promise<string | null> => {
  const dir = path.join(repoRoot, '.github', 'workflows');
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const found: string[] = [];
  for (const name of names) {
    const body = await fs.readFile(path.join(dir, name), 'utf8').catch(() => '');
    if (/aws\s+s3\s+sync/.test(body)) {
      found.push(`.github/workflows/${name}`);
    }
  }
  if (found.length === 0) {
    return null;
  }
  return found.find((entry) => /prod|production|release/.test(entry)) ?? found[0];
};

/**
 * 스토리북 산출 위치.
 * ⚠️ 루트를 먼저 보면 안 된다 — 모노레포 루트 스크립트는 보통
 *    `yarn workspace <pkg> build-storybook` 같은 **패스스루**라, 실제 산출은 그 워크스페이스에 있다.
 *    (whitehole-front 에서 실제로 루트 `storybook-static` 이라는 없는 경로를 뱉었다.)
 */
const detectStorybookDist = async (repoRoot: string, workspaceDirs: string[]): Promise<string | null> => {
  /* 스크립트 **이름**이 `build-storybook` 이거나(대개 명령은 `storybook build` 다),
     명령이 build-storybook 을 부르되 다른 워크스페이스로 넘기지 않는 경우. */
  const ownsBuild = (pkg: IPackageJson | null) =>
    Object.entries(pkg?.scripts ?? {}).some(
      ([name, command]) =>
        name === 'build-storybook' || (/build-storybook|storybook\s+build/.test(command) && !/\bworkspace\b/.test(command)),
    );

  for (const dir of workspaceDirs) {
    if (ownsBuild(await readJson<IPackageJson>(path.join(repoRoot, dir, 'package.json')))) {
      return `${dir}/storybook-static`;
    }
  }
  return ownsBuild(await readJson<IPackageJson>(path.join(repoRoot, 'package.json'))) ? 'storybook-static' : null;
};

export interface IInitResult {
  configPath: string;
  config: IHarnessProjectFile;
  todos: string[];
  notes: string[];
}

export const initProjectConfig = async (options: {
  repoRoot: string;
  outPath?: string;
  force?: boolean;
}): Promise<IInitResult> => {
  const { repoRoot } = options;
  const configPath = path.join(repoRoot, options.outPath ?? 'harness/fe-harness.config.json');

  if (!options.force && (await exists(configPath))) {
    throw new Error(`이미 있다: ${configPath} (덮어쓰려면 --force)`);
  }

  const rootPkg = (await readJson<IPackageJson>(path.join(repoRoot, 'package.json'))) ?? {};
  const manager = await detectPackageManager(repoRoot);
  const run = manager === 'npm' ? 'npm run' : manager;
  const notes: string[] = [`패키지 매니저: ${manager} (락파일로 판단)`];
  const todos: string[] = [];

  const workspacePatterns = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : (rootPkg.workspaces?.packages ?? []);
  const workspaceDirs = workspacePatterns.length ? await globWorkspaceDirs(repoRoot, workspacePatterns) : [];

  /* 앱 = vite 설정을 가진 워크스페이스. 없으면 저장소 루트가 앱이다(단일 앱). */
  let appDir = '.';
  let viteConfig = 'vite.config.ts';
  for (const dir of ['.', ...workspaceDirs]) {
    for (const candidate of ['vite.config.ts', 'vite.config.js', 'vite.config.mts']) {
      if (await exists(path.join(repoRoot, dir, candidate))) {
        appDir = dir;
        viteConfig = dir === '.' ? candidate : `${dir}/${candidate}`;
      }
    }
    if (appDir !== '.') {
      break;
    }
  }
  if (appDir === '.' && !(await exists(path.join(repoRoot, viteConfig)))) {
    todos.push('vite 설정을 못 찾았다 — `project.viteConfig` 를 직접 적어라(이 플러그인은 Vite 전제다).');
  }

  const appPkg = (await readJson<IPackageJson>(path.join(repoRoot, appDir, 'package.json'))) ?? {};
  const appWorkspace = appDir === '.' ? '' : (appPkg.name ?? '');
  const appTsconfig = appDir === '.' ? 'tsconfig.json' : `${appDir}/tsconfig.json`;

  const distDir = await detectDistDir(repoRoot, viteConfig);
  notes.push(`빌드 산출: ${distDir} (vite outDir 에서 읽음)`);

  const storybookDist = await detectStorybookDist(repoRoot, workspaceDirs);
  if (storybookDist) {
    notes.push(`스토리북 산출: ${storybookDist} (build-storybook 스크립트에서 찾음)`);
  }

  /* 공유 패키지 소스 진입점 패턴 — 워크스페이스 폴더 이름에서 만든다. */
  const sharedNames = workspaceDirs
    .filter((dir) => dir.startsWith('packages/') && dir !== appDir)
    .map((dir) => dir.split('/').at(-1) ?? '')
    .filter(Boolean);
  const sharedSourceEntry = sharedNames.length ? `packages/(${sharedNames.join('|')})/src` : undefined;
  if (sharedSourceEntry) {
    notes.push(`공유 패키지: ${sharedNames.join(' · ')}`);
  }

  const deployWorkflow = await detectDeployWorkflow(repoRoot);
  if (deployWorkflow) {
    notes.push(`배포 워크플로: ${deployWorkflow}`);
  } else {
    todos.push('`aws s3 sync` 가 있는 워크플로를 못 찾았다 — S3/CloudFront 배포가 아니면 s02·s03 은 건너뛰어라.');
  }

  /* lint 대상 = `lint` 스크립트와 `src/` 를 가진 워크스페이스. 단일 앱이면 한 줄. */
  const lintTargets: { workspace: string; target: string }[] = [];
  for (const dir of workspaceDirs.length ? workspaceDirs : ['.']) {
    const pkg = (await readJson<IPackageJson>(path.join(repoRoot, dir, 'package.json'))) ?? {};
    if (pkg.scripts?.lint && (await exists(path.join(repoRoot, dir, 'src')))) {
      lintTargets.push({ workspace: dir === '.' ? '' : (pkg.name ?? ''), target: './src' });
    }
  }
  if (lintTargets.length === 0) {
    lintTargets.push({ workspace: appWorkspace, target: './src' });
    todos.push('`lint` 스크립트를 가진 워크스페이스를 못 찾았다 — `lintTargets` 를 확인하라.');
  }
  notes.push(`lint 대상 ${lintTargets.length}곳: ${lintTargets.map((entry) => entry.workspace || '(루트)').join(' · ')}`);

  const scripts = rootPkg.scripts ?? {};
  const extraGates: Record<string, string> = {};
  for (const name of Object.keys(scripts)) {
    if (/^typecheck/.test(name)) {
      extraGates[name] = `${run} ${name}`;
    }
  }

  const testScript = scripts['test:run'] ? 'test:run' : 'test';
  const lintJson =
    manager === 'yarn' && appWorkspace
      ? 'yarn workspace <WORKSPACE> exec eslint <TARGET> --report-unused-disable-directives --format json -o <OUT>'
      : 'npx eslint <TARGET> --report-unused-disable-directives --format json -o <OUT>';
  const testFile =
    manager === 'yarn' && appWorkspace
      ? `yarn workspace ${appWorkspace} exec vitest run <PATH> --reporter=basic`
      : 'npx vitest run <PATH> --reporter=basic';

  const config: IHarnessProjectFile = {
    $schema: 'https://internal/fe-harness.config.schema.json',
    project: {
      appWorkspace,
      appDir,
      viteConfig,
      appTsconfig,
      distDir,
      ...(storybookDist ? { storybookDistDir: storybookDist } : {}),
      ...(sharedSourceEntry ? { sharedSourceEntry } : {}),
      deployWorkflow: deployWorkflow ?? '.github/workflows/deploy.yml',
      cloudfrontConfigDir: 'infra/cloudfront',
      cloudfrontConfigPattern: '<ENV>.json',
      seedComponentDir: 'src/components/__harness__',
      deepLinks: [],
      linkPaths: ['node_modules', ...workspaceDirs.map((dir) => `${dir}/node_modules`)],
    },
    commands: {
      install: manager === 'yarn' ? 'yarn install --mode=skip-build' : manager === 'pnpm' ? 'pnpm install' : 'npm ci',
      build: `${run} build`,
      test: `${run} ${testScript}`,
      lintJson,
      testFile,
      ...(Object.keys(extraGates).length ? { extraGates } : {}),
    },
    lintTargets,
    contract: { presets: ['toss', 'a11y', 'tailwind'] },
    wiki: {
      knowledgeDir: '.claude/skills/wiki-frontend/knowledge',
      indexPath: '.claude/skills/wiki-frontend/SKILL.md',
      ...((await exists(path.join(repoRoot, 'CLAUDE.md'))) ? { houseRulesPath: 'CLAUDE.md' } : {}),
    },
  };

  todos.push(
    '`project.deepLinks` 를 앱의 실제 라우트로 채워라 — 비면 s02 가 채점을 거부한다.',
    '`project.initialLoadBudgetKB` 를 지금 초기 로드를 **재서** 넣어라(빌드 후 dist/index.html 이 무는 스크립트 합).',
    '`project.heavyVendor` 에 초기 로드에 있으면 안 되는 벤더를 정규식으로 넣어라(예: "echarts").',
    '`contract.presets` 에 사내 컨벤션(`house-style`)을 켤지 정하라 — 합의가 없으면 켜지 마라.',
  );

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return { configPath, config, todos, notes };
};
