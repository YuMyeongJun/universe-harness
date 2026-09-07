#!/usr/bin/env node
/**
 * `universe check` — **라운드를 열지 않고 관문 전체를 돌린다.**
 *
 * ⚠️ 왜 있는가: 관문 목록이 `round close` 안에만 있어서 **소비 저장소는 전부 돌릴 방법이 없었다**
 * — 거기엔 라운드가 없다(실측 R58). 목록은 `lib/gates.mjs` 한 자리에 있고 둘이 그것을 읽는다.
 *
 * ⛔ **없는 검사는 건너뛰고 그렇게 말한다.** 소비 저장소에는 엔진이 배달되지 않으므로
 * 엔진이 필요한 검사가 없다. 없는 것을 실패로 세면 관문이 늘 빨갛고,
 * 조용히 빼면 「몇 개가 돌았는지」를 속인다 — 관측 법칙 §8.
 */
import { spawn } from 'node:child_process';
import { stat, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { EXIT_UNMEASURED, GATES } from '../lib/gates.mjs';
import { whyItFailed } from '../lib/why.mjs';
import { DELIVERED, isJunk } from '../lib/delivered.mjs';
import { packageHome } from '../lib/home.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe'], 'universe check');
const root = await requireUniverseHome(argv.includes('--universe') ? argv[argv.indexOf('--universe') + 1] : undefined);

/**
 * ⛔ **어디의 사본을 돌리는가가 판정을 바꾼다.**
 * 엔진이 필요한 검사는 소비 저장소의 사본으로 돌리면 죽는다 — 엔진은 배달되지 않기 때문이다.
 * 그때 죽는 것은 **그 저장소를 못 잰다는 뜻이 아니라 엉뚱한 사본을 돌렸다는 뜻**이다(R59).
 * `runsFrom: 'package'` 인 검사는 패키지의 것을 돌리고 `--universe` 로 그 집을 겨눈다.
 */
const run = (file, args, from) => new Promise((resolve) => {
  const command = file.endsWith('.sh') ? 'bash' : process.execPath;
  const child = spawn(command, [path.join(from, file), ...args, '--universe', root], { cwd: root });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => resolve({ code: code ?? 1, out }));
  child.on('error', () => resolve({ code: 1, out: 'spawn 실패' }));
});

/**
 * **배달본이 낡았는가** — 판이 아니라 **내용**으로 잰다.
 *
 * ⚠️⚠️ 실측(R58): 실험 은하의 배달본이 15바퀴 낡아 두 관문이 빨간불이었는데
 * `universe.config.json` 의 판은 **양쪽 다 0.8.0** 이었다. 판은 사람이 올리는 것이라 잊힌다.
 * ⇒ 배달되는 파일을 **바이트로 대조한다.** 기억에 기대지 않는다.
 */
const hashOf = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const walkFiles = async (dir, acc = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === 'node_modules' || entry.name === 'engine' || entry.name === 'out') { continue; }
    const full = path.join(dir, entry.name);
    /* eslint-disable-next-line no-await-in-loop */
    if (isJunk(entry.name)) {
      continue;   /* 배달하는 쪽과 같은 목록을 본다 — 안 그러면 「깔았는데 낡았다」가 영구히 뜬다 */
    }
    await (entry.isDirectory() ? walkFiles(full, acc) : Promise.resolve(acc.push(full)));
  }
  return acc;
};

/* 우주 자신의 저장소인가 — 규칙 소스가 있으면 그렇다(배달본에는 없다). */
const isUniverseRepo = Boolean(await stat(path.join(root, 'observatory/engine')).catch(() => null));
/* 엔진이 **쓸 수 있는 상태인가** — 빌드된 dist 가 있으면 그렇다(갓 클론엔 없다). */
const engineReady = Boolean(await stat(path.join(packageHome,
  'observatory/engine/packages/@core/fe-agent-contracts/dist/index.js')).catch(() => null));
console.log(`🔬 관문 — ${GATES.length}개 (라운드 없이 돈다)${isUniverseRepo ? '' : ' · 배달본이라 우주 전용 검사는 건너뛴다'}\n`);

let staleFiles = 0;
if (!isUniverseRepo) {
  for (const [folder] of DELIVERED) {
    /* eslint-disable-next-line no-await-in-loop */
    for (const source of await walkFiles(path.join(packageHome, folder))) {
      const rel = path.relative(packageHome, source);
      /* eslint-disable-next-line no-await-in-loop */
      const mine = await hashOf(source);
      /* eslint-disable-next-line no-await-in-loop */
      const theirs = await hashOf(path.join(root, rel)).catch(() => null);
      if (mine !== theirs) { staleFiles += 1; }
    }
  }
  if (staleFiles > 0) {
    console.log(`   ⚠️ **배달본이 낡았다** — 배달되는 파일 ${staleFiles}개가 패키지의 것과 다르다.`);
    console.log('      판(version)은 사람이 올리는 것이라 못 믿는다. 내용으로 쟀다.');
    console.log('      아래 빨간불이 이것 때문일 수 있다 — 다시 깔고 나서 다시 재라.\n');
  }
}
let failed = 0;
let ran = 0;
let skipped = 0;
let outOfScope = 0;
/** 엔진이 없어서 못 잰 검사 — 고장이 아니다. */
let needsBuild = 0;
/** 관문별 소요 시간 — CI 를 어떻게 나눌지 정하는 근거다(R154). */
const timings = [];
/** 관문이 스스로 「여기선 못 쟀다」고 말한 것(종료코드 3) — 통과도 실패도 아니다(R154). */
let unmeasured = 0;
for (const gate of GATES) {
  if (gate.scope === 'universe' && !isUniverseRepo) {
    console.log(`   ⏭  ${gate.label}  (여기선 못 잰다 — 우주 자신의 소스를 읽는 검사다)`);
    outOfScope += 1;
    continue;
  }
  if (gate.needsEngine && !engineReady) {
    console.log(`   ⏭  ${gate.label}  (엔진이 아직 없다 — 빌드하면 잰다)`);
    needsBuild += 1;
    continue;
  }
  const from = gate.runsFrom === 'package' ? packageHome : root;
  /* eslint-disable-next-line no-await-in-loop */
  if (!(await stat(path.join(from, gate.file)).catch(() => null))) {
    console.log(`   ⏭  ${gate.label}  (없다 — 배달되지 않는 것이다)`);
    skipped += 1;
    continue;
  }
  const startedAt = process.hrtime.bigint();
  /* eslint-disable-next-line no-await-in-loop */
  const { code, out } = await run(gate.file, gate.args ?? [], from);
  const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
  timings.push({ label: gate.label, ms, code });
  /* ⛔ **관문이 스스로 「못 쟀다」고 말할 수 있다**(종료코드 3 · R154).
     예전엔 0 아니면 1 뿐이라, 아무것도 못 잰 관문이 **✅ 로 찍혔다.** */
  if (code === EXIT_UNMEASURED) {
    unmeasured += 1;
    console.log(`   ⚪ ${gate.label}  **못 쟀다** · ${(ms / 1000).toFixed(1)}초 — 통과가 아니다`);
    for (const line of whyItFailed(out, 2).split('\n')) {
      if (line.trim()) { console.log(`      ${line.trim()}`); }
    }
    continue;
  }
  ran += 1;
  /* ⚠️ **시간을 같이 찍는다**(R154). CI 를 세우려면 「무엇이 느린가」를 알아야 하는데,
     그 수가 어디에도 없어서 짐작으로 나눌 뻔했다. 느린 관문을 모르고 CI 에 넣으면
     CI 가 느려지고 **아무도 안 보게 된다** — 관문을 죽이는 가장 흔한 방법이다. */
  console.log(`   ${code === 0 ? '✅' : '❌'} ${gate.label}  exit=${code} · ${(ms / 1000).toFixed(1)}초`);
  if (code !== 0) {
    console.log(whyItFailed(out));
    failed += 1;
  }
}

/* §8 — 아무것도 안 돌았으면 통과가 아니다. */
if (ran === 0) {
  console.error(`\n⛔ 검사가 하나도 안 돌았다(건너뜀 ${skipped}). 초록불이 아니다.`);
  process.exit(1);
}
if (needsBuild > 0) {
  console.log(`\n⚠️ **엔진이 아직 없어 ${needsBuild}개를 못 쟀다.** 갓 클론했다면 정상이다 — \`dist\` 는 커밋되지 않는다.`);
  console.log('   한 번만 하면 된다:  cd observatory/engine && npm install && npm run build');
}
console.log(`\n${failed === 0 ? '✅' : '⛔'} ${ran}개 돌았다 — 빨간불 ${failed}개 · 없어서 건너뜀 ${skipped} · 여기선 못 재서 ${outOfScope} · 엔진이 없어서 ${needsBuild}.`);
/* ⛔ **초록불 줄에 섞지 않는다.** 못 잰 것은 따로 세고 이름을 부른다 — 안 그러면
   「25개 전부 초록」이 「25개를 전부 쟀다」로 읽힌다(R154 · CI 가 그 자리를 잡았다). */
if (unmeasured > 0) {
  console.log(`⚪ 그중 ${unmeasured}개는 **스스로 못 쟀다고 말했다** — 통과로 세지 마라.`);
}
process.exit(failed === 0 ? 0 : 1);
