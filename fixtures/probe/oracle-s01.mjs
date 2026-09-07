/**
 * s01 오라클 주행 — LLM 을 한 번도 부르지 않고 스테이지를 끝까지 돈다.
 *
 * 왜 필요한가: `harness.reset()` 이 결함을 심자마자 boot build 를 돌리는데, 예전에는
 * 여기서 `exit 1` 이 나서 스테이지 자체가 이 픽스처에서 "재현 불가"였다(엔진 쪽 결함 — 하드코딩된
 * `OBJECT_FORM` 이 이 은하에 없는 `@tanstack/react-query`·`echarts`·`axios`… 를 참조했다).
 * `s01-vite-monorepo-tangle.ts` 를 은하의 실제 `package.json` 을 읽어 청크 매핑을 만들도록 고친
 * 뒤에는 boot build 가 초록불이 된다 — 이 스크립트는 그 위에서 **양방향**을 증명한다:
 *   1) 결함 상태 그대로 제출하면 ❌ 두 개(청크 형태 · tsconfig 오염)가 뜬다(별도로 `baseline-submit.mjs` 가 잰다).
 *   2) 정답(원래 함수형 vite.config + 안 오염된 tsconfig)을 patch 로 넣고 제출하면 ✅ 전부 뜬다.
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

/* 결함 이전과 같은 함수형 — 픽스처의 원래 vite.config.ts 그대로. */
const FIXED_VITE_CONFIG = `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * 픽스처 은하의 Vite 설정.
 *
 * \`manualChunks\` 를 **함수형**으로 둔다 — s01 스테이지가 이 자리를 object 형으로 되돌려
 * 결함을 심는다.
 */
export default defineConfig({
  plugins: [react()],
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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
`;

/* 결함 이전과 같은 tsconfig — 공유 패키지 소스 별칭이 없다. */
const FIXED_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "vite.config.ts"]
}
`;

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
const observation = await harness.reset('s01-vite-monorepo-tangle');
console.log(`\n── reset (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log('신호:', JSON.stringify(observation.signals));
if (!observation.signals.every((signal) => signal.ok)) {
  console.log('⛔ boot build 가 빨간불이다 — s01 은 여전히 이 저장소에서 재현 불가다.');
  await harness.close();
  process.exit(2);
}

const patched = await harness.step({
  kind: 'patch',
  files: [
    { path: project.paths.viteConfig, content: FIXED_VITE_CONFIG },
    { path: project.paths.appTsconfig, content: FIXED_TSCONFIG },
  ],
  note: '오라클 정답 주입 — manualChunks 함수형 복원 + tsconfig 오염 제거',
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
