#!/usr/bin/env node
/**
 * **흡수한 TC 도구의 시험을 돌린다** — `qa/` 는 `qa-harness` 에서 가져온 것이다.
 *
 * ## ⛔ 왜 있는가 — 시험 239개를 아무도 안 돌리고 있었다
 *
 * 흡수하면서 `qa/tests/` 10벌이 같이 왔는데 **관문에도 CI 에도 안 넣었다.** 그래서
 * 흡수 시점부터 **빨간 시험 하나가 조용히 숨어 있었다** — 옛 저장소 이름이 박혀 있어서
 * (`expect(coordinate?.repo).toBe('qa-harness')`) origin 이 바뀌자 깨진 것이다.
 * 자식 에이전트가 다른 일을 하다 `npm test` 를 돌려서야 드러났다.
 *
 * ⚠️ **「옮겨지지 않은 방어」와 같은 종류다**(R162 에서 `.gitignore` 가 그랬다):
 * **옮겨 온 파일은 세어서 확인하는데, 옮겨 온 것을 「누가 돌리는가」는 아무도 안 센다.**
 *
 * ## ⛔ 왜 `lib/gates.mjs` 에 `npm` 을 직접 못 적는가
 *
 * 관문 틀은 **`.sh` 면 bash, 아니면 node** 둘뿐이다. `runner: 'npm'` 같은 칸을 지어내면
 * 틀이 그걸 모르고 **조용히 node 로 돌려서 안 돈다** — 관문이 도는 척만 하게 된다.
 * ⇒ 틀을 바꾸지 않고 **틀이 아는 모양**(node 진입점)으로 맞춘다.
 *
 * ## 못 잡는 것 (§8 — 적어 둔다)
 *   · `qa/node_modules` 가 없으면 **못 잰다**(⚪). 시험이 통과했다는 뜻이 아니다.
 *
 * 재는 법: `node observatory/verify-qa.mjs`
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';

rejectUnknownFlags(process.argv.slice(2), ['--universe'], 'universe qa');

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const QA = path.join(ROOT, 'qa');

console.log('── TC 도구 시험 — 흡수한 `qa/` 의 시험을 돌린다');

if (!existsSync(path.join(QA, 'package.json'))) {
  console.log('\n⏭  `qa/` 가 없다 — 배달본이다. 못 쟀다.');
  process.exit(0);
}
/* ⛔ 의존성이 없으면 **못 쟀다**이지 통과가 아니다(§8). 0은 무죄가 아니다. */
if (!existsSync(path.join(QA, 'node_modules'))) {
  console.log('\n⚠️ **못 쟀다** — `qa/node_modules` 가 없다. `npm --prefix qa install` 을 먼저 돌려라.');
  console.log('   ⛔ 이것은 「시험이 통과했다」가 아니다.');
  process.exit(EXIT_UNMEASURED);
}

const child = spawn('npm', ['--prefix', QA, 'test'], { stdio: 'inherit', cwd: ROOT });
child.on('close', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(`\n⚠️ **못 쟀다** — npm 을 못 불렀다: ${error.message}`);
  process.exit(EXIT_UNMEASURED);
});
