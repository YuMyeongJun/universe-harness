/**
 * 스모크 — S3/CloudFront 시뮬레이터만 확인한다(네트워크·빌드 없이 수 초).
 *   yarn workspace @plugins/harness-react-vite selftest
 *
 * 배포 사고는 **빌드가 초록불인 채로** 난다. 그래서 이 시뮬레이터가 이 플러그인의 눈이다 —
 * 여기가 죽으면 s02·s03 의 채점은 전부 의미가 없다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditDeclaredParses,
  auditUndeclaredParses, auditParsesDeclarations, probeDenyReason } from '@core/fe-agent-harness';
import type { IStageIO } from '@core/fe-agent-harness';

import { parseArgv } from './argv.ts';
import { stripJsonc } from './config.ts';
import { loadCloudFrontConfig } from './aws/loadConfig.ts';
import { createDistribution, readDeployIntent } from './aws/simulate.ts';
import { createReactViteStages } from './stages/index.ts';
import { buildObjectFormFromDependencies, replaceManualChunks } from './stages/s01-vite-monorepo-tangle.ts';
import { DEFAULT_REACT_VITE_PATHS } from './paths.ts';

/** `buildObjectFormFromDependencies` 는 `io.read` 만 쓴다 — 나머지는 호출되면 바로 실패하게 둔다. */
const stubIo = (read: (relPath: string) => Promise<string>): IStageIO => ({
  root: '/dev/null',
  read,
  exec: () => {
    throw new Error('selftest 스텁: exec 은 안 부르는 게 맞다');
  },
  write: () => {
    throw new Error('selftest 스텁: write 는 안 부르는 게 맞다');
  },
  exists: () => {
    throw new Error('selftest 스텁: exists 는 안 부르는 게 맞다');
  },
  log: () => undefined,
});

const main = async () => {
  /* 0. 인자 파서 — 스크립트에 플래그가 박혀 있으면 argv 는 `['--config', '<경로>', 'list']` 로 온다.
        위치 인자를 argv[0] 으로 읽던 시절 `yarn harness list` 가 사용법만 뱉었다(실측 회귀). */
  const parsed = parseArgv(['--config', 'harness/fe-harness.config.json', 'list', '--keep']);
  assert.deepEqual(parsed.positionals, ['list'], '플래그 뒤의 위치 인자를 못 읽었다');
  assert.equal(parsed.flags['--config'], 'harness/fe-harness.config.json');
  assert.ok(parsed.booleans.has('--keep'));
  console.log('✅ 인자 파서 (플래그 선행)');

  /* 0-1. probe deny — **경로에 든 프레임워크 이름을 명령으로 착각하면 안 된다.**
        실측 회귀: `cat apps/partners/vite.config.ts` 가 막혀 에이전트가 8스텝을 태웠다. */
  for (const allowed of [
    'cat apps/partners/vite.config.ts',
    "sed -n '1,200p' apps/partners/vite.config.ts",
    'grep -n manualChunks apps/partners/vite.config.ts',
    'ls -la dist/assets',
    'wc -c dist/assets/index.js',
  ]) {
    assert.equal(probeDenyReason(allowed), null, `읽기 명령을 막았다: ${allowed}`);
  }
  for (const blocked of [
    'yarn build',
    'npm run test',
    'vite build',
    'npx tsc --noEmit',
    'yarn workspace @acme/app exec eslint ./src',
    'cat x | vitest run',
    'git commit -m x',
    'curl http://x',
  ]) {
    assert.notEqual(probeDenyReason(blocked), null, `게이트/네트워크 명령을 통과시켰다: ${blocked}`);
  }
  console.log('✅ probe deny (경로의 vite.config.ts 는 허용 · 게이트 명령은 차단)');

  /* 0-2. JSONC 파서 — 예시 설정은 주석으로 설명한다. 문자열 안의 `//` 를 지우면 URL 이 잘린다. */
  const jsonc = stripJsonc(`{
    // 줄 전체 주석
    "a": "https://example.com/x", // 줄 끝 주석 — 위 URL 의 // 는 살아야 한다
    /* 블록
       주석 */
    "b": [1, 2,],
  }`);
  assert.deepEqual(JSON.parse(jsonc), { a: 'https://example.com/x', b: [1, 2] });
  console.log('✅ JSONC 파서 (URL 보존 · 블록 주석 · 후행 쉼표)');

  /* 0-3. s01 (d) 회귀 — 주석 속의 `manualChunks(` 를 코드로 오인해 파일을 잘라내면 안 된다.
        2026-09-04 실측: 머리말 주석에 이 이름이 등장하는 것만으로 `tsc TS1010` 이 났다. */
  const commentTrap = `/**
 * 이 주석은 일부러 manualChunks( 라는 글자를 담고 있다 — 코드가 아니다.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
`;
  const replacedInComment = replaceManualChunks(commentTrap, "manualChunks: { 'x': ['y'] }");
  assert.ok(!/TS1010|\*\/\s*'x'/.test(replacedInComment), '주석 속 manualChunks( 를 코드로 오인해 파일을 잘랐다');
  assert.ok(replacedInComment.includes("manualChunks: { 'x': ['y'] }"), '실제 함수형을 교체하지 못했다');
  assert.ok(/export default defineConfig/.test(replacedInComment), '주입 후 export default 가 사라졌다');
  assert.equal(
    (replacedInComment.match(/\*\//g) ?? []).length,
    (commentTrap.match(/\*\//g) ?? []).length,
    '블록 주석 종료가 사라지거나 늘었다 — 주석 밖 코드를 잘못 잘랐다는 신호다',
  );
  console.log('✅ s01 replaceManualChunks — 주석 속 동명 문자열을 코드로 오인하지 않는다');

  let brokenComment: unknown;
  try {
    replaceManualChunks('const manualChunks = 1; /* manualChunks( 는 여기도 있다 */', 'x');
    brokenComment = null;
  } catch (error) {
    brokenComment = error;
  }
  assert.ok(brokenComment instanceof Error, '진짜 함수형이 없는데도 던지지 않았다(자기검증 무력화)');
  console.log('✅ s01 replaceManualChunks — 코드 영역에 진짜 함수형이 없으면 조용히 넘어가지 않고 던진다');

  /* 0-4. s01 (c) 회귀 — object 형 청크 매핑은 은하의 실제 package.json 의존성만 써야 한다.
        예전엔 `@tanstack/react-query`·`echarts`·`echarts-for-react`·`axios`·`dayjs`·`classnames`
        가 문자열로 박혀 있었다 — 그 패키지가 없는 은하에서는 Vite 가
        `Could not resolve entry module` 로 boot build 를 죽였다(fixtures/README.md §5-c). */
  const FORBIDDEN_HARDCODED_VENDORS = ['@tanstack/react-query', 'echarts', 'echarts-for-react', 'axios', 'dayjs', 'classnames'];
  const tinyGalaxyIo = stubIo(async (relPath) => {
    assert.equal(relPath, 'package.json', '설정과 무관하게 항상 package.json 을 읽어야 한다');
    return JSON.stringify({ dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' } });
  });
  const objectFormForTinyGalaxy = await buildObjectFormFromDependencies(tinyGalaxyIo, DEFAULT_REACT_VITE_PATHS);
  for (const forbidden of FORBIDDEN_HARDCODED_VENDORS) {
    assert.ok(
      !objectFormForTinyGalaxy.includes(forbidden),
      `이 은하에 없는 패키지 '${forbidden}' 가 청크 매핑에 하드코딩돼 있다`,
    );
  }
  assert.ok(objectFormForTinyGalaxy.includes("'react'"), '실제로 있는 의존성(react)이 매핑에 없다');
  assert.ok(objectFormForTinyGalaxy.includes("'react-dom'"), '실제로 있는 의존성(react-dom)이 매핑에 없다');

  /* 다른 은하(가상)를 읽히면 매핑도 그 은하를 따라가야 한다 — 이름이 하드코딩돼 있지 않다는
     증거는 "저장소를 바꾸면 산출도 바뀐다" 는 사실 그 자체다. */
  const otherGalaxyIo = stubIo(async () => JSON.stringify({ dependencies: { vue: '^3.0.0', pinia: '^2.0.0' } }));
  const objectFormForOtherGalaxy = await buildObjectFormFromDependencies(otherGalaxyIo, DEFAULT_REACT_VITE_PATHS);
  assert.ok(objectFormForOtherGalaxy.includes("'vue'") && objectFormForOtherGalaxy.includes("'pinia'"), '다른 은하의 실제 의존성을 못 읽었다');
  assert.ok(!objectFormForOtherGalaxy.includes("'react'"), '있지도 않은 react 를 여전히 박아 넣는다 — 하드코딩이 남아 있다');
  console.log('✅ s01 buildObjectFormFromDependencies — 하드코딩 없이 은하가 가진 의존성만 쓴다');

  const noDepsIo = stubIo(async () => JSON.stringify({}));
  let noDepsError: unknown;
  try {
    await buildObjectFormFromDependencies(noDepsIo, DEFAULT_REACT_VITE_PATHS);
  } catch (error) {
    noDepsError = error;
  }
  assert.ok(noDepsError instanceof Error, 'package.json 에 의존성이 없는데도 조용히 빈 매핑을 만들었다');
  console.log('✅ s01 buildObjectFormFromDependencies — 의존성이 없으면 조용히 넘어가지 않고 던진다');

  const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'fe-harness-'));
  await fs.mkdir(path.join(dist, 'assets'), { recursive: true });
  await fs.writeFile(path.join(dist, 'index.html'), '<div id="root"></div><script src="/assets/app-AAAAAAAA.js"></script>');
  await fs.writeFile(path.join(dist, 'assets', 'app-AAAAAAAA.js'), 'console.log(1)');

  /* 1. 폴백 없는 형상에서 딥링크는 열리면 안 된다 */
  const naive = createDistribution({ originIsWebsiteEndpoint: false, defaultRootObject: 'index.html', customErrorResponses: [] });
  await naive.sync(dist, { deleteRemoved: true, cacheControl: 'no-cache', exclude: [] });
  assert.equal(naive.request('/brandmsg/manual-send').status, 403, '폴백 없이 딥링크가 열리면 안 된다');

  /* 2. 경로별 동작으로 고치면 딥링크는 살고 자산 404 는 그대로 실패해야 한다 */
  const fixed = createDistribution({
    originIsWebsiteEndpoint: false,
    defaultRootObject: 'index.html',
    customErrorResponses: [],
    behaviors: [
      { pathPattern: '/assets/*', customErrorResponses: [] },
      { pathPattern: '*', customErrorResponses: [{ from: 403, to: '/index.html', status: 200 }] },
    ],
  });
  await fixed.sync(dist, { deleteRemoved: true, cacheControl: 'no-cache', exclude: [] });
  assert.equal(fixed.request('/brandmsg/manual-send').status, 200, '폴백이 딥링크를 살려야 한다');
  assert.notEqual(fixed.request('/assets/missing.js').status, 200, '자산 404 를 가리면 안 된다');
  console.log('✅ CloudFront 시뮬레이터 (딥링크 200 · 자산 403 유지)');

  /* 3. 엣지 캐시 × `--delete` 창 재현 — 흰 화면의 정확한 기전 */
  const stale = createDistribution({ originIsWebsiteEndpoint: false, defaultRootObject: 'index.html', customErrorResponses: [] });
  await stale.sync(dist, { deleteRemoved: true, cacheControl: 'max-age=31536000', exclude: [] });
  stale.request('/index.html');
  await fs.rm(path.join(dist, 'assets', 'app-AAAAAAAA.js'));
  await fs.writeFile(path.join(dist, 'assets', 'app-BBBBBBBB.js'), 'console.log(2)');
  await fs.writeFile(path.join(dist, 'index.html'), '<div id="root"></div><script src="/assets/app-BBBBBBBB.js"></script>');
  await stale.sync(dist, { deleteRemoved: true, cacheControl: 'max-age=31536000', exclude: [] });

  const served = stale.request('/index.html');
  assert.ok(served.fromEdgeCache, '장기 캐시된 index 는 엣지에서 나와야 한다');
  assert.ok(served.body.includes('AAAAAAAA'), '낡은 index 가 그대로 나온다');
  assert.equal(stale.request('/assets/app-AAAAAAAA.js').status, 403, '--delete 가 지운 청크는 403 이다 (= 흰 화면)');
  console.log('✅ 낡은 index × --delete 흰 화면 재현');

  await fs.rm(dist, { recursive: true, force: true });

  /* 4. **하네스의 사적인 스키마가 현실의 표기를 조용히 버리지 않는가.**
   *
   * ⚠️ 실측으로 두 번 당했다. 진짜 에이전트가 —
   *   · `viewerRequestFunction` 에 **진짜 CloudFront Function 코드**를 썼고(현실에선 그게 맞다) 채점이 터졌다
   *   · `customErrorResponses` 를 **AWS 의 진짜 필드명**으로 썼고 조용히 버려졌다
   *   · 무효화 경로를 **진짜 `--paths`** 로 썼는데 우리는 `PATH_TO_INVALIDATE:` 만 봤다
   * 셋 다 「에이전트가 못 했다」로 궤적에 남았다. **reward 가 거짓말을 했다.**
   * ⛔ 이 결함은 **오라클로는 절대 안 보인다** — 오라클은 정답을 알고 있어 틀리게 쓸 일이 없다.
   */
  const box = await fs.mkdtemp(path.join(os.tmpdir(), 'schema-'));
  const cfPath = path.join(box, 'dev.json');

  await fs.writeFile(cfPath, JSON.stringify({ viewerRequestFunction: 'function handler(e){return e.request;}' }));
  const arbitrary = await loadCloudFrontConfig(cfPath);
  assert.ok(arbitrary.rejected, '임의 코드는 던지지 말고 **사유로** 나와야 한다');

  await fs.writeFile(cfPath, JSON.stringify({
    customErrorResponses: [{ errorCode: 404, responseCode: 200, responsePagePath: '/index.html' }],
  }));
  const awsNames = await loadCloudFrontConfig(cfPath);
  assert.equal(awsNames.customErrorResponses.length, 1, 'AWS 의 진짜 필드명도 읽어야 한다');
  assert.ok(!awsNames.rejected, '읽었으면 사유가 없어야 한다');

  await fs.writeFile(cfPath, JSON.stringify({ customErrorResponses: [{ 엉뚱: 1 }] }));
  const junk = await loadCloudFrontConfig(cfPath);
  assert.equal(junk.customErrorResponses.length, 0, '못 읽은 항목은 안 쓴다');
  assert.ok(junk.rejected, '못 읽었으면 **조용히 버리지 말고** 사유를 내야 한다');
  console.log('✅ CloudFront 형상 — 임의 코드·AWS 이름·엉뚱한 항목을 전부 말해 준다');

  const wfPath = path.join(box, 'deploy.yml');
  await fs.writeFile(wfPath, "run: aws s3 sync ./dist s3://b --delete --cache-control 'public, max-age=31536000'\n");
  const single = await readDeployIntent(wfPath);
  assert.equal(single.syncs[0]?.options.cacheControl, 'public, max-age=31536000', '작은따옴표도 읽어야 한다');

  await fs.writeFile(wfPath, 'run: aws cloudfront create-invalidation --distribution-id X --paths "/index.html"\n');
  const realCli = await readDeployIntent(wfPath);
  assert.deepEqual(realCli.invalidationPaths, ['/index.html'], '진짜 AWS 무효화 명령도 읽어야 한다');

  await fs.writeFile(wfPath, 'run: aws s3 sync ./dist gs://wrong-cloud --delete\n');
  const bad = await readDeployIntent(wfPath);
  assert.equal((bad.unreadable ?? []).length, 1, '못 읽은 줄은 **조용히 버리지 말고** 나와야 한다');
  console.log('✅ 배포 스텝 — 작은따옴표·진짜 무효화 명령·못 읽은 줄을 전부 말해 준다');

  await fs.rm(box, { recursive: true, force: true });


  /* 5·6. **스테이지 감사** — 코어의 것을 부른다.
   * ⚠️ 예전엔 이 두 검사를 이 파일에 직접 썼다. 플러그인마다 베끼면 **언젠가 어긋나고**,
   * 새 플러그인이 이 감사를 안 받는 것이 가장 흔한 어긋남이라 코어로 올렸다. */
  const stagePaths = DEFAULT_REACT_VITE_PATHS;
  const seedMinimalBuild = async (io: IStageIO): Promise<void> => {
    /* 재려는 것은 **파싱 자리 하나**다. 다른 전제가 없어서 터지면 그건 시험이 비현실적인 것이다. */
    await io.write(`${stagePaths.distDir}/index.html`, '<div id="root"></div><script src="/assets/app-AAAAAAAA.js"></script>');
    await io.write(`${stagePaths.distDir}/assets/app-AAAAAAAA.js`, 'console.log(1)');
    await io.write(`${stagePaths.storybookDistDir}/index.html`, '<div>demo</div>');
    /* ⛔ **씨앗이 얇으면 「못 쟀다」가 된다(R115).** 선언 안 한 스테이지는 소스를 읽는데
       씨앗은 빌드 산출물만 깔았다 — `io.read` 가 한 번도 성공 못 해 잴 것이 없었다.
       ⚠️ 여기 적는 것은 **최소한**이다. 스테이지가 새 파일을 읽기 시작하면 다시 「못 쟀다」가
       뜬다 — 그것이 **조용히 통과하는 것보다 낫다.** */
    await io.write(stagePaths.viteConfig, "export default { plugins: [] };\n");
    await io.write(stagePaths.appTsconfig, '{ "compilerOptions": { "paths": {} } }\n');
    await io.write('src/components/__harness__/CatalogRow.tsx', 'export const CatalogRow = () => <div />;\n');
    await io.write('src/components/__harness__/CatalogRow.test.tsx', "it('renders', () => {});\n");
  };

  const stages = createReactViteStages(stagePaths, { testFileCommand: 'true' });
  const declaredCount = stages.filter((stage) => (stage.parses ?? []).length > 0).length;
  assert.ok(declaredCount >= 2, `parses 를 선언한 스테이지가 ${declaredCount}개다 — s02·s03 은 선언해야 한다`);

  const garbage = await auditDeclaredParses(stages, seedMinimalBuild);
  assert.deepEqual(garbage, [], `선언한 파싱 자리가 쓰레기를 삼켰다:\n${garbage.map((f) => `  ${f.stage}: ${f.what}`).join('\n')}`);
  console.log(`✅ 선언한 파싱 자리 — 쓰레기를 넣으면 터지지 않고 빨간 신호를 낸다 (스테이지 ${declaredCount}개)`);

  /* ⛔ **선언 안 한 스테이지도 잰다**(R115) — ②는 이름에 기대므로, 행동으로 한 번 더 본다. */
  const undeclared = await auditUndeclaredParses(stages, seedMinimalBuild);
  assert.deepEqual(undeclared, [],
    `선언 안 한 스테이지가 쓰레기에 터졌다(또는 못 쟀다):\n${undeclared.map((f) => `  ${f.stage}: ${f.what}`).join('\n')}`);
  console.log(`✅ 선언 안 한 스테이지 — 읽는 자리마다 쓰레기를 넣어도 안 터진다`);

  const missing = await auditParsesDeclarations(path.join(path.dirname(fileURLToPath(import.meta.url)), 'stages'));
  assert.deepEqual(missing, [], `선언이 어긋났다:\n${missing.map((f) => `  ${f.stage}: ${f.what}`).join('\n')}`);
  console.log('✅ 선언 빠뜨림 — verify 의 스키마 파싱과 parses 선언이 일치한다');

  console.log('\n플러그인 전부 통과.');
};

void main();
