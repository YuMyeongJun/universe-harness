#!/usr/bin/env node
/**
 * **3차 팽창의 배선을 잰다 — 모델 호출 0회.**
 *
 * ⚠️⚠️ 왜 이것이 관문에 있는가: 3차는 **가장 비싼 갈래인데 가장 안 재지던 갈래**였다.
 * 실주행은 사람의 사용량을 쓰므로 관문에 못 넣고, 그래서 배선(요구사항 → patch → 관문 →
 * 게이트 → 판정 → 신호)이 **한 번도 자동으로 안 재졌다.** R08 이 적어 둔 자리다.
 * 대본(`--agent-script`)은 그 배선을 **모델 없이** 그대로 지나간다 — 공짜라서 관문에 둔다.
 *
 * ⛔ 이것은 관문의 우회로가 **아니다.** 대본의 patch 도 `parseAction` → 범위 관문 →
 *    엔진 관문 → 파일 순서를 똑같이 지난다. 대본이 바꾸는 것은 **누가 말하는가**뿐이다.
 *
 * 재는 것 다섯(하나라도 조용하면 빨간불):
 *   ① 범위 관문이 **별의 폴더 밖**을 막는가        — 대본 2턴이 일부러 `src/main.tsx` 를 쓴다
 *   ② 게이트가 **실제로 도는가**                    — lint·build·test·typecheck 신호가 찍히는가
 *   ③ 요구사항 신호가 **성공 출구에서** 찍히는가    — R132 가 남긴 자리(초록이면 앞에서 return 한다)
 *   ④ **빈 계약을 거부하는가**                      — 처음부터 통과하는 계약은 아무것도 안 잰다
 *   ⑤ **받은 계약을 못 고치게 막는가**              — 자기 채점을 막는 자리(R156 · R23)
 *
 * ⚠️ ④⑤ 가 이 관문에서 가장 값지다. 그 둘이 죽으면 「요구사항 충족을 잰다」가 **거짓이 된다** —
 *    에이전트가 통과하기 쉬운 계약을 쓰거나, 쓴 뒤 느슨하게 고쳐 버린다.
 *
 * ⛔ 별을 반드시 치운다. 성공하면 별이 **남기 때문에**(그것이 3차의 정상 동작이다)
 *    치우지 않으면 이 관문이 픽스처를 더럽히고, 다음 실행은 「이미 있다」로 막힌다.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { requireUniverseHome } from '../lib/home.mjs';

const root = await requireUniverseHome();
const STAR = 'NebulaProbe';
const STAR_DIR = path.join(root, 'fixtures/tiny-galaxy/src/components/shop', STAR);
const SCRIPT = 'fixtures/agent-scripts/sold-out-badge.jsonl';
const REQUIREMENT = '품절인 메뉴에는 품절 배지를 보여 주고 선택할 수 없게 한다';

const run = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.stderr.on('data', (c) => { out += c.toString(); });
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });

/* ⛔ 들어가기 전에 치운다 — 앞 실행이 끊겼으면 별이 남아 「이미 있다」로 막힌다. */
await fs.rm(STAR_DIR, { recursive: true, force: true });

console.log('── 3차 배선 관문 — 대본으로 돈다(모델 호출 0회)');
const result = await run([
  'bigbang/bigbang.mjs', 'new', 'tiny-galaxy', 'shop', STAR,
  '--from', REQUIREMENT,
  '--agent-script', SCRIPT,
]);

/* ⛔ 판정 뒤에 치운다 — 실패해도 픽스처를 더럽힌 채로 나가지 않는다. */
await fs.rm(STAR_DIR, { recursive: true, force: true });

/* ── ④⑤ 계약 우선 — 대본으로 두 갈래를 태운다(모델 0회) ─────── */

const contractRun = async (star, script, extra = []) => {
  const dir = path.join(root, 'fixtures/tiny-galaxy/src/components/shop', star);
  await fs.rm(dir, { recursive: true, force: true });
  const out = await run([
    'bigbang/bigbang.mjs', 'new', 'tiny-galaxy', 'shop', star,
    '--from', '소진 배지를 띄운다', '--contract-first', '--lane', 'script',
    '--agent-script', script, '--max-turns', '3', ...extra,
  ]);
  await fs.rm(dir, { recursive: true, force: true });
  return out;
};

const vacuous = await contractRun('VacuousProbe', 'fixtures/agent-scripts/vacuous-contract.jsonl');
const loosen = await contractRun('LoosenProbe', 'fixtures/agent-scripts/loosen-contract.jsonl');

const checks = [
  {
    label: '① 범위 관문이 별의 폴더 밖을 막는다',
    ok: /\[bigbang\/star-scope\]/.test(result.out) && /별의 폴더\(.*\) 밖이다/.test(result.out),
    why: '대본 2턴이 `src/main.tsx` 를 쓰는데 반려 사유가 안 보인다 — 범위 관문이 죽었다',
  },
  {
    label: '② 게이트가 실제로 돈다',
    /* ⛔ `[SOLVED]` 만 보면 안 된다 — 게이트가 한 칸도 안 돌아도 그 줄은 나올 수 있다.
       **축의 이름이 찍혔는가**로 잰다(R146 이 「안 돈 축은 화면에서 사라진다」를 고친 뒤라 셀 수 있다). */
    ok: ['lint', 'build', 'test', 'typecheck'].every((name) => new RegExp(`[✅❌⚪] ${name}\\b`).test(result.out)),
    why: '게이트 축 넷(lint·build·test·typecheck) 중 화면에 안 나온 것이 있다',
  },
  {
    label: '③ 요구사항 신호가 성공 출구에서 찍힌다',
    /* 별이 게이트를 지난 **그 주행에서** 신호가 나와야 한다 — R132 의 자리. */
    ok: /별이 게이트를 지난다/.test(result.out) && /요구사항의 알맹이|요구사항 미충족 흔적이 없다|알맹이가 전부/.test(result.out),
    why: '성공 출구에서 요구사항 신호가 안 찍혔다 — 초록이면 그 앞에서 return 하던 결함(R132)이 돌아왔다',
  },
  {
    label: '④ 빈 계약을 거부한다',
    /**
     * ⛔ 구현이 하나도 없는데 초록인 계약은 **요구사항을 안 잰 것**이다. 받아 주면 자기 채점이 열린다.
     *
     * ⚠️⚠️ 처음엔 `/아무것도 재지 않는다/` 로 짰는데 **안 물었다** — 그 말은 브리핑의
     * **안내 문구**에도 있어서, 거부를 껐는데도 화면에 남아 있었다. **검사가 죽어 있었던 것이다.**
     * 변이를 걸어 보고서야 알았다(「초록불을 증거로 삼지 마라」). ⇒ **거부할 때만 나오는 말**을 본다.
     */
    ok: /처음부터 통과한다/.test(vacuous.out),
    why: '처음부터 통과하는 계약을 받아 줬다 — 「충족을 잰다」가 거짓이 된다',
  },
  {
    label: '⑤ 받은 계약을 못 고치게 막는다',
    /* ⛔ 빨간 계약을 받고 나서 **느슨하게 고치면** 관문이 막아야 한다 — 안 막으면 증거 인멸이다. */
    ok: /계약이 빨간불이다/.test(loosen.out) && /bigbang\/behavior-contract/.test(loosen.out),
    why: '계약을 받은 뒤 에이전트가 그것을 고칠 수 있다 — 자기 채점을 그대로 허용한다',
  },
];

let red = 0;
for (const check of checks) {
  console.log(`   ${check.ok ? '✅' : '❌'} ${check.label}`);
  if (!check.ok) {
    console.log(`      ${check.why}`);
    red += 1;
  }
}
if (result.code !== 0) {
  console.log(`   ❌ 대본 주행이 exit ${result.code} 로 끝났다 — 배선이 초록이어야 이 관문이 뜻이 있다`);
  red += 1;
}

const left = await fs.readdir(STAR_DIR).catch(() => null);
if (left !== null) {
  console.log('   ❌ 별을 못 치웠다 — 이 관문이 픽스처를 더럽힌다');
  red += 1;
}

if (red > 0) {
  console.log(`\n⛔ 3차 배선 관문 — 빨간불 ${red}개.`);
  console.log('   직접 보려면:');
  console.log(`     node bigbang/bigbang.mjs new tiny-galaxy shop ${STAR} --from "${REQUIREMENT}" --agent-script ${SCRIPT}`);
  process.exit(1);
}
console.log('\n✅ 3차 배선 다섯이 전부 살아 있다 (모델 호출 0회 · 별은 치웠다).');
