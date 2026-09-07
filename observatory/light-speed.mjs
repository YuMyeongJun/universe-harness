#!/usr/bin/env node
/**
 * **광속 한계를 잰다** — 초기 로드가 예산 안인가.
 *
 * ⚠️⚠️ 왜 있는가: 이 법칙은 우주 초기부터 있었고 은하 좌표에 `thresholds.initialLoadKB` 를
 * 적게 해 뒀다. 그런데 **그 값을 읽는 코드가 하나도 없었다**(실측 R62: 저장소 전체에서
 * 두 군데뿐인데 둘 다 「적는 자리」였다). 법칙은 있는데 관문이 없으면 **장식**이다.
 *
 * ⛔ 법칙의 말은 이렇다 — 「임계값은 **깨끗한 상태의 실측값 이상**이어야 한다.
 * 아니면 그 축은 정의상 실패다.」 그래서 넘었을 때 두 가지를 가려 말한다:
 *   · 예산보다 커졌다 → 코드가 무거워졌다
 *   · 처음부터 예산이 실측보다 작았다 → **그 예산은 통과할 수 없는 값**이다
 *
 *   universe speed [--galaxy <이름>] [--update]
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { requireUniverseHome } from '../lib/home.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { firstFilled } from '../lib/pick.mjs';
import { toolMissing } from '../lib/tool.mjs';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--galaxy', '--update'], 'universe speed');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const root = await requireUniverseHome(flag('--universe'));
const config = JSON.parse(await readFile(join(root, 'universe.config.json'), 'utf8'));
/* ⛔ 모르는 이름에는 §7 과 **같은 답**을 한다 — 아는 것을 늘어놓는다(R77). */
const asked = flag('--galaxy');
if (asked && !config.galaxies.includes(asked)) {
  console.error(`⛔ 그런 은하가 없다: ${asked}`);
  console.error(`   아는 은하는 이것뿐이다: ${config.galaxies.join(' · ') || '(없음)'}`);
  process.exit(1);
}
const names = asked ? [asked] : config.galaxies;

if (names.length === 0) {
  console.log('  ⓘ 등록된 은하가 없다 — 잴 대상이 없다.');
  process.exit(0);
}

let failed = false;
let measured = 0;
/** 못 잰 것이 **도구가 없어서**인가 — 그렇다면 은하 탓이 아니다. */
let toolAbsent = false;
for (const name of names) {
  const file = join(root, 'galaxies', `${name}.json`);
  const g = await readFile(file, 'utf8').then((t) => JSON.parse(t)).catch(() => null);
  if (!g) { continue; }
  const build = firstFilled(g.commands?.build);
  if (!build) {
    console.log(`  ⚠️ 은하 ${name} — \`commands.build\` 가 없다. **못 쟀다.**`);
    continue;
  }

  const buildFailure = await execFileAsync('bash', ['-c', build], { cwd: g.path, maxBuffer: 64 * 1024 * 1024 })
    .then(() => null).catch((error) => error);
  if (buildFailure && toolMissing(buildFailure)) {
    console.log(`  ⚠️ 은하 ${name} — 빌드 도구가 안 돌았다(의존성이 없을 수 있다). **못 쟀다** — 은하 탓으로 돌리지 않는다.`);
    toolAbsent = true;
    continue;
  }
  const distDir = join(g.path, g.appDir ?? '.', 'dist');
  const html = await readFile(join(distDir, 'index.html'), 'utf8').catch(() => null);
  if (html === null) {
    /* ⛔ 결과가 없으면 **0이 아니라 「모름」**이다(§8). Vite 가 아닌 은하일 수도 있다. */
    console.log(`  ⚠️ 은하 ${name} — \`dist/index.html\` 을 못 읽었다. **못 쟀다**(Vite 산출이 아닐 수 있다).`);
    continue;
  }
  /* 초기 로드 = index.html 이 **직접 부르는** 자산. 지연 로드되는 청크는 세지 않는다. */
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/?assets\/[^"]+)"/g)].map((m) => m[1]))];
  let bytes = 0;
  const parts = [];
  for (const ref of refs) {
    const asset = join(distDir, ref.replace(/^\//, ''));
    const size = await stat(asset).then((s) => s.size).catch(() => null);
    if (size !== null) { bytes += size; parts.push(`${ref.split('/').pop()} ${(size / 1024).toFixed(0)}KB`); }
  }
  if (refs.length === 0) {
    console.log(`  ⚠️ 은하 ${name} — index.html 이 부르는 자산을 못 찾았다. **못 쟀다.**`);
    continue;
  }
  measured += 1;
  const kb = Math.round(bytes / 1024);
  const budget = g.thresholds?.initialLoadKB;

  if (argv.includes('--update')) {
    g.thresholds = { ...(g.thresholds ?? {}), initialLoadKB: kb };
    await writeFile(file, `${JSON.stringify(g, null, 2)}\n`, 'utf8');
    console.log(`  ↳ 은하 ${name} — 예산을 실측으로 심었다: ${kb}KB (${parts.join(' · ')})`);
    continue;
  }
  if (typeof budget !== 'number') {
    console.log(`  ⚠️ 은하 ${name} — 예산(\`thresholds.initialLoadKB\`)이 없다(실측 ${kb}KB). \`--update\` 로 심어라.`);
    failed = true;
    continue;
  }
  const over = kb - budget;
  console.log(`  ${over > 0 ? '🔴' : '✅'} 은하 ${name} — 초기 로드 ${kb}KB (예산 ${budget}KB${over > 0 ? ` · +${over}` : ''})`);
  console.log(`     ${parts.join(' · ')}`);
  if (over > 0) {
    console.log('     **예산을 넘었다.** 코드가 무거워졌거나, 예산이 처음부터 실측보다 작았다 —');
    console.log('     뒤쪽이면 그 축은 **정의상 통과할 수 없다**(광속 한계). 예산을 실측 이상으로 다시 심어라.');
    failed = true;
  }
}

/* ⛔ **못 잰 이유를 가린다.** 도구가 없어서면 은하 탓이 아니다 — 「못 쟀다」로 끝낸다(R69).
   좌표가 비었거나 결과가 이상해서면 그건 고칠 수 있는 것이므로 빨간불이다. */
if (measured === 0) {
  console.log(`\n⚠️ 잰 은하가 없다 — ${toolAbsent ? '**도구가 없어서다**(의존성 설치 전일 수 있다). 은하 탓으로 돌리지 않는다.' : '좌표가 비었거나 결과를 못 읽었다 — 통과가 아니다(§8).'}`);
  process.exit(toolAbsent ? 0 : 1);
}
process.exit(failed ? 1 : 0);
