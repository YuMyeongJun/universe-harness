#!/usr/bin/env node
/**
 * **얼마나 못 보는지 잰다** — 아무 저장소 폴더를 받아 확장자 분포를 세고, **분모와 함께** 내놓는다.
 *
 *   node observatory/blind-census.mjs --dir <경로>
 *   node observatory/blind-census.mjs --galaxy <이름>
 *
 * ⚠️⚠️ 왜 필요한가. 이 하네스의 문서는 「어떤 프론트 프로젝트든 검수를 맡기면 코드 품질이
 * 향상된다」를 목표로 적는다. 그런데 규칙이 읽는 것은 `lib/blind.mjs` 의 한 줄뿐이다:
 * `READABLE = /\.(ts|tsx)$/`. **`.js`·`.jsx` 도 못 읽고** Vue·Svelte·Astro 는 물론이다.
 * `observe` 는 은하가 그 비율을 **판단하기 전에는**(`blindJudged`) 초록을 안 준다 — 그건 옳다.
 * ⛔ 그런데 **그 비율이 얼마나 흔한지 아무도 안 쟀다.** 안 재고 「범용」이라 적으면 그것이 거짓이다.
 *
 * ⛔⛔ **이 도구는 판단하지 않는다.** 「이 비율이면 못 쓴다」를 도구가 정하면, 사람은 그 선을
 * 넘긴 날부터 관문을 무시하는 법부터 배운다(`rules/tailwind.ts` R25 가 잡은 그 형태).
 * 여기서 하는 일은 **수를 내는 것까지**다 — 선은 사람이 긋는다(`--max-blind-share`).
 *
 * ⛔ **`READABLE` 을 넓히지 않는다.** 이번 일은 **재는 것**이지 확장자를 여는 것이 아니다.
 *    여는 것은 규칙이 그 문법을 **정말 읽을 수 있어야** 하는 일이라 훨씬 크고, 여기서 흉내내면
 *    **읽는다고 말하면서 못 읽는** 상태가 된다 — 그게 제일 나쁘다.
 *
 * 종료 코드 — 이 저장소의 어휘는 셋이다
 *   0  **잰 초록** — 분모가 서 있고 수를 냈다 (비율이 높아도 0이다 · 판단은 사람의 몫)
 *   1  **잰 빨강** — 사람이 `--max-blind-share <퍼센트>` 로 그은 선을 넘었다
 *   3  **못 쟀다**(`EXIT_UNMEASURED`) — 자리가 없거나 **코드 파일을 하나도 못 찾았다**
 *
 * ⛔⛔ **파일 0개는 「못 읽는 것 0개」가 아니라 「안 봤다」다.** 이 저장소는 파일 0개를 훑고
 *    「0건」을 기준선으로 심은 적이 있다(`galaxies/console.json` 의 `//appDir` 주석이 그 자국이다).
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { classifyBlind, notAuthored, READABLE, CODE_BUT_BLIND } from '../lib/blind.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { findGalaxyFile, loadGalaxy } from '../lib/galaxy-load.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';
import { requireUniverseHome } from '../lib/home.mjs';

/** 갈래는 넷이다 — `'코드'` 만 「안 재진 UI」다. 나머지 셋은 규칙의 대상이 아니다. */
const BLIND_KINDS = ['코드', '설정', '스크립트', '생성물'];

/**
 * 폴더 하나를 훑어 파일을 갈라 센다.
 *
 * ⛔ **생성물·설치물은 세지 않는다** — 판정은 `lib/blind.mjs` 가 한다(`notAuthored`).
 *    여기서 목록을 다시 적으면 두 자리가 조용히 갈린다(R47·R91).
 * ⛔ **자르는 것이 갈래를 나누는 것보다 먼저다.** `dist/` 안에는 `.d.ts` 가, `node_modules/`
 *    안에는 `.ts` 가 산더미라, 나중에 거르면 그것들이 **「읽었다」쪽에서 분모를 부풀린다.**
 * ⚠️ 숨은 자리(`.git`·`.next`·`.storybook` …)는 안 훑는다 — `bin/init.mjs` 의 census 와 같은 규칙이다.
 *    ⇒ 그래서 `.eslintrc.js` 같은 **숨은 설정도 안 센다**. 분모 밖이므로 비율은 안 흔들린다.
 * ⚠️ 심볼릭 링크는 따라가지 않는다(`isDirectory()` 가 false 다) — 순환하면 영영 안 끝난다.
 *
 * @param {string} root 훑을 자리(절대경로)
 * @returns {Promise<object>} 센 것. `reachable` 이 false 면 자리를 못 열었다는 뜻이다.
 */
/**
 * **git 이 무시하는 파일**을 통째로 받아 온다. ⛔ 파일마다 `git check-ignore` 를 부르지 않는다 —
 * 1,400개면 프로세스를 1,400번 띄운다. 한 번에 묻는다.
 *
 * ⚠️ **못 물었으면 `null` 이다.** 빈 집합이 아니다 — 「무시된 것이 없다」와
 * 「git 에게 못 물었다」는 다르다(§8). git 저장소가 아니거나 git 이 없을 수 있다.
 * ⛔ 파이프 뒤에서 종료코드를 읽지 않는다(관측 법칙 §3) — spawn 으로 직접 받는다.
 */
const ignoredPaths = async (root) => new Promise((resolve) => {
  const child = spawn('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'],
    { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.on('close', (code) => resolve(code === 0 ? new Set(out.split('\0').filter(Boolean)) : null));
  child.on('error', () => resolve(null));
});

export const census = async (root) => {
  const acc = {
    reachable: true,
    /** 규칙이 읽는 파일 — 확장자별. */
    readByExt: {},
    /** 코드처럼 생겼는데 규칙이 못 읽는 파일 — 갈래별 · 확장자별. */
    blindByKind: Object.fromEntries(BLIND_KINDS.map((k) => [k, {}])),
    /** 코드가 아닌 파일(`.json`·`.css`·`.md` …) — 분모 밖이지만 **보여야 전체가 보인다**. */
    notCodeByExt: {},
    /** 훑지 **않은** 자리. ⛔ 「0개였다」와 「안 봤다」를 가르려면 이것을 말해야 한다. */
    skipped: { 생성물: [], 설치물: [], 숨은자리: [] },
    /**
     * git 이 무시하는 파일 — **분모 밖**이다(버려질 코드라서). 확장자별로 세서 **보여 준다.**
     * ⛔ 조용히 빼지 않는다: 안 보이면 「원래 없었다」와 구별이 안 되고,
     *    그러면 다음 사람이 「이 저장소엔 `.mjs` 가 2개뿐이다」로 읽는다.
     */
    ignoredByExt: {},
    /** git 이 무시하는 경로 집합. **git 이 없거나 저장소가 아니면 빈 집합**이다(못 물었다는 뜻). */
    ignored: await ignoredPaths(root),
    /** ⛔ git 에게 **물을 수 있었는가.** 못 물었으면 「무시된 것이 0개」가 아니라 「모른다」다(§8). */
    askedGit: null,
  };
  acc.askedGit = acc.ignored !== null;
  if (acc.ignored === null) { acc.ignored = new Set(); }

  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
    if (entries === null) {
      /* ⛔ 못 읽은 폴더를 「빈 폴더」로 접지 않는다 — 뿌리에서 일어나면 그것은 「못 쟀다」다. */
      if (dir === root) {
        acc.reachable = false;
      }
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      /**
       * ⛔⛔ **점 규칙은 디렉터리에만 건다 — 파일에 걸면 조용히 사라진다.**
       *
       * ⚠️ 실측(R163): 이 자리가 **파일에도** 걸려 있었다. `.eslintrc.js`·`.probe.mjs` 를 둔
       * 폴더를 재니 **「코드 파일 1개 · 100.0% 를 읽는다 · 안 훑은 자리: 없다」**가 나왔다.
       * ⛔ 못 읽는 파일(`.probe.mjs`)이 **분모에서도 빠지고 「안 훑았다」에도 안 적혔다** —
       * 어느 칸에도 안 남으니 **아무도 그것이 있었다는 걸 모른다.**
       *
       * ⚠️ 옆 저장소 세션이 **다른 층에서 같은 함정**을 만났다: 변이 프로브를 `.nul-probe.mjs`
       * 로 지었더니 훑개가 건너뛰어 **검사가 조용히 안 잡혔다.** 그쪽은 「검사가 약하다」로
       * 읽을 뻔했는데 **실은 훑개의 사각**이었고, 그 김에 `.eslintrc` 류가 아예 안 훑히는
       * 진짜 사각도 드러났다. ⇒ **「변이가 대상에 도달했는가」를 안 물으면 어느 층에서든
       * 같은 거짓 음성이 난다.**
       *
       * ⇒ 숨기는 것은 **폴더**다(`.git`·`.claude`·`.cursor`). 점으로 시작하는 **파일**은
       *   설정이거나 도구이고, `classifyBlind` 가 이미 「설정」으로 갈라 준다.
       */
      if (entry.name.startsWith('.') && entry.isDirectory()) {
        {
          acc.skipped.숨은자리.push(rel);
        }
        continue;
      }
      if (entry.isDirectory()) {
        const why = notAuthored(`${rel}/`);
        if (why) {
          acc.skipped[why].push(rel);
          continue;
        }
        /* eslint-disable-next-line no-await-in-loop */
        await walk(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name) || '(확장자 없음)';
      /**
       * ⛔⛔ **git 이 무시하는 것은 분모에 넣지 않는다 — 그건 버려질 코드다.**
       *
       * ⚠️ 실측(R163): 진짜 은하에서 「못 읽는다 59개(4.2%)」가 나왔는데, 옆 저장소 세션이
       * 재보니 그중 **57개가 `e2e/__screenshots__/` 안의 일회용 QA 프로브**였다
       * (`chk-err.mjs` · `probe-404.mjs` · `qa-blue.mjs` …). 그 저장소의 `CLAUDE.md` 가
       * 그 자리를 **스크래치**라고 못 박아 두고 gitignore 하고 있었다.
       * ⇒ **「모수가 다르다」가 아니라 「한쪽은 버려질 것을 센다」**가 정확한 진술이다.
       *
       * ⛔ 그리고 더 나쁜 것: 스크래치가 분모에 들어오면 **기준선이 노이즈로 흔들린다.**
       * 프로브를 하나 만들면 늘고 지우면 준다 — **코드 품질과 무관하게.**
       * 이 하네스의 기준선은 「절대 0이 아니라 **늘었는가**」라서 그 흔들림이 그대로 판정이 된다.
       *
       * ⚠️ `.gitignore` 는 **그 저장소가 스스로 「이건 산출물이다」라고 선언한 것**이다.
       * 좌표가 따로 정의할 필요가 없는 **이미 있는 신뢰할 만한 신호**다 —
       * 이 저장소도 보존 법칙과 고아 별에서 같은 신호(`git ls-files`)를 쓴다.
       */
      if (acc.ignored.has(rel)) {
        acc.ignoredByExt[ext] = (acc.ignoredByExt[ext] ?? 0) + 1;
        continue;
      }
      if (READABLE.test(entry.name)) {
        acc.readByExt[ext] = (acc.readByExt[ext] ?? 0) + 1;
      } else if (CODE_BUT_BLIND.test(entry.name)) {
        const kind = classifyBlind(rel);
        acc.blindByKind[kind][ext] = (acc.blindByKind[kind][ext] ?? 0) + 1;
      } else {
        acc.notCodeByExt[ext] = (acc.notCodeByExt[ext] ?? 0) + 1;
      }
    }
  };

  await walk(root);
  return acc;
};

const sum = (byExt) => Object.values(byExt).reduce((a, b) => a + b, 0);

/** `{ '.js': 300 }` → `[['.js', 300]]`, 많은 것부터. **무엇부터 여는 게 값진가**를 이 순서가 말한다. */
const ranked = (byExt) => Object.entries(byExt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/**
 * 센 것 → 수. ⛔ **분모(`code`)가 0이면 비율은 숫자가 아니라 `null` 이다** — 0% 가 아니다.
 * @param {object} acc `census` 가 낸 것
 */
export const tally = (acc) => {
  const read = sum(acc.readByExt);
  const blind = sum(acc.blindByKind['코드']);
  const code = read + blind;
  return {
    read,
    blind,
    code,
    /** 못 읽는 비율. **분모가 없으면 `null`** — 「0%」로 접으면 안 봤다는 사실이 사라진다(§8). */
    share: code === 0 ? null : blind / code,
    blindByExt: ranked(acc.blindByKind['코드']),
    readByExt: ranked(acc.readByExt),
    outOfScope: Object.fromEntries(
      BLIND_KINDS.filter((k) => k !== '코드').map((k) => [k, sum(acc.blindByKind[k])]),
    ),
    notCode: sum(acc.notCodeByExt),
    notCodeByExt: ranked(acc.notCodeByExt),
  };
};

const pct = (x) => `${(x * 100).toFixed(1)}%`;

/**
 * 사람이 읽을 문장. ⛔ **분모 없이 수를 내지 않는다** —
 * 「못 읽는 것 95개」는 95/100 인지 95/10000 인지 없이는 뜻이 없다.
 *
 * @param {string} where 훑은 자리(사람에게 보일 이름)
 * @param {object} acc   `census` 가 낸 것
 * @param {{note?: string, maxShare?: number|null}} opts
 */
export const report = (where, acc, opts = {}) => {
  const t = tally(acc);
  const lines = [`── 얼마나 못 보는가 — ${where}`];
  if (opts.note) {
    lines.push(`   ${opts.note}`);
  }
  lines.push('');

  if (!acc.reachable) {
    lines.push('   ⚪ **훑지 못했다** — 그 자리를 열 수 없다.');
    lines.push('      경로를 확인하고 다시 불러라. 이것은 「못 읽는 파일 0개」가 아니다(§8).');
    return lines.join('\n');
  }

  if (t.code === 0) {
    /* ⛔⛔ 여기가 이 도구에서 제일 중요한 갈래다. 파일 0개를 훑고 「0건」을 낸 자국이
       이 저장소에 남아 있다 — 그때 그 0은 기준선으로 심겼고 아무도 안 빨개졌다. */
    lines.push('   ⚪ **코드 파일을 하나도 못 찾았다 — 안 봤다는 뜻이다.**');
    lines.push('      ⛔ 「못 읽는 것 0개」가 아니다. 분모가 0이면 비율은 숫자가 아니다(§8).');
    lines.push(`      그 밖의 파일 ${t.notCode}개는 봤다${t.notCode > 0 ? ` — ${ranked(acc.notCodeByExt).slice(0, 6).map(([e, n]) => `${e} ${n}`).join(' · ')}` : ''}.`);
    const skipped = Object.entries(acc.skipped).filter(([, v]) => v.length > 0);
    if (skipped.length > 0) {
      lines.push(`      안 훑은 자리: ${skipped.map(([k, v]) => `${k} ${v.length}곳`).join(' · ')} — 겨눈 자리가 거기뿐인지 보라.`);
    }
    return lines.join('\n');
  }

  lines.push(`   코드 파일 **${t.code}개** ← 이것이 분모다`);
  lines.push(`     ✅ 규칙이 읽는다      ${t.read}/${t.code} (${pct(t.read / t.code)})  ${t.readByExt.map(([e, n]) => `${e} ${n}`).join(' · ') || '—'}`);
  lines.push(`     ⛔ 규칙이 **못 읽는다** ${t.blind}/${t.code} (${pct(t.share)})  ${t.blindByExt.map(([e, n]) => `${e} ${n}`).join(' · ') || '—'}`);
  lines.push('');
  lines.push('   분모 밖 — 규칙의 대상이 아니라서 위 수에서 뺐다');
  lines.push(`     ${Object.entries(t.outOfScope).map(([k, n]) => `${k} ${n}`).join(' · ')} · 코드 아님 ${t.notCode}개`);
  const skipped = Object.entries(acc.skipped).filter(([, v]) => v.length > 0);
  lines.push(skipped.length > 0
    ? `     안 훑은 자리: ${skipped.map(([k, v]) => `${k} ${v.length}곳(${v.slice(0, 3).join(' · ')}${v.length > 3 ? ' …' : ''})`).join(' · ')}`
    : '     안 훑은 자리: 없다');

  /**
   * ⛔⛔ **무시한 것을 조용히 빼지 않는다.** 안 보이면 「원래 없었다」와 구별이 안 되고,
   * 그러면 다음 사람은 「이 저장소엔 `.mjs` 가 2개뿐이다」로 읽는다.
   * ⚠️ 실측(R163): 이 축을 넣기 전 「못 읽는다 59개(4.2%)」였는데 그중 **57개가
   * gitignore 된 일회용 QA 프로브**였다. 넣고 나니 **2개(0.1%)** 다.
   * ⇒ 뺀 것도 **수로 말한다.** 그래야 두 수가 왜 다른지 사람이 안다.
   */
  const ignored = ranked(acc.ignoredByExt);
  if (!acc.askedGit) {
    lines.push('     ⚪ **git 에게 못 물었다** — 무시되는 파일이 분모에 섞여 있을 수 있다.');
    lines.push('        (git 저장소가 아니거나 git 이 없다. 「무시된 것이 0개」라는 뜻이 **아니다**.)');
  } else if (ignored.length > 0) {
    const total = ignored.reduce((a, [, n]) => a + n, 0);
    lines.push(`     🚮 git 이 무시하는 것 ${total}개 — **분모 밖이다**(버려질 코드다): `
      + `${ignored.slice(0, 5).map(([e, n]) => `${e} ${n}`).join(' · ')}${ignored.length > 5 ? ' …' : ''}`);
    lines.push('        ⚠️ 이것을 분모에 넣으면 **기준선이 노이즈로 흔들린다** — 프로브를 하나');
    lines.push('           만들면 늘고 지우면 준다. **코드 품질과 무관하게.**');
  }
  lines.push('');
  lines.push('   ⛔ 못 읽는 것은 **위반이 없는 게 아니라 안 재진 것**이다.');
  lines.push('      이 도구는 여기까지다 — 「이 비율이면 못 쓴다」는 사람이 정한다.');
  if (typeof opts.maxShare === 'number') {
    const over = t.share > opts.maxShare;
    lines.push(`      당신이 그은 선: ${pct(opts.maxShare)} — ${over ? `**넘었다**(${pct(t.share)})` : `안 넘었다(${pct(t.share)})`}`);
  }
  return lines.join('\n');
};

/**
 * 판정 → 종료코드.
 * ⛔ **비율만으로는 절대 1이 되지 않는다.** 선을 안 그었으면 아무리 높아도 「잰 초록」이다 —
 *    도구가 선을 그으면 그것은 재는 것이 아니라 판단하는 것이다.
 */
export const censusExit = (acc, maxShare) => {
  const t = tally(acc);
  if (!acc.reachable || t.code === 0) {
    return EXIT_UNMEASURED;
  }
  return typeof maxShare === 'number' && t.share > maxShare ? 1 : 0;
};

/* ── 여기부터는 명령줄로 불렸을 때만 돈다. 위의 순수 함수들은 부르는 쪽이 따로 가져다 쓴다. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  /* §7 — 자리를 찾기 **전에** 모르는 플래그를 거부한다. 삼키면 안 켜진 모드가 켜진 것처럼 보인다. */
  rejectUnknownFlags(argv, ['--universe', '--galaxy', '--dir', '--max-blind-share'], 'universe blind-census');
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const dir = flag('--dir');
  const gname = flag('--galaxy');

  /* ⛔ **부르는 법이 틀린 것은 측정이 아니다.** 짐작으로 은하 하나를 고르면 사람은 자기가
     겨눈 줄 모르는 자리의 수를 읽는다 — §7 과 같은 자리에서 사유를 대고 죽는다. */
  if ((dir === undefined) === (gname === undefined)) {
    console.error('⛔ universe blind-census: 훑을 자리를 하나만 정해라 — `--dir <경로>` 또는 `--galaxy <이름>`');
    console.error('   (둘 다 주거나 둘 다 안 주면 무엇을 셌는지 사람이 못 가린다)');
    process.exit(1);
  }

  const rawMax = flag('--max-blind-share');
  let maxShare = null;
  if (rawMax !== undefined) {
    const n = Number(rawMax);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      console.error(`⛔ --max-blind-share 는 0~100 의 퍼센트다: ${rawMax}`);
      process.exit(1);
    }
    maxShare = n / 100;
  }

  let where = '';
  let note = '';
  let root = '';
  if (dir !== undefined) {
    root = path.resolve(process.cwd(), dir);
    where = root;
  } else {
    const home = await requireUniverseHome(flag('--universe'));
    const config = JSON.parse(await fs.readFile(path.join(home, 'universe.config.json'), 'utf8'));
    const loaded = await loadGalaxy(home, gname, config.galaxies ?? []);
    if (loaded.problem) {
      /* ⛔ 「없는 은하」와 「못 읽은 좌표」는 `loadGalaxy` 가 갈라서 말한다(R90). 그대로 낸다. */
      console.error(loaded.problem);
      process.exit(EXIT_UNMEASURED);
    }
    root = loaded.galaxy.path;
    const gfile = await findGalaxyFile(home, gname);
    where = `은하 ${gname} — ${root}`;
    note = `좌표: ${gfile ? path.relative(home, gfile) : '(모름)'}${loaded.galaxy.appDir ? ` · appDir: ${loaded.galaxy.appDir}` : ''}`;
  }

  const acc = await census(root);
  console.log(report(where, acc, { note, maxShare }));
  process.exit(censusExit(acc, maxShare));
}
