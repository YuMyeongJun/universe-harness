#!/usr/bin/env node
/**
 * **lint 도 기준선으로 잰다** — 절대 0이 아니라 **늘었는가**.
 *
 * ⚠️⚠️ 왜 있는가: 우주의 모든 축은 기준선을 쓴다 —
 * 법칙 위반은 `observed.laws`, 번들 크기는 「깨끗한 상태의 실측값 이상이어야 한다」(광속 한계).
 * **그런데 lint 만 절대 0을 요구한다**(「게이트 통과 조건은 여기 있는 것 전부 0 error」).
 * 실측(R61): 진짜 은하의 트렁크에 error 11건이 있어 **깔자마자 빨간불**이었다.
 * 그 팀은 우주를 쓰기 전에 11건을 먼저 치워야 한다 — 그건 도입을 막는 벽이다.
 *
 * ⛔ **11건을 눈감아 주는 것이 아니다.** 기준선으로 심고 **늘면 막는다.**
 * 우주가 다른 모든 축에 쓰는 바로 그 방식이다. 줄이는 것이 목표라는 말도 그대로다.
 *
 *   universe lint --galaxy <이름>            # 기준선과 대조
 *   universe lint --galaxy <이름> --update    # 지금 수치를 기준선으로 심는다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { requireUniverseHome } from '../lib/home.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { firstFilled } from '../lib/pick.mjs';
import { toolMissing } from '../lib/tool.mjs';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--galaxy', '--update', '--why'], 'universe lint');
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

let failed = false;
let measured = 0;
/** 못 잰 것이 **도구가 없어서**인가 — 그렇다면 은하 탓이 아니다. */
let toolAbsent = false;
for (const name of names) {
  const file = join(root, 'galaxies', `${name}.json`);
  const g = await readFile(file, 'utf8').then((t) => JSON.parse(t)).catch(() => null);
  if (!g) {
    console.log(`  ⚠️ 은하 ${name} — 좌표 파일이 없다. 건너뛴다.`);
    continue;
  }
  const template = firstFilled(g.commands?.lintJson);
  if (!template || (g.lintTargets ?? []).length === 0) {
    console.log(`  ⚠️ 은하 ${name} — \`commands.lintJson\` 이나 \`lintTargets\` 가 없다. **못 쟀다.**`);
    continue;
  }

  let errors = 0;
  let warnings = 0;
  for (const target of g.lintTargets) {
    const out = join(g.path, '.harness', `lint-drift-${name}.json`);
    await mkdir(join(g.path, '.harness'), { recursive: true });
    const cmd = template.replaceAll('<TARGET>', target.target)
      .replaceAll('<OUT>', out).replaceAll('<WORKSPACE>', target.workspace ?? '');
    const failure = await execFileAsync('bash', ['-c', cmd], { cwd: g.path, maxBuffer: 64 * 1024 * 1024 })
      .then(() => null).catch((error) => error);
    if (failure && toolMissing(failure)) {
      console.log(`  ⚠️ 은하 ${name} — lint 도구가 안 돌았다(의존성이 없을 수 있다). **못 쟀다** — 은하 탓으로 돌리지 않는다.`);
      errors = null;
      toolAbsent = true;
      break;
    }
    const parsed = await readFile(out, 'utf8').then((t) => JSON.parse(t)).catch(() => null);
    /* ⛔ 결과 파일이 없으면 **0이 아니라 「모름」**이다 — 없는 것을 통과로 세지 않는다(§8). */
    if (parsed === null) {
      console.log(`  ⚠️ 은하 ${name} — lint 결과를 못 읽었다(${target.target}). **못 쟀다.**`);
      errors = null;
      toolAbsent = true;
      break;
    }
    errors += parsed.reduce((sum, f) => sum + f.errorCount, 0);
    warnings += parsed.reduce((sum, f) => sum + f.warningCount, 0);
  }
  if (errors === null) { continue; }
  measured += 1;

  const baseline = g.observed?.lint?.errors;
  if (argv.includes('--update')) {
    /* ⛔ 법칙 기준선과 **같은 래칫**이다 — 올리는 것은 빚이라 사유를 적게 한다(R64). */
    const was = g.observed?.lint?.errors;
    const why = flag('--why');
    if (typeof was === 'number' && errors > was && !why) {
      console.log(`  ⛔ lint 기준선을 **올리려** 한다 — error ${was} → ${errors}.`);
      console.log('     내리는 것은 목표고 올리는 것은 **빚**이다. `--why "<왜 올리는가>"` 를 붙여라.');
      process.exit(1);
    }
    const raised = typeof was === 'number' && errors > was
      ? [...(g.observed?.raisedLint ?? []), { at: new Date().toISOString(), why, from: was, to: errors }]
      : (g.observed?.raisedLint ?? []);
    g.observed = { ...(g.observed ?? {}), lint: { errors, warnings }, ...(raised.length > 0 ? { raisedLint: raised } : {}) };
    await writeFile(file, `${JSON.stringify(g, null, 2)}\n`, 'utf8');
    console.log(`  ↳ 은하 ${name} — 기준선을 심었다: error ${errors} · warning ${warnings}`);
    continue;
  }
  if (typeof baseline !== 'number') {
    console.log(`  ⚠️ 은하 ${name} — lint 기준선이 없다(실측 error ${errors}). \`--update\` 로 심어라.`);
    failed = true;
    continue;
  }
  const raisedLint = g.observed?.raisedLint ?? [];
  if (raisedLint.length > 0) {
    const last = raisedLint[raisedLint.length - 1];
    console.log(`  ⓘ 은하 ${name} — lint 기준선을 **${raisedLint.length}번 올렸다**(마지막 ${last.from}→${last.to}: ${last.why}). 빚이다.`);
  }
  const drift = errors - baseline;
  const mark = drift > 0 ? '🔴' : drift < 0 ? '✅' : '✅';
  console.log(`  ${mark} 은하 ${name} — error ${errors} (기준선 ${baseline}${drift === 0 ? '' : ` · ${drift > 0 ? '+' : ''}${drift}`}) · warning ${warnings}`);
  if (drift > 0) {
    console.log('     **늘었다.** 기준선은 눈감아 주는 값이 아니라 **넘지 말아야 할 선**이다.');
    failed = true;
  } else if (drift < 0) {
    console.log('     줄었다 — `--update` 로 기준선을 낮춰라. 낮추지 않으면 다시 늘어도 안 걸린다.');
  }
}

/**
 * ⚠️ **「등록된 은하가 없다」와 「있는데 못 쟀다」는 다르다.**
 * 앞은 갓 깐 우주의 정상 상태다(안내가 「이제 은하를 등록하라」고 한다).
 * 뒤는 §8 — 잴 대상이 있는데 못 쟀으면 통과가 아니다.
 * 실측(R61): 이 둘을 안 갈랐다가 **갓 깐 우주가 빨간불**이 됐다. `observe` 는 이미 갈라 놨었다.
 */
if (names.length === 0) {
  console.log('  ⓘ 등록된 은하가 없다 — 잴 대상이 없다.');
  process.exit(0);
}
/* ⛔ **못 잰 이유를 가린다.** 도구가 없어서면 은하 탓이 아니다 — 「못 쟀다」로 끝낸다(R69).
   좌표가 비었거나 결과가 이상해서면 그건 고칠 수 있는 것이므로 빨간불이다. */
if (measured === 0) {
  console.log(`\n⚠️ 잰 은하가 없다 — ${toolAbsent ? '**도구가 없어서다**(의존성 설치 전일 수 있다). 은하 탓으로 돌리지 않는다.' : '좌표가 비었거나 결과를 못 읽었다 — 통과가 아니다(§8).'}`);
  process.exit(toolAbsent ? 0 : 1);
}
process.exit(failed ? 1 : 0);
