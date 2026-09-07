/**
 * Stage 01 — Vite 빌드 · 모노레포 의존 꼬임.
 *
 * 주입하는 결함 두 개는 **둘 다 이 저장소에서 실제로 일어난 것**이다:
 *  (a) `manualChunks` 를 object 형으로 되돌린다. Vite 의 object 형은 지정 패키지의
 *      **전이 의존성까지** 같은 청크에 담아, 앱과 공유되는 미세 의존성 하나 때문에 엔트리가
 *      그 청크를 정적으로 import 하게 만든다 → 청크 전체가 초기 로드가 된다.
 *      2026-08-29 실측: `echarts-vendor`(1.1MB)가 그렇게 모든 화면에 실렸다.
 *  (b) 앱 `tsconfig.json` 에 공유 패키지 **소스** 경로 별칭을 심는다. 빌드된 진입점과 소스
 *      진입점이 두 벌로 번들에 들어가 상태가 갈린다. (빌드는 통과한다 — 게이트만 보면 안 보인다.)
 *
 * ⚠️ 2026-09-04 실측(픽스처 은하): (a) 의 object 형 매핑이 **한 저장소의 의존성 목록**
 *    (`@tanstack/react-query`·`echarts`·`axios`…)을 문자열로 박고 있었다. 그 패키지가 없는
 *    저장소에서는 `Could not resolve entry module` 로 **boot build 가 exit 1** — 결함이 아니라
 *    빌드 파괴였다. 지금은 **은하의 `package.json` 을 읽어** 실제 있는 의존성만으로 청크
 *    매핑을 만든다(`paths.ts` 의 "여기 기본값에 특정 저장소의 이름을 넣지 마라" 규칙과 같은 이유).
 *    `replaceManualChunks` 도 문자열·주석 속의 `manualChunks(` 를 코드로 오인해 파일을 잘라내던
 *    버그가 있었다 — 이제 코드 영역만 훑고, 자른 결과가 괄호 균형을 잃으면 **그 자리에서** 던진다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { IStageDefinition, IStageIO, ISignal } from '@core/fe-agent-harness';

import { inApp } from '../paths.ts';
import type { IReactVitePaths } from '../paths.ts';

/**
 * 문자열·주석을 **같은 길이의 공백**으로 지운 사본을 만든다. 인덱스가 원본과 그대로
 * 맞아떨어지므로, "코드에서만" 찾고 원본 슬라이스는 그대로 쓸 수 있다.
 *
 * ⚠️ export 하는 이유: selftest 가 (c)·(d) 회귀를 이 함수들을 직접 불러서 잰다
 * (`src/selftest.ts`) — 스테이지 전체를 `reset()` 하려면 샌드박스·빌드가 필요해 무겁다.
 */
export const maskNonCode = (source: string): string => {
  let masked = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      const newline = source.indexOf('\n', index);
      const end = newline === -1 ? source.length : newline;
      masked += ' '.repeat(end - index);
      index = end;
      continue;
    }
    if (char === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      const end = close === -1 ? source.length : close + 2;
      masked += ' '.repeat(end - index);
      index = end;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      let j = index + 1;
      while (j < source.length && source[j] !== char) {
        j += source[j] === '\\' ? 2 : 1;
      }
      j = Math.min(j + 1, source.length);
      masked += ' '.repeat(j - index);
      index = j;
      continue;
    }
    masked += char;
    index += 1;
  }
  return masked;
};

/** 주입 결과가 파싱 가능한 모양인지 최소한으로 스스로 검증한다 — 조용히 깨진 파일을 남기지 않는다. */
const assertNotBroken = (source: string, label: string) => {
  const masked = maskNonCode(source);
  let depth = 0;
  for (const char of masked) {
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth < 0) {
        throw new Error(`${label}: 중괄호가 닫는 쪽이 먼저 나왔다 — 주입이 파일을 깨뜨렸다(자기검증 실패).`);
      }
    }
  }
  if (depth !== 0) {
    throw new Error(`${label}: 중괄호 짝이 안 맞는다(열림-닫힘 차이 ${depth}) — 주입이 파일을 깨뜨렸다(자기검증 실패).`);
  }
  if (!/export\s+default/.test(masked)) {
    throw new Error(`${label}: 주입 후 \`export default\` 가 사라졌다 — 주입이 파일을 깨뜨렸다(자기검증 실패).`);
  }
};

/** `manualChunks(id: string) { ... }` 의 닫는 괄호를 세어 함수 전체를 잘라낸다.
 *  ⚠️ 문자열·주석 속의 `manualChunks(` 는 무시한다(마스킹된 사본에서만 찾는다) — 그렇지 않으면
 *     머리말 주석에 이 이름이 등장하는 것만으로 파일이 잘못 잘린다(2026-09-04 실측). */
export const replaceManualChunks = (source: string, replacement: string) => {
  const masked = maskNonCode(source);
  const start = masked.indexOf('manualChunks(');
  if (start === -1) {
    throw new Error(
      'manualChunks 함수형을 코드 영역에서 찾지 못했다 — 스테이지 주입을 멈춘다(잘못 자르면 측정이 거짓이 된다).',
    );
  }
  let depth = 0;
  let index = masked.indexOf('{', start);
  const bodyStart = index;
  while (index < masked.length) {
    if (masked[index] === '{') {
      depth += 1;
    }
    if (masked[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
    index += 1;
  }
  if (bodyStart === -1 || depth !== 0) {
    throw new Error('manualChunks 본문 괄호를 못 맞췄다.');
  }
  const next = `${source.slice(0, start)}${replacement}${source.slice(index + 1)}`;
  assertNotBroken(next, 'replaceManualChunks 주입 직후 자기검증');
  return next;
};

interface IPackageJsonShape {
  dependencies?: Record<string, string>;
}

/**
 * object 형 청크 매핑을 **은하가 실제로 가진 의존성**에서 만든다. 어떤 패키지 이름도
 * 여기 하드코딩하지 않는다 — 없는 패키지를 매핑에 넣으면 Vite 가 `Could not resolve entry
 * module` 로 죽는다(2026-09-04 실측, 이 파일 머리말 참고).
 *
 * react/react-dom 은 실제 결함(echarts-vendor 가 통째로 초기 로드에 실린 사고)과 같은 모양으로
 * 따로 묶는다 — 청크 전략의 위험(전이 의존성이 같은 청크에 눌러 담기는 것)을 재현하는 것이
 * 목적이지, 어떤 특정 벤더를 재현하는 것이 아니다. 나머지 의존성은 전부 한 청크(`vendor`)로
 * 몬다.
 */
export const buildObjectFormFromDependencies = async (io: IStageIO, paths: IReactVitePaths): Promise<string> => {
  const pkgPath = inApp(paths, 'package.json');
  const raw = await io.read(pkgPath).catch(() => '{}');
  let parsed: IPackageJsonShape;
  try {
    parsed = JSON.parse(raw) as IPackageJsonShape;
  } catch {
    parsed = {};
  }
  const deps = Object.keys(parsed.dependencies ?? {}).sort();
  if (deps.length === 0) {
    throw new Error(
      `${pkgPath} 에 dependencies 가 없다 — object 형 청크 매핑을 재현할 실제 의존성이 이 은하에 없다.`,
    );
  }

  const reactFamily = deps.filter((name) => name === 'react' || name === 'react-dom' || name.startsWith('react-dom/'));
  const rest = deps.filter((name) => !reactFamily.includes(name));

  const groups: [string, string[]][] = [];
  if (reactFamily.length > 0) {
    groups.push(['react-vendor', reactFamily]);
  }
  if (rest.length > 0) {
    groups.push(['vendor', rest]);
  }

  const body = groups
    .map(([name, mods]) => `          '${name}': [${mods.map((mod) => `'${mod}'`).join(', ')}]`)
    .join(',\n');
  return `manualChunks: {\n${body},\n        }`;
};

/** index.html 이 **정적으로** 물고 들어가는 스크립트 집합(entry + modulepreload). */
const initialGraph = async (distDir: string): Promise<string[]> => {
  const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  const sources = [
    ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]),
    ...[...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((match) => match[1]),
  ];
  return [...new Set(sources)].map((src) => src.replace(/^\//, ''));
};

export const createStage01 = (paths: IReactVitePaths): IStageDefinition => ({
  id: 's01-vite-monorepo-tangle',
  title: 'Vite 번들 전략과 모노레포 의존 꼬임',
  intent:
    '빌드가 초록불인 채로 초기 로드가 무거워지고 공유 패키지가 두 벌로 들어가는 상태를 재현하고, 산출물에서 그것을 증명해 고친다.',
  /* 실측(2026-09-04): 도구 없이 probe 로만 조사하면 원인 규명에 7스텝이 든다.
     8이면 patch·submit 자리가 안 남는다 — 조사 예산과 수정 예산을 함께 준다. */
  maxSteps: 14,
  contractLanes: { quality: true, typeSafety: true, a11y: false, tailwind: false, delivery: false },

  setup: async (io: IStageIO) => {
    const objectForm = await buildObjectFormFromDependencies(io, paths);
    const vite = await io.read(paths.viteConfig);
    await io.write(paths.viteConfig, replaceManualChunks(vite, objectForm));

    const tsconfigRaw = await io.read(paths.appTsconfig);
    const tangled = tsconfigRaw.replace(
      /"paths"\s*:\s*\{/,
      `"paths": {\n      "@shared/modules": ["../../packages/modules/src/index.ts"],\n      "@shared/models": ["../../packages/models/src/index.ts"],`,
    );
    if (tangled === tsconfigRaw) {
      io.log('⚠️ tsconfig 에 paths 블록이 없어 (b) 결함을 주입하지 못했다 — (a) 만으로 진행한다.');
    } else {
      await io.write(paths.appTsconfig, tangled);
    }
  },

  briefing: async () => `
사용자 신고: "대시보드가 아니라 **로그인 화면부터** 느리다."

- 게이트는 전부 초록불이다(빌드 · 린트 · 유닛 테스트).
- 산출은 \`${paths.distDir}/\` 다(CI 의 \`aws s3 sync\` 와 같은 경로).
- 재는 방법은 네가 정한다. 다만 **추정으로 답하지 마라** — 산출물에서 읽어라.
  힌트: \`${paths.distDir}/index.html\` 이 정적으로 물고 들어가는 스크립트가 초기 로드다.

⛔ 게이트를 네가 반복해서 돌리지 마라 — 러너가 중앙에서 돌린다.
   조사에는 이미 만들어진 \`${paths.distDir}/\` 를 읽어라.
`,

  verify: async (io: IStageIO): Promise<ISignal[]> => {
    const distDir = path.join(io.root, paths.distDir);
    const signals: ISignal[] = [];

    const vite = await io.read(paths.viteConfig);
    signals.push({
      name: 'manualChunks 는 함수형이다',
      ok: /manualChunks\s*\(/.test(vite),
      measured: /manualChunks\s*\(/.test(vite) ? 'function' : 'object',
      detail: 'object 형은 전이 의존성까지 같은 청크에 담아 초기 로드로 끌어올린다.',
    });

    const tsconfig = await io.read(paths.appTsconfig);
    signals.push({
      name: '공유 패키지를 소스로 직접 가리키지 않는다',
      ok: !paths.sharedSourceEntry.test(tsconfig),
      detail: '빌드 진입점과 소스 진입점이 함께 들어가면 같은 모듈이 두 벌이 된다.',
    });

    const graph = await initialGraph(distDir);
    const bodies = await Promise.all(graph.map((rel) => fs.readFile(path.join(distDir, rel), 'utf8').catch(() => '')));
    const bytes = bodies.reduce((sum, body) => sum + Buffer.byteLength(body), 0);
    const hasHeavyVendor = bodies.some((body) => paths.heavyVendor.test(body.slice(0, 200_000)));

    signals.push({
      name: '초기 로드에 무거운 벤더가 없다',
      ok: !hasHeavyVendor,
      measured: `초기 청크 ${graph.length}개 · ${(bytes / 1024).toFixed(0)}KB · 패턴 ${String(paths.heavyVendor)}`,
      detail: '무거운 벤더를 쓰는 코드는 lazy 뒤에만 있다. 초기 로드에 있으면 청크 전략이 끌어올린 것이다.',
    });

    signals.push({
      name: `초기 로드 예산 ${(paths.initialLoadBudgetBytes / 1024 / 1024).toFixed(1)}MB 이하`,
      ok: bytes <= paths.initialLoadBudgetBytes,
      measured: `${(bytes / 1024).toFixed(0)}KB`,
    });

    return signals;
  },
});
