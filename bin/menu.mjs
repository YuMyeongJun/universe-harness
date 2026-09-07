/**
 * **대화형 입구** — 외우지 않고 쓰게 한다. 그리고 **가르친다.**
 *
 * ## 이것이 하는 일과 **안 하는 일**
 *
 * 하는 일: 사람이 치는 명령 10개를 보여 주고, 고른 것에 **필요한 것만** 묻고,
 *          **만든 명령줄을 찍어 보여 준 뒤** 실행한다.
 *
 * ⛔⛔ **안 하는 일 — 이것이 이 파일의 설계 전부다:**
 *   · **관문을 못 끈다.** 「무시하고 계속」·「이번만 건너뛰기」 갈래를 **만들지 않는다.**
 *     강제는 훅(`.githooks`)과 CI 에 있고 여기는 거기 손이 안 닿는다.
 *     ⚠️ 「느려진 관문은 아무도 안 본다」의 사촌이 **「넘길 수 있는 관문」**이다 —
 *     화면이 생겼다고 관문이 약해지면 화면을 만든 것이 손해다.
 *   · **임의 명령을 못 만든다.** 배분표(`SUBCOMMANDS`)에 있는 것만 고를 수 있다.
 *   · **비-TTY 에서는 아예 안 뜬다**(부르는 쪽이 가른다 · 아래 ⚠️).
 *
 * ## 왜 명령줄을 찍고 나서 실행하는가 — **이 파일의 핵심**
 *
 * 메뉴가 명령을 **대신 기억해 주면** 사람은 영영 못 외운다. 그래서 고를 때마다
 * `$ universe new tiny-galaxy shop Foo --expand` 를 **먼저 찍는다.**
 * 다음엔 메뉴를 안 거치게 되는 것이 성공이다 — **화면이 목적이 아니라 입구다.**
 *
 * ## ⛔ 의존성 0
 * `node:readline/promises` 만 쓴다. 이 저장소는 `dependencies` 도 `devDependencies` 도
 * 비어 있고 문서가 그것을 강점으로 적어 뒀다 — 입구 하나 때문에 깨지 않는다.
 */
import { spawn } from 'node:child_process';
import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

import { COSTS_MONEY, dailyCommands, invocationLabel, usageWidth } from '../lib/commands.mjs';

/**
 * PATH 에서 `universe` 를 찾아 **실경로**를 준다. 못 찾으면 null.
 * ⛔ `which` 를 부르지 않는다 — 셸마다 다르고, 이 저장소는 의존성도 자식 프로세스도 아낀다.
 * ⚠️ 심링크를 **따라간다**(`npm link` 가 만드는 것이 심링크다). 안 따라가면 이어져 있는데도
 *    「없다」고 말하게 된다 — 그 방향의 오류는 **더 긴 명령을 가르치는** 쪽이라 조용하다.
 */
const resolveOnPath = async (name) => {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, name);
    /* eslint-disable-next-line no-await-in-loop */
    const real = await realpath(candidate).catch(() => null);
    if (real) {
      return real;
    }
  }
  return null;
};

/**
 * ⛔ **stdin 이 끝나면 곱게 나간다.** Ctrl-D 를 누르거나 입력이 파이프로 들어오다 끊기면
 * `rl.question` 이 `ABORT_ERR` 로 거절한다 — 그대로 두면 **생 스택트레이스**가 뜬다.
 * 「사람이 그만둔 것」은 고장이 아니다(R146 이 컴파일 관문에서 가른 그 구분과 같다).
 */
const CANCELLED = Symbol('cancelled');
const ask = async (rl, prompt) => {
  try {
    return await rl.question(prompt);
  } catch {
    return CANCELLED;
  }
};

/**
 * 은하 이름을 **읽어서** 보여 준다 — 외우게 하지 않는다.
 * ⛔ 못 읽으면 **지어내지 않는다.** 빈 목록을 주고 사람이 직접 치게 한다.
 */
const galaxyNames = async (root) => {
  const names = new Set();
  for (const dir of ['galaxies.local', 'galaxies']) {
    for (const file of await readdir(path.join(root, dir)).catch(() => [])) {
      if (file.endsWith('.json')) {
        names.add(file.replace(/\.json$/, ''));
      }
    }
  }
  return [...names].sort();
};

/** 그 은하의 태양계 이름. ⛔ 좌표를 못 읽으면 빈 목록이다 — 짐작하지 않는다. */
const solarNames = async (root, galaxyName) => {
  for (const dir of ['galaxies.local', 'galaxies']) {
    const raw = await readFile(path.join(root, dir, `${galaxyName}.json`), 'utf8').catch(() => null);
    if (raw === null) {
      continue;
    }
    try {
      return (JSON.parse(raw).solarSystems ?? []).map((s) => s.name);
    } catch {
      return [];
    }
  }
  return [];
};

/** 번호로 고른다. 빈 답이면 첫째. ⛔ 범위 밖이면 다시 묻는다 — 조용히 첫째로 넘기지 않는다. */
const pick = async (askOne, title, items, render = (x) => x) => {
  console.log(`\n${title}`);
  items.forEach((item, index) => console.log(`  ${index + 1}) ${render(item)}`));
  for (;;) {
    const raw = await askOne(`고르기 [1-${items.length}] (기본 1): `);
    if (raw === CANCELLED) {
      return CANCELLED;
    }
    const answer = raw.trim();
    if (answer === '') {
      return items[0];
    }
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= items.length) {
      return items[index - 1];
    }
    console.log(`  ⛔ 1~${items.length} 중에서 골라라.`);
  }
};

const askYes = async (askOne, question) => {
  const raw = await askOne(`${question} [y/N]: `);
  return raw === CANCELLED ? CANCELLED : /^(y|yes|ㅇ|예)$/i.test(raw.trim());
};

/** 비어 있으면 다시 묻는다. ⛔ 빈 값을 삼키면 엉뚱한 명령이 만들어진다(R46 종류). */
const askRequired = async (askOne, question) => {
  for (;;) {
    const raw = await askOne(`${question}: `);
    if (raw === CANCELLED) {
      return CANCELLED;
    }
    const answer = raw.trim();
    if (answer !== '') {
      return answer;
    }
    console.log('  ⛔ 비울 수 없다.');
  }
};

/**
 * 명령마다 **필요한 것만** 묻는다.
 * ⛔ 여기 없는 명령은 인자 없이 그대로 돈다 — 모르는 것을 물어보는 척하지 않는다.
 */
const askArgs = async (askOne, root, name) => {
  if (name === 'new') {
    const galaxies = await galaxyNames(root);
    const galaxy = galaxies.length > 0
      ? await pick(askOne, '어느 은하에?', galaxies)
      : await askRequired(askOne, '은하 이름 (galaxies/ 에서 못 읽었다)');
    const solars = await solarNames(root, galaxy);
    const solar = solars.length > 0
      ? await pick(askOne, '어느 태양계에?', solars)
      : await askRequired(askOne, '태양계 이름 (좌표에서 못 읽었다)');
    const star = await askRequired(askOne, '별 이름 (PascalCase · 예: DashboardToday)');
    const args = [galaxy, solar, star];

    console.log('\n무엇까지 할까?');
    const how = await pick(askOne, '', [
      '1차만 — 뼈대를 만들고 관문에 건다',
      '2차 — 게이트까지 돌리고 고칠 수 있으면 고친다 (--expand)',
      '3차 — 요구사항을 주고 에이전트가 만든다 (--from) ⚠️ 모델을 부른다',
    ]);
    if (how.startsWith('2차')) {
      args.push('--expand');
    }
    if (how.startsWith('3차')) {
      /* ⛔ 돈이 드는 갈래 — **말하고 확인받는다.** 막지는 않는다. 사람이 정한다. */
      console.log(`\n⚠️ ${COSTS_MONEY['new --from']}`);
      console.log('   공짜로 배선만 보려면 나중에 `--lane script --agent-script <대본>` 을 쓴다.');
      if ((await askYes(askOne, '그래도 진행할까?')) !== true) {
        return null;
      }
      const requirement = await askRequired(askOne, '요구사항 한 줄');
      if (requirement === CANCELLED) {
        return null;
      }
      args.push('--from', requirement);
    }
    return args;
  }

  if (name === 'extract') {
    console.log(`\n⚠️ ${COSTS_MONEY['extract --write']}`);
    console.log('   기본은 **모델을 안 부른다** — 무엇이 카드가 될지만 보여 준다.');
    return (await askYes(askOne, '진짜로 뽑을까? (--write · 모델을 부른다)')) === true ? ['--write'] : [];
  }

  if (name === 'round') {
    const what = await pick(askOne, '라운드를 어떻게?', ['new — 연다', 'close — 닫는다', 'open — 성운을 본다', 'suggest — 열 때인가']);
    const sub = what.split(' ')[0];
    return sub === 'new' ? [sub, await askRequired(askOne, '라운드 제목')] : [sub];
  }

  if (name === 'observe' || name === 'learn') {
    return [];
  }
  if (name === 'hooks') {
    return (await askYes(askOne, '커밋 관문을 켤까? (--install)')) === true ? ['--install'] : [];
  }
  return [];
};

/**
 * 대화형 입구. **부르는 쪽이 TTY 를 확인하고 부른다** — 여기서 다시 확인하지 않는다.
 *
 * ⚠️ `ask` 와 `run` 을 **밖에서 넣을 수 있다.** 이 저장소가 이미 쓰는 방식이다
 * (`createScriptedAsk` · `options.callModel` · `fetchImpl`). 대화형은 TTY 가 있어야 도는데
 * 시험대에는 TTY 가 없다 — 그러면 **이 입구는 영영 안 재진다.** 「안 타 본 갈래는 없는 관문과
 * 같다」(R71). ⇒ 답을 대본으로 넣고 **만들어진 명령줄을 그대로 재는** 자리를 열어 둔다.
 * ⛔ 넣지 않으면 동작은 그대로다 — 기본이 진짜 readline 이고 진짜 spawn 이다.
 *
 * @returns {Promise<number>} 종료코드
 */
export const runMenu = async ({ root, packageHome, subcommands, ask: injectedAsk, run: injectedRun }) => {
  const rl = injectedAsk ? null : createInterface({ input: process.stdin, output: process.stdout });
  const askOne = injectedAsk ?? ((prompt) => ask(rl, prompt));
  try {
    console.log('우주 — 무엇을 할까?');
    console.log('⚠️ 고르면 **명령줄을 보여 주고** 실행한다 — 다음엔 그것을 그대로 치면 된다.');

    const daily = dailyCommands().filter(([name]) => subcommands[name]);
    /* ⚠️ 한글은 터미널에서 **두 칸**을 먹는다 — 폭은 `usageWidth` 가 칸 수로 잰다(도움말과 같은 자리). */
    const width = usageWidth(daily);
    const chosen = await pick(askOne, '', daily,
      ([, meta]) => `${meta.usage}${' '.repeat(Math.max(0, width - usageWidth([[null, meta]])))}  ${meta.summary}`);
    if (chosen === CANCELLED) {
      console.log('\n(그만둔다)');
      return 0;
    }
    const [name] = chosen;

    const args = await askArgs(askOne, root, name);
    if (args === null || args === CANCELLED) {
      console.log('\n(그만둔다 — 아무것도 안 했다)');
      return 0;
    }

    /* ⛔ **여기가 핵심이다** — 실행 전에 만든 명령줄을 찍는다. 그래야 다음엔 외운다.
       ⚠️ 그러니 **도는 것을 찍어야 한다.** `universe` 가 PATH 에 없으면 그 이름을 가르치는 것은
          거짓말이다 — 실제로 도는 형태로 찍는다(`invocationLabel`). */
    const how = invocationLabel(await resolveOnPath('universe'), packageHome);
    const shown = [how, name, ...args].map((token) => (/\s/.test(token) ? `"${token}"` : token)).join(' ');
    console.log(`\n$ ${shown}\n`);
    if ((await askYes(askOne, '이대로 실행할까?')) !== true) {
      console.log('(그만둔다 — 위 명령을 직접 쳐도 된다)');
      return 0;
    }
    rl?.close();

    const target = path.join(packageHome, subcommands[name]);
    if (injectedRun) {
      return injectedRun({ name, args, target, shown });
    }
    const runner = target.endsWith('.sh') ? 'bash' : process.execPath;
    return await new Promise((resolve) => {
      const child = spawn(runner, [target, ...args], { stdio: 'inherit', cwd: root });
      child.on('close', (code) => resolve(code ?? 1));
      child.on('error', () => resolve(1));
    });
  } finally {
    rl?.close();
  }
};
