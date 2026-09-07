/** 결함을 **고치지 않은 채** 제출해 기준선을 잰다 — 채점 축이 무엇을 요구하는지 드러난다. LLM 0회. */
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
});

const observation = await harness.reset(stageId);
console.log('reset 신호:', JSON.stringify(observation.signals));
const submitted = await harness.step({ kind: 'submit', note: '기준선 — 아무것도 안 고치고 제출' });
console.log(`\n${submitted.status} · reward ${submitted.reward}`);
console.log(submitted.observation.text.split('\n').slice(0, 25).join('\n'));
await harness.close();
