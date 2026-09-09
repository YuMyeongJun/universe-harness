/** 스테이지의 `reset()`(결함 주입 + boot build)만 돌려 **재현 가능한가**를 잰다. LLM 호출 0회. */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(here, '../../observatory/engine/packages/@plugins/harness-react-vite/dist/index.js');

const { ReactViteHarness, loadProjectConfig } = await import(ENGINE);

const stageId = process.argv[2];
const repoRoot = path.resolve(process.argv[3] ?? path.join(here, '..', 'tiny-galaxy'));
const project = await loadProjectConfig({ repoRoot });

const harness = new ReactViteHarness({
  repoRoot,
  paths: project.paths,
  commands: project.commands,
  lintTargets: project.lintTargets,
  testFileCommand: project.testFileCommand,
  contractPresets: project.contract.presets,
  contractStaticOnly: true,
  keepSandbox: process.env.KEEP === "1",
});

try {
  const observation = await harness.reset(stageId);
  console.log(observation.text);
  console.log('\n신호:', JSON.stringify(observation.signals));
  /* ⚠️ 엔진은 boot build 가 빨간불이어도 reset 을 정상 반환한다.
     여기서만이라도 종료코드로 드러낸다 — 안 그러면 「재현 불가」가 조용히 성공처럼 보인다. */
  if (!observation.signals.every((signal) => signal.ok)) {
    console.log('⛔ boot build 가 빨간불이다 — 이 스테이지는 이 저장소에서 재현 불가다.');
    process.exitCode = 1;
  }
} catch (error) {
  console.log(`RESET 실패: ${String(error)}`);
  process.exitCode = 2;
} finally {
  await harness.close();
}
