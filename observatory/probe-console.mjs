#!/usr/bin/env node
/**
 * **콘솔이 서는가** — 사람의 계획이 전부 지나가는 화면인데, **아무 관문도 띄워 본 적이 없었다.**
 *
 * ## 왜 이것이 필요한가
 *
 * 이 콘솔은 다른 저장소에서 **흡수돼 왔다.** 그때 시험 239개가 같이 왔는데 **아무도 안 돌려서**
 * 빨간 것이 섞여 있었다(R157 계열). 지금 `app/universe` 에는 **시험이 하나도 없다** —
 * 서버가 뜨는지조차 아무도 안 쟀다. ⛔ 「코드가 있다」와 「그것이 도는가」는 다른 사실이다.
 *
 * ## 무엇을 재는가 — 둘뿐이다
 *
 *  1. **뜨고 답하는가.** `/api/galaxies` 가 200 을 주고, 그 목록이 `universe.config.json` 의
 *     등재 목록과 **같은가**. ⛔ 여기 은하 이름을 적지 않는다(§9) — 설정에서 읽어 대조한다.
 *  2. ⛔⛔ **못 찾았을 때 빈 목록을 주지 않는가.** 지식 저장소를 없는 곳으로 가리키고
 *     물어본다. 「도메인 0개」로 답하면 그것이 이 저장소가 가장 싫어하는 사고다 —
 *     **안 잰 것이 「없다」로 세어지는** 자리(§8). 「못 찾았다」고 말해야 한다.
 *
 * ## ⚠️ 안 재는 것 (적어 둔다)
 *
 *  · 화면(React)은 **안 띄운다.** 브라우저가 필요하고, 그 축은 `commands.e2e` 의 몫이다.
 *  · 판정 저장(`/api/runs/**`)은 **여기서 안 잰다** — 그건 `qa` 의 계약이 이미 잰다.
 *
 * 재는 법: `node observatory/probe-console.mjs`
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawn } from 'node:child_process';
import { readFile, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

import { EXIT_UNMEASURED } from '../lib/gates.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';

rejectUnknownFlags(process.argv.slice(2), ['--universe'], 'universe console');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app/universe');
const ENTRY = path.join(APP, 'dist/index.js');

console.log('── 콘솔이 서는가');

/** ⛔ 못 쟀으면 통과가 아니다 — 왜 못 쟀는지 말하고 3 으로 나간다. */
const unmeasured = (why, how) => {
  console.log(`\n⚪ **못 쟀다** — ${why}`);
  console.log(`   ${how}`);
  process.exit(EXIT_UNMEASURED);
};

if (!(await stat(path.join(APP, 'server/src')).catch(() => null))) {
  unmeasured('콘솔 소스가 없다 — 배달본이다.', '우주 저장소에서 돌려라.');
}
if (!(await stat(path.join(APP, 'node_modules')).catch(() => null))) {
  unmeasured('콘솔의 의존성이 안 깔려 있다.', 'cd app/universe && npm install');
}

/**
 * ⛔⛔ **낡은 빌드를 재고 초록이라 하지 않는다 — 그래서 낡았으면 다시 짓는다.**
 *
 * 엔진에서 같은 병을 겪었다: dist 가 소스보다 오래됐는데 관측이 **옛 규칙으로 초록불**을 냈다.
 * ⚠️ 처음엔 「낡았으면 ⚪ 로 갈린다」로 했는데, 그러면 **소스를 고치는 변이가 판정을 못 바꾼다** —
 *    변이 틀이 소스를 바꿔도 탐침은 옛 dist 를 보거나 ⚪ 로 비켜선다.
 * ⇒ **다시 짓고 잰다.** 「지금 소스가 도는가」가 재려던 것이지 「누가 지었나」가 아니다.
 *    ⛔ 못 지으면 그건 ⚪ 가 아니라 **❌** 다 — 콘솔이 컴파일이 안 되는 것이다.
 */
const newest = async (dir) => {
  let latest = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    /* eslint-disable-next-line no-await-in-loop */
    const when = entry.isDirectory() ? await newest(full) : (await stat(full)).mtimeMs;
    latest = Math.max(latest, when);
  }
  return latest;
};
const built = (await stat(ENTRY).catch(() => null))?.mtimeMs ?? 0;
if (await newest(path.join(APP, 'server/src')) > built) {
  console.log('  ⓘ 빌드가 소스보다 낡았다 — 다시 짓는다(옛 서버를 재면 초록불이 거짓말이 된다).');
  const build = spawn('npm', ['run', 'build:server'], { cwd: APP, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  build.stdout.on('data', (d) => { out += d; });
  build.stderr.on('data', (d) => { out += d; });
  const code = await new Promise((done) => { build.on('close', done); });
  if (code !== 0) {
    console.error('\n⛔ 콘솔 서버가 **컴파일되지 않는다.**');
    console.error(out.split('\n').slice(-12).map((l) => `   ${l}`).join('\n'));
    process.exit(1);
  }
}

/** 아무도 안 쓰는 포트. ⛔ 기본 포트(8788)를 쓰면 사람이 켜 둔 콘솔을 죽인다. */
const PORT = 8797;
const registered = JSON.parse(await readFile(path.join(ROOT, 'universe.config.json'), 'utf8')).galaxies ?? [];

const server = spawn(process.execPath, [ENTRY], {
  cwd: APP,
  /* ⚠️ 지식 저장소를 **없는 곳**으로 가리킨다 — 둘째 시험이 그것을 잰다. 그리고 이렇게 하면
     형제 저장소가 있든 없든 **어느 기계에서나 같은 답**이 나온다(실측이 기계에 안 매인다). */
  env: { ...process.env, PORT: String(PORT), QA_WORKFLOW_DIR: path.join(APP, '.data/없는-지식저장소') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });

const stop = () => { server.kill('SIGTERM'); };
process.on('exit', stop);

/** 뜰 때까지 기다린다 — 고정 대기는 느린 기계에서 깜빡인다. */
const get = async (route) => {
  for (let tries = 0; tries < 40; tries += 1) {
    try {
      /* eslint-disable-next-line no-await-in-loop */
      const res = await fetch(`http://127.0.0.1:${PORT}${route}`);
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch {
      /* eslint-disable-next-line no-await-in-loop, no-promise-executor-return */
      await new Promise((r) => { setTimeout(r, 250); });
    }
  }
  return null;
};

const galaxies = await get('/api/galaxies');
if (galaxies === null) {
  stop();
  console.error('\n⛔ 콘솔이 **뜨지 않는다** — 10초를 기다려도 답이 없다.');
  console.error(log.split('\n').slice(-8).map((l) => `   ${l}`).join('\n'));
  process.exit(1);
}

let failed = false;
if (galaxies.status !== 200) {
  console.error(`  ⛔ /api/galaxies 가 ${galaxies.status} 로 답한다`);
  failed = true;
} else {
  const said = galaxies.body?.registered ?? [];
  /* ⛔ 은하 이름을 여기 적지 않는다 — 설정과 **대조**한다(§9). 손 목록은 낡는다. */
  const same = said.length === registered.length && said.every((n, i) => n === registered[i]);
  if (!same) {
    console.error(`  ⛔ 콘솔이 말하는 등재 목록이 \`universe.config.json\` 과 다르다`);
    console.error(`     설정: ${registered.join(' · ') || '(없음)'}`);
    console.error(`     콘솔: ${said.join(' · ') || '(없음)'}`);
    failed = true;
  } else {
    console.log(`  ✅ 뜨고 답한다 — 등재 은하 ${said.length}개가 설정과 같다`);
  }
}

/**
 * ⛔⛔ **못 찾았을 때 「0개」라고 답하면 그것이 사고다.**
 * 빈 목록은 「도메인이 없다」로 읽히고, 그건 「못 읽었다」와 다른 말이다.
 */
const health = await get('/api/health');
const text = JSON.stringify(health?.body ?? {});
if (health === null) {
  console.error('  ⛔ /api/health 가 답하지 않는다');
  failed = true;
} else if (/"ok"\s*:\s*true/.test(text)) {
  console.error('  ⛔ 지식 저장소가 **없는데 「ok」라고 답한다** — 안 잰 것이 통과로 세어진다(§8)');
  console.error(`     ${text.slice(0, 200)}`);
  failed = true;
} else if (!/없는-지식저장소/.test(text)) {
  console.error('  ⛔ 못 찾았다고는 하는데 **어디를 봤는지 안 말한다** — 사람이 고칠 수가 없다');
  console.error(`     ${text.slice(0, 200)}`);
  failed = true;
} else {
  console.log('  ✅ 지식 저장소를 못 찾으면 **못 찾았다고 말한다** (빈 목록으로 삼키지 않는다)');
}

/**
 * ⛔⛔ **사람의 판정이 화면 밖으로 나가는가** — 이게 없으면 고리가 **끝날 수 없다**.
 *
 * 실측(R163): `universe loop` 는 「이 은하는 끝났는가」를 재는데, 그 답의 재료인 **판정은
 * 콘솔 안에만** 있었다. 사람이 판정을 다 붙여도 CLI 는 늘 「판단하지 않은 fail」이라 말했다.
 * ⇒ 판정을 적을 때 **붙인 주행을 `judged.json` 으로도 쓴다.** 여기서 그 파일이 실제로
 *   생기는지 본다 — ⛔ 화면 문구가 아니라 **파일이 있는가**가 판정이다.
 */
/**
 * ⛔⛔ **묵은 산출을 근거라 부르지 않는다.** 처음엔 저장된 주행 폴더에 `judged.json` 이
 * **있는지**만 봤는데, 예전 주행이 남아 있어 **배선을 끊어도 통과했다**(변이가 「놓쳤다」로 알려 줬다).
 * ⇒ **지금 만들어서** 잰다: 작은 주행을 저장하고 · 판정을 붙이고 · 그 파일이 생겼는지 본다.
 * ⛔ 판정을 여기서 만들지 않는다 — 콘솔의 것을 부른다. 두 자리에서 만들면 갈린다.
 */
const RUN = {
  preconditions: [{ id: 'probe', ok: true, detail: '탐침이 만든 주행이다' }],
  cases: [{ id: 'TC-PROBE', origin: 'human', status: 'failed', attribution: 'star', verdict: null }],
};
const storeMod = await import(pathToFileURL(path.join(APP, 'dist/run-store.js')).href).catch(() => null);
const resultMod = await import(pathToFileURL(path.join(APP, 'dist/run-result.js')).href).catch(() => null);
if (storeMod === null || resultMod === null) {
  console.log('  ⏭  판정이 밖으로 나가는가 — 콘솔이 안 지어져 있다. 못 쟀다(§8).');
} else {
  const raw = JSON.stringify(RUN);
  const receipt = await resultMod.receiveRunResult(raw, { from: 'contract' });
  const meta = storeMod.saveRun(raw, receipt, { from: '탐침' });
  const wrote = await storeMod.recordVerdict(meta.id, 'TC-PROBE',
    { kind: 'fixed', why: '탐침이 붙인 판정이다 — 배선이 살아 있는지만 잰다' }, { by: 'probe-console' });
  const at = path.join(APP, '.data/run-judgments', meta.id, 'judged.json');
  const made = Boolean(await stat(at).catch(() => null));
  /* ⛔ 흔적을 남기지 않는다 — 저장소의 `.data/` 는 사람이 보는 자리다. */
  await rm(path.join(APP, '.data/run-judgments', meta.id), { recursive: true, force: true });
  if (!wrote.ok) {
    console.error(`  ⛔ 판정을 못 붙였다: ${wrote.kind} — ${wrote.why ?? ''}`);
    failed = true;
  } else if (!made) {
    console.error('  ⛔ 판정을 붙였는데 **붙인 주행 파일이 안 생겼다**');
    console.error('     사람이 판정을 붙여도 `universe loop` 가 못 읽는다 — 고리가 **끝날 수 없다**.');
    failed = true;
  } else {
    console.log('  ✅ 판정이 파일로도 나간다 (지금 붙여서 확인했다 — 묵은 파일이 아니다)');
  }
}

stop();
if (failed) {
  console.error('\n⛔ 콘솔이 사람의 계획이 지나가는 자리인데 그 자리가 거짓말을 한다.');
  process.exit(1);
}
console.log('\n✅ 콘솔이 서고, 못 찾은 것을 못 찾았다고 말한다.');
