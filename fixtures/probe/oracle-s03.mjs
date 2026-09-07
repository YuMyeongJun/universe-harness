/**
 * s03 오라클 주행 — LLM 을 한 번도 부르지 않고 스테이지를 끝까지 돈다.
 *
 * 왜 필요한가: 예전에는 `setup()` 이 CloudFront 형상만 심고 배포 워크플로
 * (`.github/workflows/deploy.yml`) 는 심지 않아서, 이 파일이 없는 저장소(이 픽스처)에서
 * `verify()` 의 `readDeployIntent()` 가 **catch 없이 ENOENT** 를 던졌다 — 프로세스가 죽고
 * 에피소드·궤적이 통째로 날아갔다. `s03-cache-invalidation.ts` 를 고쳐 스테이지가 브리핑에
 * 적은 그 결함 스텝을 **스스로 심게** 만든 뒤에는 크래시 없이 채점이 선다. 이 스크립트는 그
 * 위에서 **양방향**을 증명한다:
 *   1) 결함 상태 그대로 제출하면 ❌ 여러 개가 뜬다(`baseline-submit.mjs` 가 잰다).
 *   2) 정답(해시 자산 vs index.html 캐시 수명을 가른 워크플로 + assets 마스킹 없는 형상)을
 *      patch 로 넣고 제출하면 ✅ 전부 뜬다.
 *
 * ⛔ 이 스크립트는 `callClaude`/`runEpisode` 를 전혀 부르지 않는다 — `harness.step()` 을 직접
 *    부르는 것뿐이다. `contractStaticOnly: true` 로 관문 LLM 레인도 끈다. LLM 호출 0회.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(here, '../../observatory/engine/packages/@plugins/harness-react-vite/dist/index.js');
const REPO_ROOT = path.resolve(process.argv[2] ?? path.join(here, '..', 'tiny-galaxy'));

const { ReactViteHarness, loadProjectConfig } = await import(ENGINE);

/* 해시 자산(assets/*)은 index.html 을 뺀 나머지를 장기·불변 캐시로, index.html 은 별도
   sync 로 no-cache 로 올린다. 둘 다 `--delete` 를 쓰지 않는다 — 해시 자산은 이름이 바뀌므로
   지우지 않아도 안전하고(정리는 배포 밖의 수명주기 정책 몫), 지우지 않으면애초에
   "낡은 index 가 지워진 청크를 가리키는 창"이 열리지 않는다. 무효화도 index.html 하나로 좁힌다. */
const FIXED_WORKFLOW = `name: deploy

on:
  push:
    tags:
      - 'prod-*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: sync hashed assets (long cache, never deleted at deploy time)
        run: aws s3 sync ./dist s3://tiny-galaxy-bucket --exclude "index.html" --cache-control "public, max-age=31536000, immutable"
      - name: sync index.html (no-cache — always revalidated)
        run: aws s3 sync ./dist s3://tiny-galaxy-bucket --exclude "assets/*" --cache-control "no-cache"
        env:
          PATH_TO_INVALIDATE: /index.html
`;

/* 딥링크 폴백은 문서 경로에만 준다 — /assets/* 는 404 를 404 로 둔다(가리지 않는다). */
const FIXED_CLOUDFRONT_CONFIG = {
  _comment: '해시 자산 경로는 폴백에서 뺀다. index.html 만 SPA 딥링크 폴백을 받는다.',
  originIsWebsiteEndpoint: false,
  defaultRootObject: 'index.html',
  customErrorResponses: [],
  behaviors: [
    { pathPattern: '/assets/*', customErrorResponses: [] },
    { pathPattern: '*', customErrorResponses: [{ from: 403, to: '/index.html', status: 200 }] },
  ],
  viewerRequestFunction: 'none',
};

const project = await loadProjectConfig({ repoRoot: REPO_ROOT });
console.log(`설정: ${project.configPath}`);

const harness = new ReactViteHarness({
  repoRoot: REPO_ROOT,
  paths: project.paths,
  commands: project.commands,
  lintTargets: project.lintTargets,
  testFileCommand: project.testFileCommand,
  contractPresets: project.contract.presets,
  contractStaticOnly: true, // ⛔ LLM 판정 레인 끔 — 이 주행은 0회 호출이어야 한다.
});

const started = Date.now();
const observation = await harness.reset('s03-cache-invalidation');
console.log(`\n── reset (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log('신호:', JSON.stringify(observation.signals));
if (!observation.signals.every((signal) => signal.ok)) {
  console.log('⛔ boot build 가 빨간불이다 — s03 은 여전히 이 저장소에서 재현 불가다.');
  await harness.close();
  process.exit(2);
}

const prodConfigPath = `infra/cloudfront/prod.json`;
const patched = await harness.step({
  kind: 'patch',
  files: [
    { path: project.paths.deployWorkflow, content: FIXED_WORKFLOW },
    { path: prodConfigPath, content: `${JSON.stringify(FIXED_CLOUDFRONT_CONFIG, null, 2)}\n` },
  ],
  note: '오라클 정답 주입 — 해시자산/인덱스 캐시 분리 · --delete 제거 · 무효화 범위 축소 · 자산 마스킹 제거',
});
console.log(`\n── patch → ${patched.status}`);
if (patched.verdict?.feedback) {
  console.log(patched.verdict.feedback);
}

const submitted = await harness.step({ kind: 'submit', note: '오라클 제출' });
console.log(`\n── submit → ${submitted.status} · reward ${submitted.reward}`);
console.log(submitted.observation.text);

await harness.close();
console.log(`\n총 ${((Date.now() - started) / 1000).toFixed(1)}s · 궤적 ${harness.trajectoryPath}`);
process.exitCode = submitted.status === 'SOLVED' ? 0 : 1;
