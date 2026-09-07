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

/**
 * ⛔⛔ **비켜선 시험은 종료코드에 안 나온다 — 수로 봐야 한다.**
 *
 * 예전엔 이 관문이 vitest 의 **종료코드만 날랐다.** 그런데 `it.skip` 이 늘어도 exit 0 이라
 * 「243 통과」와 「240 통과 · 3 건너뜀」이 **같은 초록**으로 읽힌다.
 * ⚠️ 옆 저장소 세션이 자기 게이트에서 정확히 그 사고를 겪었다: 빌드 산출물이 없어 3건이
 * 매번 조용히 비켜서고 있었는데, **여러 회전을 같은 초록으로 읽어** 오늘에서야 알았다.
 * ⇒ **비켜섬은 통과가 아니다**(§8). 세어서 말하고, 있으면 ⚪ 로 갈린다.
 *
 * 그리고 **덜 걷힌 것**도 잰다: 시험 파일이 collect 에서 빠지면 남은 것만 돌고 초록이다.
 * ⛔ 여기에 기대 개수를 **적지 않는다** — `git` 이 아는 시험 파일 수와 **대조**한다(§9).
 */
const tracked = await new Promise((done) => {
  const git = spawn('git', ['ls-files', 'qa/tests', 'qa/e2e'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  git.stdout.on('data', (d) => { out += d; });
  git.on('close', (code) => done(code === 0
    ? out.split('\n').filter((f) => /\.(test|spec)\.[cm]?tsx?$/.test(f) && !f.includes('/e2e/')).length
    : null));
  git.on('error', () => done(null));
});

const child = spawn('npm', ['--prefix', QA, 'test'], { stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
let output = '';
child.stdout.on('data', (d) => { output += d; process.stdout.write(d); });
child.stderr.on('data', (d) => { output += d; process.stderr.write(d); });

child.on('close', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }
  /* ⛔ **요약을 못 읽으면 통과가 아니다**(§8) — 리포터가 바뀌면 이 관문은 눈이 먼다. */
  const files = /Test Files\s+(.+)/.exec(output)?.[1]?.trim();
  const tests = /\bTests\s+(.+)/.exec(output)?.[1]?.trim();
  if (!files || !tests) {
    console.error('\n⚠️ **못 쟀다** — vitest 요약을 못 읽었다(리포터가 바뀌었나).');
    console.error('   ⛔ 이것은 「시험이 통과했다」가 아니다.');
    process.exit(EXIT_UNMEASURED);
  }
  console.log(`\n   시험 파일 ${files} · 시험 ${tests}`);

  const skipped = Number(/(\d+)\s+skipped/.exec(`${files} ${tests}`)?.[1] ?? 0);
  if (skipped > 0) {
    console.error(`\n⚪ **비켜선 시험 ${skipped}건** — 이것은 통과가 아니다(§8).`);
    console.error('   종료코드는 0 이라 초록으로 읽힌다. 그래서 여기서 갈라 말한다.');
    console.error('   → 왜 비켜서는지 보라. **고칠 수 있는 이유(빌드가 없다 · 산출물이 없다)면**');
    console.error('     그건 정직이 아니라 **안 재는 핑계**다 — 먼저 짓고 다시 돌려라.');
    process.exit(EXIT_UNMEASURED);
  }

  const collected = Number(/\((\d+)\)/.exec(files)?.[1] ?? 0);
  if (tracked === null) {
    console.log('   ⚠️ git 에게 **못 물었다** — 시험 파일이 덜 걷혔는지는 못 쟀다(§8).');
  } else if (collected < tracked) {
    console.error(`\n⛔ 시험 파일이 **덜 걷혔다** — git 이 아는 것 ${tracked}개 중 ${collected}개만 돌았다.`);
    console.error('   남은 것만 돌고 초록이 나오는 자리다. 안 걷힌 파일이 무엇인지 보라.');
    process.exit(1);
  }
  process.exit(0);
});
child.on('error', (error) => {
  console.error(`\n⚠️ **못 쟀다** — npm 을 못 불렀다: ${error.message}`);
  process.exit(EXIT_UNMEASURED);
});
