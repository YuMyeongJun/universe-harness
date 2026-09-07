#!/usr/bin/env node
/**
 * **「있는가」와 「살아 있는가」를 가른다.**
 *
 * `lib/required-env.mjs` 는 좌표의 `requiredEnv` 를 읽어 **환경변수가 있는지**만 본다
 * (옵트인 · 값은 안 읽는다). 그것이 옳다 — 값을 읽으면 그 값이 로그에 새고, 우주는 그 값을
 * 알 필요가 없다. ⛔ 그런데 **있는 것과 살아 있는 것은 다른 층이다:**
 *
 *   · 존재(presence) — 토큰 **문자열**이 환경에 있는가          ← `requiredEnv` 가 잰다
 *   · 생존(liveness) — 그 토큰/세션이 **아직 유효한가**         ← 여기
 *
 * ⚠️ 왜 넷째 층이 필요한가. 전해 들은 관찰이다(**원문을 대조하지 않았다** — 다른 팀의 주행):
 * 로그인 세션에 수명이 있어 **오래 도는 루프 중간에 죽었고**, 그때 화면은 로그인 페이지를 재고
 * 「전부 fail」을 뱉었다 — **그건 제품 결함이 아니었다.** 존재만 보는 검사는 이것을
 * **절대 못 잡는다**: 토큰 문자열은 만료돼도 **그대로 있기 때문**이다.
 *
 * ⛔⛔ **우주가 확인 방법을 짐작하지 않는다**(§9). 세션이 살아 있는지 보는 법은 은하마다 다르다
 * (쿠키 · 토큰 · OTP …). 이 저장소의 기존 규율과 같다 — 하네스는 자기 명령을 안 갖고
 * 은하가 `lint`·`build`·`test` 를 선언한다. **은하가 선언하고 우주는 그 선언을 실행할 뿐이다.**
 *
 * 좌표에 이렇게 적는다(옵트인):
 *
 *   "liveness": {
 *     "//세션": "왜 이 확인이 필요한지 — 주석은 `//` 로 시작한다",
 *     "세션": "<0 이면 살아 있다는 뜻의 명령>"
 *   }
 *
 * ⛔ **선언이 없으면 ⚪ 「못 쟀다」다.** 「살아 있다」로 넘기지 않는다 — **0은 무죄가 아니다**(§8).
 * ⛔ **값도 출력도 안 읽는다.** 자식의 stdout/stderr 는 아예 안 받는다(`stdio: 'ignore'`) —
 *    세션 확인의 응답 본문에는 토큰이 실려 오기 쉽고, 이 저장소는 공개 MIT 라 로그가 그대로 나간다.
 * ⛔ **선언된 명령의 글자도 안 찍는다** — 그 줄 안에 비밀이 적혀 있을 수 있다. 이름만 부른다.
 *
 * 재는 법:
 *   node observatory/liveness.mjs --galaxy <이름>
 *   종료코드 — 0 살아 있다 · 1 죽었다 · 3 **못 쟀다**(`EXIT_UNMEASURED`, 통과가 아니다)
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { findGalaxyFile, resolveGalaxyPath } from '../lib/galaxy-load.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { cannotStandMessage, missingEnv } from '../lib/required-env.mjs';
import { toolMissing } from '../lib/tool.mjs';

/** 셋 중 하나다 — **넷째(「은하가 안 선다」)는 이 층의 앞에서 갈린다**(`requiredEnv`). */
export const ALIVE = 'alive';
export const DEAD = 'dead';
export const UNMEASURED = 'unmeasured';

const MARK = { [ALIVE]: '✅', [DEAD]: '❌', [UNMEASURED]: '⚪' };

/**
 * **매달리지 않기 위한 안전줄**이지 판정이 아니다.
 * ⚠️ 실측(R154 · 이 저장소): 자식이 stdin 을 기다리며 **5분 타임아웃까지 매달린** 적이 있다.
 * ⛔ 여기에 걸리면 ⚪ **못 쟀다**로 간다 — ❌ 로 세지 않는다. 시간이 모자란 것은 죽었다는 증거가 아니다.
 */
const PROBE_DEADLINE_MS = 30_000;

/**
 * 은하가 선언한 확인들. `//` 로 시작하는 키는 **좌표의 주석**이다(이 저장소의 관례).
 * ⛔ 선언이 없거나 모양이 틀리면 **빈 목록**이다 — 막지 않는다. 막는 것은 존재 층의 일이고,
 *    여기서 막으면 옵트인이 아니게 된다.
 * @param {{liveness?: Record<string,string>}} galaxy 은하 좌표
 * @returns {{name: string, command: string|null}[]} `command` 가 null 이면 **선언이 못 쓴다**는 뜻이다
 */
export const declaredLiveness = (galaxy) => {
  const declared = galaxy?.liveness;
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) {
    return [];
  }
  return Object.entries(declared)
    .filter(([name]) => !name.startsWith('//'))
    .map(([name, command]) => ({
      name,
      command: typeof command === 'string' && command.trim() !== '' ? command : null,
    }));
};

/**
 * 한 확인의 판정 — **순수 함수**다. 실행 결과를 셋 중 하나로 옮긴다.
 * ⛔⛔ **기본값이 「살아 있다」가 아니다.** 모르는 결과는 전부 ⚪ 로 떨어진다 —
 *    아는 것 하나(종료코드 0)만 초록이다.
 */
export const livenessState = (outcome) => {
  if (!outcome || outcome.command === null || outcome.command === undefined) {
    return { state: UNMEASURED, why: '확인할 명령이 없다 — 선언이 없거나 명령 문자열이 아니다' };
  }
  if (outcome.toolMissing) {
    return { state: UNMEASURED, why: '확인 도구가 이 기계에 없다 — 은하 탓이 아니다' };
  }
  if (outcome.timedOut) {
    return { state: UNMEASURED, why: '확인이 제한 시간 안에 안 끝났다' };
  }
  if (outcome.exitCode === 0) {
    return { state: ALIVE, why: '선언한 확인이 0으로 끝났다' };
  }
  if (Number.isInteger(outcome.exitCode)) {
    return { state: DEAD, why: `선언한 확인이 0이 아닌 ${outcome.exitCode} 로 끝났다` };
  }
  return { state: UNMEASURED, why: '종료코드를 못 받았다' };
};

/**
 * 은하 전체의 판정.
 * ⛔ **하나도 없으면 ⚪ 다.** 「확인이 하나도 실패 안 했다」를 「살아 있다」로 읽으면
 *    이 층을 만든 뜻이 사라진다 — 0은 무죄가 아니다(§8).
 */
export const livenessSummary = (results) => {
  const count = (s) => results.filter((r) => r.state === s).length;
  const dead = count(DEAD);
  const unmeasured = count(UNMEASURED);
  const alive = count(ALIVE);
  const state = dead > 0 ? DEAD : (unmeasured > 0 || results.length === 0 ? UNMEASURED : ALIVE);
  return { state, alive, dead, unmeasured };
};

/**
 * 확인을 **실제로 돌린다** — 밖으로 나가는 유일한 자리다.
 * ⛔ 출력을 안 받는다. 받아서 안 찍는 것과 **아예 안 받는 것**은 다르다 — 받으면 언젠가 찍힌다.
 */
const runCommand = (command) => {
  const done = spawnSync(command, { shell: true, stdio: 'ignore', timeout: PROBE_DEADLINE_MS });
  return {
    exitCode: typeof done.status === 'number' ? done.status : null,
    timedOut: done.error?.code === 'ETIMEDOUT',
    /* 「도구가 없다」와 「확인이 실패했다」를 가른다 — 판정을 lib/tool.mjs 하나에서 받는다. */
    toolMissing: toolMissing({ code: done.status ?? done.error?.code }),
  };
};

/**
 * 은하의 확인들을 재서 줄마다 판정을 낸다.
 * @param {object} galaxy 은하 좌표
 * @param {(command: string) => object} run 확인을 돌리는 것 — 시험에서는 가짜를 넣는다(네트워크 없이 잰다)
 */
export const measureLiveness = (galaxy, run) => declaredLiveness(galaxy).map((probe) => {
  const outcome = probe.command === null
    ? { command: null }
    : { command: probe.command, ...run(probe.command) };
  return { name: probe.name, ...livenessState(outcome) };
});

/**
 * 사람에게 보일 문장. **무엇을 해야 하는지까지** 적는다 —
 * 「못 쟀다」만 말하면 받는 사람은 도구가 깨진 줄 안다(R58).
 * ⛔ 확인 이름만 부른다. **명령의 글자는 여기 절대 안 들어간다.**
 */
export const livenessReport = (galaxyName, results) => {
  const summary = livenessSummary(results);
  const lines = [`── 은하 ${galaxyName} · **살아 있는가** (존재와 다른 층이다)`];
  for (const r of results) {
    lines.push(`   ${MARK[r.state]} ${r.name} — ${r.why}`);
  }
  lines.push('');
  /* ⛔ **0을 셋 다 0으로 찍으면 안 된다** — 그 화면은 「아무 문제 없다」로 읽힌다.
     잰 것이 0개인 것은 결과가 아니라 **아무도 안 쟀다**는 뜻이다(§8). */
  lines.push(results.length === 0
    ? '   확인을 0개 쟀다 — **선언이 하나도 없다.** 이것은 결과가 아니다.'
    : `   살아 있다 ${summary.alive} · 죽었다 ${summary.dead} · **못 쟀다** ${summary.unmeasured}`);
  if (summary.unmeasured > 0 || results.length === 0) {
    lines.push('');
    lines.push('   ⚪ 는 통과가 아니다 — **아무도 그것을 안 쟀다**는 뜻이다(§8).');
    /* ⛔ **없는 선언과 못 돌린 확인은 다른 사건이다** — 같은 안내를 하면 이미 적어 둔 사람이
       「또 적으라는 건가」 하고 도구를 안 믿는다(R58 이 겪은 그 자리다). */
    if (results.some((r) => r.state === UNMEASURED && r.why.includes('확인할 명령이 없다'))) {
      lines.push(`   좌표(galaxies/${galaxyName}.json)의 \`liveness\` 에 적어라 — 「이 명령이 0이면 살아 있다」.`);
    }
    lines.push('   ⛔ 우주는 확인 방법을 짐작하지 않는다. 쿠키·토큰·OTP 는 은하마다 다르고,');
    lines.push('      짐작한 확인은 **엉뚱한 것을 재고도 초록불을 낸다.**');
  }
  if (summary.state === DEAD) {
    lines.push('');
    lines.push('   ❌ 는 **제품 결함이 아닐 수 있다** — 세션이 만료된 것뿐일 수 있다.');
    lines.push('      토큰 문자열은 만료돼도 그대로 있으므로 존재 검사는 이것을 못 잡는다.');
    lines.push('      다시 로그인해서 세션을 살리고 나서 재라.');
  }
  return lines.join('\n');
};

/** 판정 → 종료코드. ⛔ **못 쟀다는 통과가 아니다** — 관문의 셋째 코드로 나간다. */
export const livenessExit = (state) => (state === ALIVE ? 0 : state === DEAD ? 1 : EXIT_UNMEASURED);

/* ── 여기부터는 명령줄로 불렸을 때만 돈다. 부품(위의 순수 함수들)은 부르는 쪽이 따로 가져다 쓴다. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  /* §7 — 은하를 찾기 **전에** 모르는 플래그를 거부한다. */
  rejectUnknownFlags(argv, ['--universe', '--galaxy'], 'universe liveness');
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const root = await requireUniverseHome(flag('--universe'));
  const config = JSON.parse(await fs.readFile(path.join(root, 'universe.config.json'), 'utf8'));
  const gname = flag('--galaxy') ?? config.galaxies[0];
  const gfile = (await findGalaxyFile(root, gname)) ?? path.join(root, 'galaxies', `${gname}.json`);
  const galaxy = resolveGalaxyPath(root, JSON.parse(await fs.readFile(gfile, 'utf8')));

  /* ⛔ **존재가 먼저다.** 변수가 아예 없으면 은하가 안 선다 — 그때 생존을 재면
     「죽었다」가 나오는데 그건 거짓이다. 아직 **아무것도 시작 못 한 것**이다(R149). */
  const missing = missingEnv(galaxy, process.env);
  if (missing.length > 0) {
    console.error(cannotStandMessage(gname, missing));
    process.exit(2);
  }

  const results = measureLiveness(galaxy, runCommand);
  console.log(livenessReport(gname, results));
  process.exit(livenessExit(livenessSummary(results).state));
}
