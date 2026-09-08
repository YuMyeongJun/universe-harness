#!/usr/bin/env node
/**
 * **fail 0 까지 반복한다** — 사람의 계획에서 「이게 fail 이 0이 될 때까지 반복되는거지」의 그 칸.
 *
 * ## ⛔⛔ 자동으로 만들지 **않는** 것: 판정
 *
 * 종료 조건은 「fail 0」이 아니라 **「판단하지 않은 fail 0」**이다. 그래서 이 도구가 판정을
 * 대신 붙이면 **종료 조건이 그 자리에서 무의미해진다** — 가장 싼 해법이 「전부 accepted」가 된다.
 * ⇒ 이 도구는 **돌리고 · 세고 · 멈출 때를 말한다.** 판정은 사람이 콘솔에서 붙인다.
 *
 * ## 멈추는 자리는 넷이다 — ⛔ 「끝날 때까지」 무한히 돌지 않는다
 *
 *   ✅ **끝났다**        판단하지 않은 fail 0 (그 회전에서 멈춰도 된다)
 *   🔁 **안 줄어든다**   같은 수가 연달아 나온다 — 사람이 **판정하거나 고쳐야** 한다
 *   ⏹ **바퀴를 다 썼다** `--max` 만큼 돌았다 (기본 5)
 *   ⚪ **못 쟀다**       축이 없거나 리포트를 못 읽었다 — 반복해도 안 달라진다. **즉시 멈춘다.**
 *
 * ⚠️ **줄어들기만 하면 계속 돈다**는 뜻이 아니다. 줄어도 `--max` 에서 멈춘다 —
 *    사람이 안 보는 사이에 **몇 시간씩 도는 도구**가 되면 아무도 안 쓴다.
 *
 * ## ⛔ 판정을 여기서 세지 않는다
 *
 * 「몇 건이 판단 안 됐나」는 `qa` 의 계약이 안다. 이 도구는 **`universe loop` 를 부르고**
 * 그 종료코드와 말을 읽는다. 두 자리에서 세면 화면과 관문이 다른 말을 한다(R47·R91).
 *
 *   node observatory/repeat.mjs --galaxy <이름> [--max 5] [--stall 2] [--fix]
 *
 * 종료코드: 0 = 끝났다 · 1 = 안 끝났다(안 줄어들거나 바퀴를 다 씀) · 3 = 못 쟀다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { findGalaxyFile, resolveGalaxyPath } from '../lib/galaxy-load.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--galaxy', '--max', '--stall', '--fix', '--report'], 'universe repeat');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = await requireUniverseHome(flag('--universe'));
const config = JSON.parse(await readFile(path.join(home, 'universe.config.json'), 'utf8'));
const name = flag('--galaxy') ?? config.galaxies?.[0];

/** ⛔ 기본 5바퀴. 「끝날 때까지」가 아니다 — 사람이 안 보는 사이에 도는 도구는 안 쓰인다. */
const max = Number(flag('--max') ?? 5);
/** 같은 수가 연달아 이만큼 나오면 **안 줄어드는 것**이다. */
const stall = Number(flag('--stall') ?? 2);
if (!Number.isFinite(max) || max < 1 || !Number.isFinite(stall) || stall < 1) {
  console.error('⛔ --max 와 --stall 은 1 이상의 수여야 한다.');
  process.exit(1);
}

console.log(`── fail 0 까지 반복 — 은하 ${name} (최대 ${max}바퀴 · 같은 수 ${stall}번이면 멈춘다)`);
console.log('   ⛔ 판정은 **자동으로 안 붙인다** — 그러면 종료 조건이 무의미해진다.');

const file = await findGalaxyFile(home, name);
if (!file) {
  console.error(`⛔ 없는 은하: ${name}`);
  process.exit(1);
}
const galaxy = resolveGalaxyPath(home, JSON.parse(await readFile(file, 'utf8')));

const run = (cmd, args, opts = {}) => new Promise((done) => {
  const child = spawn(cmd, args, { cwd: opts.cwd ?? home, shell: opts.shell ?? false, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  child.stdout.on('data', (d) => { text += d; });
  child.stderr.on('data', (d) => { text += d; });
  child.on('close', (code) => done({ code, text }));
  child.on('error', (error) => done({ code: 127, text: String(error.message) }));
});

/** 「판단하지 않은 fail N건」에서 N. ⛔ 못 읽으면 **null** 이다 — 0 으로 접지 않는다(§8). */
const unjudgedCount = (text) => {
  const m = /판단하지 않은 fail (\d+)건/.exec(text);
  return m ? Number(m[1]) : null;
};

const seen = [];
let round = 0;
while (round < max) {
  round += 1;
  const args = [path.join(ROOT, 'observatory/loop-state.mjs'), '--galaxy', name, '--universe', home];
  if (flag('--report')) { args.push('--report', flag('--report')); }
  /* eslint-disable-next-line no-await-in-loop */
  const out = await run(process.execPath, args);

  if (out.code === 0) {
    console.log(`\n✅ **${round}바퀴에 끝났다** — 판단하지 않은 fail 0.`);
    console.log('   ⛔ 「fail 0」이 아니다. 실패가 있어도 **사람이 판단했으면** 끝난 것이다.');
    process.exit(0);
  }
  if (out.code === EXIT_UNMEASURED) {
    /* ⛔ **반복해도 안 달라진다.** 축이 없거나 리포트를 못 읽는 것은 바퀴를 더 돈다고 풀리지 않는다. */
    console.log(`\n⚪ **${round}바퀴에서 못 쟀다 — 즉시 멈춘다.** 반복해도 안 달라진다.`);
    console.log(out.text.split('\n').filter((l) => l.includes('⚪') || l.includes('→')).slice(0, 3).join('\n'));
    process.exit(EXIT_UNMEASURED);
  }

  const n = unjudgedCount(out.text);
  if (n === null) {
    console.log(`\n⚪ **${round}바퀴 — 몇 건인지 못 읽었다.** 통과가 아니다(§8).`);
    console.log(out.text.split('\n').filter(Boolean).slice(-3).join('\n'));
    process.exit(EXIT_UNMEASURED);
  }
  seen.push(n);
  console.log(`   ${round}바퀴 — 판단하지 않은 fail **${n}건**${seen.length > 1 ? ` (앞바퀴 ${seen[seen.length - 2]}건)` : ''}`);

  /* 🔁 **안 줄어든다** — 같은 수가 연달아 나오면 사람이 판정하거나 고쳐야 한다. */
  const tail = seen.slice(-stall);
  if (tail.length === stall && tail.every((v) => v === tail[0])) {
    console.error(`\n🔁 **안 줄어든다** — ${stall}바퀴 연속 ${tail[0]}건이다. 반복은 여기서 멈춘다.`);
    console.error('   → 콘솔에서 **판정을 붙이거나**, 코드를 고쳐라. 도구가 대신 판단하지 않는다.');
    console.error('   ⛔ 단정을 약하게 만들어 fail 을 없애지 마라 — 그래서 종료 조건이 「fail 0」이 아니다.');
    process.exit(1);
  }

  /**
   * ⛔ **고치는 명령은 은하가 선언해야 돈다**(`commands.lintFix`). `--fix` 를 줘야 부른다.
   * ⚠️ 남의 저장소를 **자동으로 고치는** 일이라, 두 겹으로 막는다: 선언 + 플래그.
   */
  if (argv.includes('--fix')) {
    const fix = galaxy.commands?.lintFix;
    if (!fix) {
      console.log('   ⏭  --fix 를 줬지만 은하가 `commands.lintFix` 를 선언 안 했다 — 안 고친다.');
    } else {
      console.log(`   🔧 고친다 — ${fix}`);
      /* eslint-disable-next-line no-await-in-loop */
      const fixed = await run(fix, [], { cwd: galaxy.path, shell: true });
      if (fixed.code !== 0) {
        console.log(`   ⚠️ 고치는 명령이 ${fixed.code} 로 끝났다 — 계속 돈다(그 결과는 다음 바퀴가 잰다).`);
      }
    }
  }
}

console.error(`\n⏹ **바퀴를 다 썼다** — ${max}바퀴 돌고 멈춘다. 판단하지 않은 fail: ${seen.join(' → ')}건`);
console.error('   ⛔ 「끝날 때까지」 돌지 않는다 — 사람이 안 보는 사이에 몇 시간씩 도는 도구는 아무도 안 쓴다.');
console.error(`   → 더 돌리려면 --max ${max * 2}. 줄지 않으면 **판정이나 고침이 먼저**다.`);
process.exit(1);
