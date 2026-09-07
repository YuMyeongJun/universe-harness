/**
 * 스모크 — **Next 저장소도 네트워크도 없이 수 초 안에** 돈다.
 *   npm run selftest -w @plugins/harness-next
 *
 * 이 플러그인의 눈은 「산출물을 읽어 클라이언트 번들에 무엇이 들었나」를 세는 부분이다.
 * 그래서 여기서 반드시 확인하는 것 둘:
 *   ① 결함이 있는 산출과 고친 산출을 **실제로 갈라 보는가** (안 갈리면 채점이 장식이다)
 *   ② **0개를 훑었을 때 통과로 보이지 않는가** (초록불로 보이는 실패가 가장 나쁘다)
 */
import assert from 'node:assert/strict';
import { auditDeclaredParses, auditParsesDeclarations } from '@core/fe-agent-harness';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runStaticRules } from '@core/fe-agent-contracts';
import type { IExecResult, IStageIO } from '@core/fe-agent-harness';

import { parseArgv } from './argv.ts';
import { stripJsonc } from './config.ts';
import { runBuildOutputCensus } from './gates.ts';
import { findMarker, readClientBundle } from './output.ts';
import { DEFAULT_NEXT_PATHS } from './paths.ts';
import type { INextPaths } from './paths.ts';
import { NEXT_BOUNDARY_RULES } from './rules/boundaries.ts';
import { createStage01 } from './stages/s01-use-client-boundary.ts';
import { createNextStages } from './stages/index.ts';

const MARKER = 'ledger.internal.harness-invalid';
const BUTTON_LABEL = '정산 요약 불러오기';
const ALL_LANES = { quality: true, typeSafety: true, tailwind: true, a11y: true, delivery: true };

/** 파일 시스템만 쓰는 IStageIO. 명령 실행은 이 스모크에서 쓰지 않는다. */
const fakeIO = (root: string): IStageIO => ({
  root,
  exec: async (): Promise<IExecResult> => ({ code: 0, stdout: '', stderr: '', timedOut: false }),
  read: (relPath) => fs.readFile(path.join(root, relPath), 'utf8'),
  write: async (relPath, content) => {
    await fs.mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
    await fs.writeFile(path.join(root, relPath), content, 'utf8');
  },
  exists: (relPath) =>
    fs
      .stat(path.join(root, relPath))
      .then(() => true)
      .catch(() => false),
  log: () => undefined,
});

const write = async (file: string, body: string) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
};

const signal = (signals: { name: string; ok: boolean }[], name: string) => {
  const found = signals.find((entry) => entry.name === name);
  assert.ok(found, `신호가 없다: ${name}`);
  return found;
};

const main = async () => {
  /* 0. 인자 파서 — 스크립트에 플래그가 박혀 있으면 argv 는 `['--config', '<경로>', 'list']` 로 온다. */
  const parsed = parseArgv(['--config', 'harness/next-harness.config.json', 'run', 's01-use-client-boundary', '--keep']);
  assert.deepEqual(parsed.positionals, ['run', 's01-use-client-boundary'], '플래그 뒤의 위치 인자를 못 읽었다');
  assert.equal(parsed.flags['--config'], 'harness/next-harness.config.json');
  assert.ok(parsed.booleans.has('--keep'));
  console.log('✅ 인자 파서 (플래그 선행)');

  /* 0-1. JSONC — 설정 파일은 주석으로 설명한다. 문자열 안의 `//` 를 지우면 URL 이 잘린다. */
  assert.deepEqual(
    JSON.parse(
      stripJsonc(`{
    // 줄 전체 주석
    "a": "https://example.com/x", // 줄 끝 주석
    /* 블록 주석 */
    "b": [1, 2,],
  }`),
    ),
    { a: 'https://example.com/x', b: [1, 2] },
  );
  console.log('✅ JSONC 파서 (URL 보존 · 블록 주석 · 후행 쉼표)');

  /* 1. 경계 규칙이 **실제로 일어나는 네 모양**을 잡는가. */
  const offenders = [
    {
      path: 'app/reports/Panel.tsx',
      content: `'use client';\nconst token = process.env.LEDGER_API_TOKEN;\nexport const Panel = () => <p>{token}</p>;\n`,
    },
    { path: 'app/ui/index.ts', content: `'use client';\nexport * from './Table';\n` },
    { path: 'app/reports/layout.tsx', content: `'use client';\nexport default function L() { return null; }\n` },
    {
      path: 'app/reports/page.tsx',
      content: `export const getServerSideProps = async () => ({ props: {} });\nexport default function P() { return null; }\n`,
    },
  ];
  const caught = new Set(runStaticRules(offenders, NEXT_BOUNDARY_RULES, ALL_LANES).map((reason) => reason.rule));
  assert.deepEqual(
    [...caught].sort(),
    ['next/env-in-client', 'next/pages-api-in-app-router', 'next/use-client-in-barrel', 'next/use-client-in-layout'],
    `경계 규칙이 놓친 것이 있다: ${[...caught].join(' · ')}`,
  );
  console.log('✅ 경계 규칙 4종 검출');

  /* 1-1. 오탐 0 — 멀쩡한 코드를 벌하면 관문은 무시하는 법부터 가르친다. */
  const clean = [
    /* 서버 컴포넌트에서 환경변수를 읽는 것은 **정상**이다. */
    { path: 'app/reports/page.tsx', content: `const token = process.env.LEDGER_API_TOKEN;\nexport default () => null;\n` },
    /* 클라이언트에서 `NEXT_PUBLIC_` 를 읽는 것도 정상이다(공개하기로 한 값). */
    {
      path: 'app/reports/Panel.tsx',
      content: `'use client';\nconst id = process.env.NEXT_PUBLIC_ANALYTICS_ID;\nexport const Panel = () => <p>{id}</p>;\n`,
    },
    /* 지시어 없는 배럴·레이아웃도 정상이다. */
    { path: 'app/ui/index.ts', content: `export * from './Table';\n` },
    { path: 'app/reports/layout.tsx', content: `export default function L() { return null; }\n` },
    /* Pages Router 안의 `getServerSideProps` 는 제자리다. */
    { path: 'pages/reports.tsx', content: `export const getServerSideProps = async () => ({ props: {} });\n` },
  ];
  const falsePositives = runStaticRules(clean, NEXT_BOUNDARY_RULES, ALL_LANES);
  assert.equal(
    falsePositives.length,
    0,
    `정상 코드를 잡았다: ${falsePositives.map((reason) => `${reason.rule}@${reason.where}`).join(' · ')}`,
  );
  console.log('✅ 정상 코드 오탐 0 (서버의 env · NEXT_PUBLIC_ · 지시어 없는 배럴/레이아웃 · pages/)');

  /* 2. 산출물 리더 — 청크에서 마커를 세는가. */
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'next-harness-'));
  const paths: INextPaths = { ...DEFAULT_NEXT_PATHS };
  const outputRoot = path.join(root, paths.buildOutputDir);
  const chunk = path.join(outputRoot, paths.clientChunksDir, 'app', 'page-abcd1234.js');
  const serverChunk = path.join(outputRoot, paths.serverOutputDir, 'app', '__harness__', 'page.js');

  await write(chunk, `(()=>{const e="https://${MARKER}/v1/summary";console.log(e)})()`);
  await write(serverChunk, `const e="https://${MARKER}/v1/summary";`);

  const bundle = await readClientBundle(outputRoot, paths.clientChunksDir);
  assert.equal(bundle.files.length, 1, '중첩된 청크를 못 찾았다');
  assert.equal((await findMarker(bundle.files, MARKER)).length, 1, '마커를 못 셌다');
  console.log('✅ 산출물 리더 (중첩 청크 재귀 · 리터럴 마커 계수)');

  /* 2-1. **0개를 훑으면 통과가 아니다.** 경로 설정이 틀렸을 때 조용히 초록불이 나면 안 된다. */
  const goodCensus = await runBuildOutputCensus(fakeIO(root), paths);
  assert.equal(goodCensus.ok, true, `청크가 있는데 인구조사가 실패했다: ${goodCensus.measured}`);
  const badCensus = await runBuildOutputCensus(fakeIO(root), { ...paths, buildOutputDir: '.next-wrong' });
  assert.equal(badCensus.ok, false, '산출 경로가 틀렸는데 인구조사가 통과했다 — 초록불로 보이는 실패다');
  console.log('✅ 빌드 산출 인구조사 (경로가 틀리면 0개가 아니라 실패)');

  /* 3. 스테이지 채점이 **결함 상태와 고친 상태를 실제로 가르는가.** */
  const stage = createStage01(paths);
  const io = fakeIO(root);
  await io.write(
    'app/__harness__/ReceiptPanel.tsx',
    `'use client';\nimport { useState } from 'react';\nexport const ReceiptPanel = () => {\n  const [s, setS] = useState(null);\n  return <button onClick={() => setS(1)}>${BUTTON_LABEL}</button>;\n};\n`,
  );

  const broken = await stage.verify(io);
  assert.equal(signal(broken, '클라이언트 번들을 실제로 훑었다').ok, true);
  assert.equal(signal(broken, '서버 몫 모듈이 클라이언트 번들에 없다').ok, false, '결함 상태를 통과시켰다');
  assert.equal(signal(broken, '서버 산출에는 그대로 남아 있다').ok, true);

  /* 고친 상태 = 클라이언트 청크에서 모듈이 빠지고, 서버 산출에는 남아 있다. */
  await write(chunk, '(()=>{console.log("no server module here")})()');
  const fixed = await stage.verify(io);
  assert.ok(
    fixed.every((entry) => entry.ok),
    `고친 상태를 통과시키지 못했다: ${fixed.filter((entry) => !entry.ok).map((entry) => entry.name).join(' · ')}`,
  );
  console.log('✅ 스테이지 채점 (결함 상태 ❌ · 고친 상태 ✅ 로 갈린다)');

  /* 3-1. 게이트웨이를 **지워서** 통과시키는 길을 막는가. */
  await fs.rm(serverChunk);
  const deleted = await stage.verify(io);
  assert.equal(signal(deleted, '서버 산출에는 그대로 남아 있다').ok, false, '모듈을 지웠는데 통과시켰다');
  console.log('✅ 지워서 통과시키기 차단 (서버 산출에 남아 있어야 한다)');

  /* 3-2. 심을 자리가 없으면 **아무것도 심지 않고 멈춘다.** 엉뚱한 곳에 심으면 측정이 거짓이 된다. */
  const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'next-harness-empty-'));
  await assert.rejects(
    () => stage.setup(fakeIO(emptyRoot)),
    /App Router 루트를 못 찾았다/,
    'App Router 가 없는데 결함을 심었다',
  );
  console.log('✅ App Router 가 없으면 주입을 거부한다');

  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(emptyRoot, { recursive: true, force: true });

  /* **스테이지 감사 — 코어의 것을 부른다.**
   * R16 의 요점이 이것이다: 감사가 react-vite 안에만 있으면 **새 플러그인이 그 감사를
   * 안 받는다.** 그것이 가장 흔한 어긋남이라 코어로 올리고 여기서도 부른다.
   * 지금 Next 스테이지는 스키마를 파싱하지 않아 `parses` 가 비어 있고, 감사는
   * 「파싱 안 하는데 선언했는가」쪽을 본다 — **선언이 생기는 순간부터 ①도 돈다.** */
  const nextStages = createNextStages(DEFAULT_NEXT_PATHS);
  const nextGarbage = await auditDeclaredParses(nextStages);
  assert.deepEqual(nextGarbage, [], `선언한 파싱 자리가 쓰레기를 삼켰다:\n${nextGarbage.map((f) => `  ${f.stage}: ${f.what}`).join('\n')}`);

  const nextMissing = await auditParsesDeclarations(path.join(path.dirname(fileURLToPath(import.meta.url)), 'stages'));
  assert.deepEqual(nextMissing, [], `선언이 어긋났다:\n${nextMissing.map((f) => `  ${f.stage}: ${f.what}`).join('\n')}`);
  console.log(`✅ 스테이지 감사 — Next 스테이지 ${nextStages.length}개도 같은 감사를 받는다`);

  console.log('\nNext 플러그인 전부 통과.');
};

void main();
