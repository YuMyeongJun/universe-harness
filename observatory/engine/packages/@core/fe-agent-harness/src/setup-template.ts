/**
 * `setup-template` — 이 패키지를 설치한 프로젝트의 **루트 쪽 배선을 자동으로 깐다.**
 *
 * 왜 필요한가: 하네스를 얹는 비용의 대부분은 하네스가 아니라 **주변 배선**이다 —
 * 스크립트 두 줄, 에이전트 구동 스크립트, 가이드 문서 경로. 그걸 사람이 매번 손으로 적으면
 * 프로젝트마다 조금씩 달라지고, 달라진 배선은 조용히 틀린다.
 *
 * 설계 원칙 셋:
 *   1) **덮어쓰지 않는다.** 이미 있는 스크립트/파일은 건드리지 않고 보고만 한다(`force` 로만 덮는다).
 *   2) **경로를 지어내지 않는다.** 가이드 문서는 `require.resolve` 로 **설치된 실물**을 찾는다 —
 *      상대 경로를 세면 패키지가 hoist 되는 위치에 따라 조용히 어긋난다.
 *   3) **무엇을 왜 만들었는지 돌려준다.** 반환값이 곧 리포트다(호출자가 그대로 출력하면 된다).
 *
 * ⚠️ 이 파일은 Node 타입 스트리핑으로 그대로 실행될 수 있어야 한다 — `enum`·클래스·파라미터
 *    프로퍼티를 쓰지 마라(`erasableSyntaxOnly` 가 컴파일 단계에서 먼저 막는다).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 패키지 안에 내장된 에이전트 행동 규약. 구동 스크립트가 시스템 프롬프트로 주입한다. */
export const AGENT_BEHAVIOR_GUIDE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'contracts',
  'agent-behavior-guide.md',
);

export interface IInitializeOptions {
  /** 배선을 깔 프로젝트 루트. 보통 `process.cwd()`. */
  repoRoot: string;
  /** 플러그인 패키지 이름. 스크립트가 이 패키지의 `bin` 을 부른다. */
  pluginPackage?: string;
  /** 설정 파일 경로(저장소 루트 기준). */
  configPath?: string;
  /** 에이전트 기본 모델. */
  agentModel?: string;
  /** 구동 스크립트 형식. 기본은 둘 다 만들지 않고 `node` 하나만 만든다. */
  runnerFormat?: 'node' | 'shell' | 'both';
  /** `portal:`/`link:` 로 얹었으면 true — Node 에 심링크 유지 플래그가 필요하다. */
  linkedInstall?: boolean;
  /** 이미 있는 것을 덮어쓴다. 기본은 건드리지 않고 보고만 한다. */
  force?: boolean;
  /** 무엇이 만들어질지만 본다. */
  dryRun?: boolean;
}

export interface IWrittenFile {
  path: string;
  status: 'created' | 'updated' | 'skipped';
  reason?: string;
}

export interface IInitializeResult {
  files: IWrittenFile[];
  scripts: IWrittenFile[];
  guidePath: string;
  notes: string[];
}

const DEFAULTS = {
  pluginPackage: '@plugins/harness-react-vite',
  configPath: 'harness/fe-harness.config.json',
  agentModel: 'sonnet',
};

const exists = (target: string) =>
  fs
    .stat(target)
    .then(() => true)
    .catch(() => false);

/**
 * 프로젝트가 이 패키지를 **어디에 설치했는지** 실물로 찾는다.
 * ⚠️ `node_modules/...` 를 문자열로 조립하지 마라 — yarn/pnpm 의 hoist 위치가 다르고,
 *    워크스페이스면 아예 심링크다. 조립한 경로는 "있는 것처럼 보이다가" 런타임에 없다.
 */
const resolveGuideForProject = async (repoRoot: string, pluginPackage: string): Promise<string> => {
  const candidates = [
    path.join(repoRoot, 'node_modules', '@core', 'fe-agent-harness', 'contracts', 'agent-behavior-guide.md'),
    path.join(repoRoot, 'node_modules', pluginPackage, 'node_modules', '@core', 'fe-agent-harness', 'contracts', 'agent-behavior-guide.md'),
    AGENT_BEHAVIOR_GUIDE_PATH,
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    [
      'agent-behavior-guide.md 를 못 찾았다. 설치가 끝나지 않았거나 패키지 이름이 다르다.',
      `찾은 자리: ${candidates.join(' · ')}`,
    ].join('\n'),
  );
};

/** `run-agent.mjs` — 가이드를 시스템 프롬프트로 물려 클로드 CLI 를 띄운다. */
const nodeRunnerSource = (options: {
  guideFallback: string;
  agentModel: string;
  configPath: string;
}) => `#!/usr/bin/env node
/**
 * 프론트엔드 에이전트 구동기 — \`node run-agent.mjs "<미션>"\`
 *
 * 이 스크립트가 하는 일은 하나다: **패키지에 내장된 행동 규약을 시스템 프롬프트로 물려**
 * 클로드 CLI 를 띄운다. 규약을 저장소에 복사해 두지 않는 이유는 복사본이 낡기 때문이다 —
 * 항상 설치된 패키지의 실물을 읽는다.
 *
 *   node run-agent.mjs "로그인 화면 초기 로드가 무겁다. 원인을 재고 고쳐라."
 *   node run-agent.mjs --model opus "…"
 *   node run-agent.mjs --print "…"      # 대화형 대신 1회 실행(-p)
 *
 * ⛔ 게이트(build/lint/test)를 직접 반복해 돌리지 마라. 검증은 \`yarn harness verify\` 한 번이다.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/* 설치된 **실물**을 찾는다. 상대 경로를 세면 hoist 위치에 따라 조용히 어긋난다. */
const guidePath = (() => {
  try {
    return createRequire(import.meta.url).resolve('@core/fe-agent-harness/agent-behavior-guide');
  } catch {
    return path.join(repoRoot, '${options.guideFallback}');
  }
})();

if (!fs.existsSync(guidePath)) {
  console.error(\`행동 규약을 못 찾았다: \\\${guidePath}\\n설치가 끝났는지 확인하라(yarn install).\`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const takeFlag = (name) => {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const [, value] = argv.splice(index, 2);
  return value;
};

const model = takeFlag('--model') ?? '${options.agentModel}';
const printOnce = argv.includes('--print');
const mission = argv.filter((token) => !token.startsWith('--')).join(' ').trim();

if (!mission) {
  console.error('미션을 한 줄로 줘라: node run-agent.mjs "<무엇을 고쳐야 하는가>"');
  process.exit(1);
}

/* 저장소 고유 사실(경로·명령)은 규약이 아니라 설정 파일에 있다. 에이전트가 그것부터 읽게 한다. */
const configHint = fs.existsSync(path.join(repoRoot, '${options.configPath}'))
  ? '프로젝트 경로·명령은 \`${options.configPath}\` 에 있다. 경로를 추측하지 말고 그 파일을 읽어라.'
  : '';

const args = ['--system-prompt-file', guidePath, '--model', model];
if (printOnce) {
  args.push('-p');
}

const child = spawn('claude', [...args, [mission, configHint].filter(Boolean).join('\\n\\n')], {
  cwd: repoRoot,
  stdio: 'inherit',
});
child.on('close', (code) => process.exit(code ?? 1));
`;

/** `run-agent.sh` — Node 없이 셸만으로 같은 일을 한다. */
const shellRunnerSource = (options: { guidePathExpression: string; agentModel: string; configPath: string }) => `#!/usr/bin/env bash
# 프론트엔드 에이전트 구동기 — ./run-agent.sh "<미션>"
#
# 패키지에 내장된 행동 규약을 시스템 프롬프트로 물려 클로드 CLI 를 띄운다.
# 규약을 저장소에 복사하지 않는다 — 복사본은 낡는다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
GUIDE="${options.guidePathExpression}"
MODEL="\${HARNESS_AGENT_MODEL:-${options.agentModel}}"

if [ ! -f "$GUIDE" ]; then
  echo "행동 규약을 못 찾았다: $GUIDE" >&2
  echo "설치가 끝났는지 확인하라(yarn install)." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo '미션을 한 줄로 줘라: ./run-agent.sh "<무엇을 고쳐야 하는가>"' >&2
  exit 1
fi

MISSION="$*"
if [ -f "$REPO_ROOT/${options.configPath}" ]; then
  MISSION="$MISSION

프로젝트 경로·명령은 \\\`${options.configPath}\\\` 에 있다. 경로를 추측하지 말고 그 파일을 읽어라."
fi

exec claude --system-prompt-file "$GUIDE" --model "$MODEL" "$MISSION"
`;

const writeFileIfAllowed = async (
  target: string,
  content: string,
  options: { force?: boolean; dryRun?: boolean; mode?: number },
): Promise<IWrittenFile> => {
  const already = await exists(target);
  if (already && !options.force) {
    return { path: target, status: 'skipped', reason: '이미 있다 (덮으려면 force)' };
  }
  if (!options.dryRun) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    if (options.mode !== undefined) {
      await fs.chmod(target, options.mode);
    }
  }
  return { path: target, status: already ? 'updated' : 'created' };
};

/**
 * 프로젝트 루트에 하네스 배선을 깐다.
 *
 *   const report = await initializeProjectSettings({ repoRoot: process.cwd() });
 */
export const initializeProjectSettings = async (options: IInitializeOptions): Promise<IInitializeResult> => {
  const pluginPackage = options.pluginPackage ?? DEFAULTS.pluginPackage;
  const configPath = options.configPath ?? DEFAULTS.configPath;
  const agentModel = options.agentModel ?? DEFAULTS.agentModel;
  const runnerFormat = options.runnerFormat ?? 'node';
  const notes: string[] = [];

  const guidePath = await resolveGuideForProject(options.repoRoot, pluginPackage);
  notes.push(`행동 규약: ${path.relative(options.repoRoot, guidePath)}`);

  /* ── 1) 루트 package.json 의 scripts ─────────────────────────────────── */
  const manifestPath = path.join(options.repoRoot, 'package.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw) as { scripts?: Record<string, string> };

  /* portal:/link: 로 얹으면 심링크가 realpath 로 풀려 의존 해석이 엉뚱한 곳을 판다.
     그래서 그때만 플래그를 붙인다. ⛔ NODE_OPTIONS 로 주면 자식(측정 대상 빌드)까지 오염된다. */
  const nodeFlags = options.linkedInstall ? 'node --preserve-symlinks --preserve-symlinks-main ' : '';
  const binBase = options.linkedInstall ? `./node_modules/${pluginPackage}/dist` : '';
  const invoke = (entry: string, bin: string) =>
    options.linkedInstall ? `${nodeFlags}${binBase}/${entry}` : bin;

  const desiredScripts: Record<string, string> = {
    harness: `${invoke('cli.js', 'fe-harness')} --config ${configPath}`,
    'harness:wiki': `${invoke('wiki.js', 'fe-harness-wiki')} --config ${configPath}`,
  };

  const scripts: IWrittenFile[] = [];
  const nextScripts = { ...(manifest.scripts ?? {}) };
  for (const [name, command] of Object.entries(desiredScripts)) {
    const current = nextScripts[name];
    if (current !== undefined && current !== command && !options.force) {
      scripts.push({ path: name, status: 'skipped', reason: `이미 다른 값이다: ${current}` });
      continue;
    }
    scripts.push({ path: name, status: current === undefined ? 'created' : 'updated' });
    nextScripts[name] = command;
  }

  if (!options.dryRun && scripts.some((entry) => entry.status !== 'skipped')) {
    /* 들여쓰기와 키 순서를 최대한 보존한다 — 포맷이 통째로 바뀌면 리뷰가 불가능해진다. */
    const indent = /^\{\n(\s+)"/.exec(manifestRaw)?.[1]?.length ?? 2;
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify({ ...manifest, scripts: nextScripts }, null, indent)}\n`,
      'utf8',
    );
  }

  /* ── 2) 에이전트 구동 스크립트 ───────────────────────────────────────── */
  const files: IWrittenFile[] = [];
  const relativeGuide = path.relative(options.repoRoot, guidePath).split(path.sep).join('/');

  if (runnerFormat === 'node' || runnerFormat === 'both') {
    files.push(
      await writeFileIfAllowed(
        path.join(options.repoRoot, 'run-agent.mjs'),
        nodeRunnerSource({ guideFallback: relativeGuide, agentModel, configPath }),
        { force: options.force, dryRun: options.dryRun, mode: 0o755 },
      ),
    );
  }

  if (runnerFormat === 'shell' || runnerFormat === 'both') {
    files.push(
      await writeFileIfAllowed(
        path.join(options.repoRoot, 'run-agent.sh'),
        shellRunnerSource({
          guidePathExpression: `$REPO_ROOT/${relativeGuide}`,
          agentModel,
          configPath,
        }),
        { force: options.force, dryRun: options.dryRun, mode: 0o755 },
      ),
    );
  }

  /* ── 3) 산출물 무시 목록 ─────────────────────────────────────────────── */
  const gitignorePath = path.join(options.repoRoot, '.gitignore');
  const gitignore = await fs.readFile(gitignorePath, 'utf8').catch(() => '');
  if (!/^\.harness\/?$/m.test(gitignore)) {
    if (!options.dryRun) {
      await fs.writeFile(
        gitignorePath,
        `${gitignore}${gitignore.endsWith('\n') || gitignore === '' ? '' : '\n'}\n# EnvHarness 산출물 (샌드박스 워크트리 · 궤적 JSONL)\n.harness/\n`,
        'utf8',
      );
    }
    files.push({ path: gitignorePath, status: 'updated', reason: '.harness/ 추가' });
  } else {
    files.push({ path: gitignorePath, status: 'skipped', reason: '.harness/ 가 이미 있다' });
  }

  notes.push(
    `다음: \`yarn harness init\` 으로 ${configPath} 초안을 만들고, 기계가 못 잰 값(deepLinks · 초기 로드 예산 · heavyVendor)을 채워라.`,
    '그다음 `yarn harness scan` 으로 관문이 지금 코드에서 무엇을 잡는지 먼저 보라.',
  );

  return { files, scripts, guidePath, notes };
};

/** 리포트를 사람이 읽는 형태로. 호출자(CLI)가 그대로 출력한다. */
export const formatInitializeResult = (result: IInitializeResult, repoRoot: string): string => {
  const line = (entry: IWrittenFile) =>
    `  ${entry.status === 'skipped' ? '·' : '✅'} ${path.isAbsolute(entry.path) ? path.relative(repoRoot, entry.path) : `package.json > scripts.${entry.path}`}` +
    `${entry.reason ? `  (${entry.reason})` : ''}`;

  return [
    '스크립트:',
    ...result.scripts.map(line),
    '',
    '파일:',
    ...result.files.map(line),
    '',
    ...result.notes.map((note) => `→ ${note}`),
  ].join('\n');
};
