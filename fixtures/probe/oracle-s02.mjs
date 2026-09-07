/** s02 오라클 주행 — CloudFront 형상만 고쳐 완주한다. LLM 0회. */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(here, '../../observatory/engine/packages/@plugins/harness-react-vite/dist/index.js');
const { ReactViteHarness, loadProjectConfig } = await import(ENGINE);

const repoRoot = path.resolve(process.argv[2] ?? path.join(here, '..', 'tiny-galaxy'));
const project = await loadProjectConfig({ repoRoot });

/* 자산 경로에는 폴백을 주지 않고, 문서 경로에만 403 → index.html 200 을 준다.
   그래야 딥링크는 살고 **없는 자산은 여전히 실패한다**(가리지 않는다). */
const FIXED_CONFIG = {
  _comment: '딥링크 폴백은 문서 경로에만. /assets/* 는 404 를 404 로 둔다.',
  originIsWebsiteEndpoint: false,
  defaultRootObject: 'index.html',
  customErrorResponses: [],
  behaviors: [
    { pathPattern: '/assets/*', customErrorResponses: [] },
    { pathPattern: '*', customErrorResponses: [{ from: 403, to: '/index.html', status: 200 }] },
  ],
  viewerRequestFunction: 'appendIndexHtmlOnTrailingSlash',
};

const harness = new ReactViteHarness({
  repoRoot,
  paths: project.paths,
  commands: project.commands,
  lintTargets: project.lintTargets,
  testFileCommand: project.testFileCommand,
  contractPresets: project.contract.presets,
  contractStaticOnly: true,
});

await harness.reset('s02-spa-deeplink');
const patched = await harness.step({
  kind: 'patch',
  files: [{ path: 'infra/cloudfront/dev.json', content: `${JSON.stringify(FIXED_CONFIG, null, 2)}\n` }],
  note: '오라클 정답 주입',
});
console.log(`patch → ${patched.status}`);
const submitted = await harness.step({ kind: 'submit', note: '오라클 제출' });
console.log(`\n${submitted.status} · reward ${submitted.reward}`);
console.log(submitted.observation.text.split('\n').slice(0, 25).join('\n'));
await harness.close();
process.exitCode = submitted.status === 'SOLVED' ? 0 : 1;
