#!/usr/bin/env node
/**
 * `universe galaxy <이름>` — 저장소를 읽어 **은하 좌표 초안**을 만든다.
 *
 * ⚠️⚠️ 왜 있는가: 진짜 저장소에 처음 깔았을 때(R43) 가장 큰 벽이 **40줄짜리 좌표를
 * 손으로 쓰는 것**이었다. 그때 내가 쓸 수 있었던 건 그 저장소를 이미 알았기 때문이다 —
 * 남이 깔 때는 그렇지 않다. 대부분은 `package.json` 에 이미 적혀 있다.
 *
 * ⛔ **모르는 것을 지어내지 않는다.** 읽어낸 것만 채우고, 못 읽은 자리는 `TODO:` 로 남긴다.
 * 지어내면 사람은 그것이 맞는 줄 알고 넘어가고, 관문은 엉뚱한 것을 재게 된다(R43 의 `test` 가 그랬다).
 *
 * ⛔ **폴더 이름을 열거해 태양계를 짐작하지 않는다**(관측 법칙 §9). `pages`·`features` 같은
 * 이름은 사람이 정하는 것이라 낡는다. 후보를 **보여 주고 사람이 고른다.**
 *
 *   universe galaxy <이름> [--dir <저장소경로>] [--out <파일>]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { firstFilled } from '../lib/pick.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { nameProblem } from '../lib/name.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--dir', '--out'], 'universe galaxy');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const name = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--dir'
  && argv[argv.indexOf(a) - 1] !== '--out' && argv[argv.indexOf(a) - 1] !== '--universe');
if (!name) {
  console.error('이름을 줘라: universe galaxy <이름> [--dir <저장소경로>]');
  process.exit(1);
}
/* ⛔ 이름이 곧 파일 경로가 된다 — 검사하지 않으면 **우주 밖에 파일이 생긴다**(실측 R76). */
const problem = nameProblem(name);
if (problem) {
  console.error(`⛔ 은하 이름으로 쓸 수 없다: ${name}\n   ${problem}`);
  process.exit(1);
}

const repo = path.resolve(flag('--dir') ?? process.cwd());
/* ⚠️ `--out` 을 준 사람은 **어디에 쓸지 이미 정했다.** 그런데도 우주의 집을 찾다 죽었다 —
   필요 없는 것을 요구하면 도구는 안 쓰이는 법부터 가르친다(실측 R52). 필요할 때만 찾는다. */
const home = flag('--out') ? null : await requireUniverseHome(flag('--universe'));

const pkg = await fs.readFile(path.join(repo, 'package.json'), 'utf8')
  .then((t) => JSON.parse(t))
  .catch(() => null);
if (!pkg) {
  console.error(`⛔ ${repo}/package.json 을 못 읽었다 — 프론트엔드 저장소가 맞나?`);
  process.exit(1);
}

const scripts = pkg.scripts ?? {};
const TODO = (what) => `TODO: ${what}`;

/* 스크립트는 **이름이 정확히 맞을 때만** 읽는다. 비슷한 이름을 골라 주면 엉뚱한 것을 돌린다. */
/* ⚠️ **`npm init -y` 가 심는 가짜 `test` 를 진짜로 읽었다**(실측 R52):
   `echo "Error: no test specified" && exit 1`. 그것을 `commands.test` 로 적으면
   빅뱅이 행동 계약 파일을 만들고, 러너가 없으니 **빌드가 깨진다** — R44 그대로다.
   ⛔ 이 문자열은 **npm 이 정한 것**이라 사람이 정하는 이름과 다르다(§9 의 예외). */
const NPM_PLACEHOLDER = /no test specified/;
const script = (...names) => {
  const found = names.find((n) => typeof scripts[n] === 'string' && scripts[n].trim() !== ''
    && !NPM_PLACEHOLDER.test(scripts[n]));
  return found ? `${pkg.packageManager?.startsWith('yarn') ? 'yarn' : 'npm run'} ${found}` : undefined;
};

const exists = (p) => fs.stat(path.join(repo, p)).then(() => true).catch(() => false);
/**
 * ⛔ **`src` 하나만 봤다(R129).** Next 앱은 코드가 `app/` 에 있는데 후보에 **안 올랐고**,
 * 좌표가 `./src` 로 굳어 **관측이 진짜 코드를 하나도 안 봤다** — 초록불이었다(§8).
 *
 * ⚠️ 그렇다고 `app`·`pages`·`source` 를 **열거하지 않는다**(§9 — 열거는 언제나 뒤처진다).
 * **저장소 꼭대기의 폴더 중 코드가 든 것**을 보여 주고 **사람이 고른다.**
 */
const CODE_FILE = /\.(ts|tsx|js|jsx|vue|svelte)$/;
const hasCode = async (dir) => {
  const stack = [dir];
  let seen = 0;
  while (stack.length > 0 && seen < 400) {
    const here = stack.pop();
    const entries = await fs.readdir(path.join(repo, here), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      seen += 1;
      if (e.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(e.name)) {
          stack.push(`${here}/${e.name}`);
        }
      } else if (CODE_FILE.test(e.name)) {
        return true;
      }
    }
  }
  return false;
};
const topDirs = (await fs.readdir(repo, { withFileTypes: true }).catch(() => []))
  .filter((e) => e.isDirectory() && !e.name.startsWith('.')
    && !['node_modules', 'dist', 'build', 'universe', 'docs'].includes(e.name))
  .map((e) => e.name);
const codeDirs = [];
for (const dir of topDirs) {
  if (await hasCode(dir)) {
    codeDirs.push(dir);
  }
}
/* ⛔ **모노레포의 꼭대기 폴더는 소스가 아니라 워크스페이스 그릇이다(R129).** `apps/` 를
   소스로 잡았더니 `lintTarget` 이 `./apps` 가 되어 **eslint 가 죽고 관측이 은하를 못 쟀다.**
   ⚠️ 워크스페이스가 있으면 소스는 **사람이 고른 앱 안**에 있다 — 여기서 정하지 않는다. */
const srcDir = pkg.workspaces ? undefined : (codeDirs.includes('src') ? 'src' : codeDirs[0]);

/**
 * ⛔⛔ **초안이 「코드가 없는 자리」를 가리키지 않게 한다.**
 *
 * 관측은 기본으로 `<appDir>/src` 를 훑는다. 그런데 이 도구는 **코드가 어느 폴더에 있는지
 * 이미 알아냈으면서**(`codeDirs`) 좌표에는 `src` 만 남겨 왔다. `src/` 관례를 안 쓰는
 * 저장소에서는 **훑는 곳에 파일이 0개**가 된다.
 * ⚠️ 실측: 이 저장소의 콘솔(`app/universe` — 코드가 `server/`·`web/` 에 있다)로 초안을
 *    떠 보니 좌표가 `appDir: "."` 이었고, 그대로 등록하면 훑는 곳은 `./src` 다.
 *    ⛔ 그 자리엔 아무것도 없다. 예전 관측은 그걸 **「0건」**이라고 말했다.
 *
 * ⛔ **여기서도 고르지 않는다**(§9). 찾은 것을 **전부** 싣고 왜 실었는지 적는다 —
 * 화면만 재려고 줄이는 것은 사람의 판단이다. 폴더 이름을 열거해 짐작하지 않는다.
 */
const scanDirs = pkg.workspaces || codeDirs.length === 0
  ? []
  : await (async () => {
    if (await exists('src')) {
      return []; /* 관례를 쓰는 저장소다 — 기본값이 맞다. 좌표를 더럽히지 않는다. */
    }
    const out = [];
    for (const dir of codeDirs) {
      /* 그 폴더가 다시 `src/` 를 쓰면 거기를 가리킨다 — 아니면 폴더 자체다. */
      /* eslint-disable-next-line no-await-in-loop */
      out.push(await exists(path.join(dir, 'src')) ? `${dir}/src` : dir);
    }
    return out;
  })();
const children = srcDir
  ? (await fs.readdir(path.join(repo, srcDir), { withFileTypes: true }))
      .filter((e) => e.isDirectory()).map((e) => `${srcDir}/${e.name}`)
  : [];

/**
 * **모노레포면 워크스페이스 후보를 보여 준다.**
 *
 * ⚠️⚠️ 실측(R69): 진짜 모노레포에 돌려 보니 초안이 **거의 빈손**이었다 — 루트 `package.json` 엔
 * `build`·`test`·`lint` 가 없고 `src/` 도 없다. 정보는 **워크스페이스 안**에 있는데 안 봤다.
 * ⛔ 그렇다고 **고르지 않는다** — 어느 앱이 이 은하인지는 사람이 정한다(§9 의 규율).
 * 후보와 **각자가 선언한 명령**을 보여 주는 데까지가 도구의 몫이다.
 */
const workspaceCandidates = async () => {
  if (!pkg.workspaces) { return []; }
  const globs = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces.packages ?? []);
  const found = [];
  for (const pattern of globs) {
    const base = pattern.replace(/\/\*+$/, '');
    for (const entry of await fs.readdir(path.join(repo, base), { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) { continue; }
      const dir = `${base}/${entry.name}`;
      const meta = await fs.readFile(path.join(repo, dir, 'package.json'), 'utf8')
        .then((raw) => JSON.parse(raw)).catch(() => null);
      if (!meta) { continue; }
      const declared = ['build', 'test', 'test:run', 'lint', 'typecheck']
        .filter((key) => typeof meta.scripts?.[key] === 'string');
      found.push({ dir, name: meta.name ?? dir, declared });
    }
  }
  return found;
};
const workspaces = await workspaceCandidates();

/**
 * ⛔⛔ **화면 시험 축(`commands.e2e`)을 제안한다 — 안 하면 그 축은 영원히 ⚪ 다.**
 *
 * 실측(R163): 등록된 은하 **여섯 중 하나도** `commands.e2e` 를 선언하지 않았다. 그래서
 * 사람의 계획에서 「화면 자동 테스트」 칸은 **한 번도 안 돌았고**, `universe loop` 는 늘 ⚪ 였다.
 * ⚠️ ⚪ 는 정직하지만 **너무 자주 나오면 사람이 읽지 않는 법부터 배운다.**
 * ⇒ ⚪ 를 예쁘게 찍는 대신 **⚪ 가 나오는 조건 자체를 줄인다** — 초안이 축을 제안한다.
 *
 * ⛔ **스크립트 이름을 열거하지 않는다**(§9). 이름은 사람이 정한다(`test:e2e`·`e2e`·`playwright`…).
 *   **명령의 내용**이 playwright 를 부르는지로 찾는다 — 그건 도구 이름이라 사람이 안 바꾼다.
 * ⛔ 그래도 **지어내지 않는다.** 못 찾으면 `TODO:` 로 남기고 「이 축은 안 돈다」고 말한다.
 */
const e2eScript = Object.entries(scripts).find(([, cmd]) => typeof cmd === 'string' && /playwright/.test(cmd));
const hasPlaywrightConfig = await exists('playwright.config.ts') || await exists('playwright.config.js');
/**
 * ⚠️ **리포터를 JSON 으로 바꿔 준다.** `universe loop` 는 리포트 파일을 읽는데, 팀의 스크립트는
 * 대개 사람이 보는 리포터다. 그대로 두면 「리포트를 안 남겼다」로 ⚪ 가 된다.
 * ⛔ 팀의 스크립트를 **고치지 않는다** — 좌표에만 적는다.
 */
const e2e = e2eScript
  ? `${e2eScript[1]} --reporter=json > .universe/e2e.json`
  : (hasPlaywrightConfig
    ? 'npx playwright test --reporter=json > .universe/e2e.json'
    : TODO('화면 시험(Playwright)이 없다 — `universe loop` 가 ⚪ 로 남는다. 붙이면 그 축이 돈다'));

const commands = {};
const build = script('build');
const test = script('test:run', 'test');
const lint = script('lint');
const typecheck = script('typecheck', 'type-check', 'tsc');
if (build) { commands.build = build; }
if (test) { commands.test = test; }
if (typecheck) { commands.typecheck = typecheck; }

const missing = [];
if (!build) { missing.push('build'); }
if (!test) { missing.push('test'); }

const draft = {
  name,
  description: firstFilled(pkg.description, TODO('한 줄 설명을 적어라')),
  /**
   * ⛔ **우주 안에 있는 은하면 상대 경로를 쓴다.**
   *
   * ⚠️ 실측: 우주 저장소 안(`app/universe`)을 겨눠 좌표를 만들었더니 **절대 경로**가 나왔고,
   * 그것을 커밋되는 `galaxies/` 에 쓰면 **좌표 감사가 바로 거부한다** —
   * 「그 기계에만 있는 좌표 1건. 공개 저장소에 남의 자리가 실려 나간다.」
   * ⇒ **도구가 자기 관문이 거부하는 것을 생성하고 있었다.** 그러면 사람은 손으로 고치는
   *    법부터 배우고, 손으로 고친 것은 다음 번에 또 어긋난다.
   *
   * ⛔ 밖에 있는 은하는 **절대 경로 그대로 둔다.** 상대로 바꾸면 `../../..` 가 되어
   *    남의 기계에서 못 쓰는 것은 마찬가지인데 **읽기만 더 어려워진다**(그건 `galaxies.local/` 몫이다).
   */
  path: (home && (repo === home || repo.startsWith(`${home}${path.sep}`)))
    ? path.relative(home, repo) || '.'
    : repo,
  ...(workspaces.length > 0
    ? { '//워크스페이스 후보': workspaces.map((w) => `${w.name} (${w.dir}) — ${w.declared.join(' · ') || '선언된 명령 없음'}`) }
    : {}),
  appWorkspace: pkg.workspaces ? TODO('모노레포다 — 위 후보에서 골라 이름을 적어라') : '',
  appDir: pkg.workspaces ? TODO('모노레포다 — 위 후보의 폴더를 적어라 (예: apps/web)') : '.',
  '//laws': 'form 은 opt-in 이다 — 팀의 합의가 있을 때만 켠다.',
  laws: ['tokens', 'semantics', 'naming', 'flatness', 'cohesion'],
  commands: {
    ...commands,
    ...(missing.length > 0 ? { '//없는 명령': `${missing.join(' · ')} 스크립트가 이 저장소에 없다 — 없는 명령을 지어내지 않았다. 게이트가 그만큼 덜 본다.` } : {}),
    lintJson: lint
      ? `${pkg.packageManager?.startsWith('yarn') ? 'yarn exec' : 'npx'} eslint <TARGET> --report-unused-disable-directives --format json -o <OUT>`
      : TODO('lint 스크립트가 없다 — 관문이 lint 를 못 잰다'),
    /* 화면 시험 축 — `universe loop` 가 이걸 보고 돈다. ⛔ 없으면 그 칸은 ⚪ 다(초록이 아니다). */
    e2e,
  },
  ...(scanDirs.length > 0
    ? {
      '//codeDirs': '⛔ 이 저장소는 `src/` 관례를 안 쓴다 — 안 적으면 관측이 `./src` 를 훑고 **파일 0개**를 본다. 코드가 있는 곳을 전부 실었다. **고르지 않았다** — 줄일지는 당신이 정한다.',
      codeDirs: scanDirs,
    }
    : {}),
  lintTargets: srcDir ? [{ workspace: '', target: `./${srcDir}` }] : [],
  '//thresholds': TODO('깨끗한 상태에서 빌드해 초기 로드(KB)를 재서 적어라 — 재기 전엔 못 적는다'),
  thresholds: {},
  '//solarSystems': `⛔ 짐작하지 않았다. \`${srcDir ?? 'src'}\` 아래 후보: ${children.join(' · ') || '(없음)'}`,
  solarSystems: [{ name: TODO('태양계 이름'), description: TODO('무엇을 묶는가'), srcDir: TODO('폴더 경로') }],
};

const out = flag('--out') ?? path.join(home, 'galaxies', `${name}.json`);
if (await fs.stat(out).catch(() => null)) {
  console.error(`⛔ 이미 있다: ${out}\n   덮어쓰지 않는다 — 좌표는 사람이 손본 것이라 잃으면 안 된다.`);
  process.exit(1);
}
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');

const todos = JSON.stringify(draft).match(/TODO:/g)?.length ?? 0;
console.log(`🌀 좌표 초안 — ${path.relative(process.cwd(), out)}`);
console.log(`   읽어낸 것: ${Object.keys(commands).join(' · ') || '(명령 없음)'}${srcDir ? ` · 소스 ${srcDir}/` : ''}`);

/* ⛔ **코드 폴더를 하나만 말하면 나머지는 안 보인다(R129).** Next 앱은 `app/` 에 코드가 있는데
   `src/` 만 말했고, 좌표가 `./src` 로 굳어 **관측이 진짜 코드를 하나도 안 봤다** — 초록불이었다.
   ⚠️ 고르지는 않는다. **보여 주고 사람이 정한다**(§9 — 폴더 이름은 사람이 정한다). */
if (codeDirs.length > 1) {
  console.log(`   🗂  코드가 든 꼭대기 폴더 ${codeDirs.length}개: ${codeDirs.map((d) => `${d}/`).join(' · ')}`);
  if (!e2e.startsWith('TODO:')) {
    console.log(`   🎬 화면 시험 축을 적었다 — ${e2e}`);
    console.log('      ⚠️ 리포터를 **JSON 으로 바꿔** 적었다 — `universe loop` 가 그 파일을 읽는다.');
  }
  if (scanDirs.length > 0) {
    console.log(`   📐 \`codeDirs\` 를 적었다: ${scanDirs.join(' · ')}`);
    console.log('      이 저장소엔 `src/` 가 없다 — 안 적으면 관측이 **파일 0개**를 본다.');
    console.log('      ⛔ 고르지 않았다 — 화면만 재려면 줄여라.');
  }
  console.log('      **고르지 않았다** — 태양계의 `srcDir` 에 무엇을 적을지는 당신이 정한다.');
}if (workspaces.length > 0) {
  console.log(`   🧩 모노레포다 — 워크스페이스 ${workspaces.length}개를 찾았다. **고르지 않았다**:`);
  for (const w of workspaces) {
    console.log(`      · ${w.name}  (${w.dir})  ${w.declared.join(' · ') || '선언된 명령 없음'}`);
  }
}
if (missing.length > 0) {
  console.log(`   ⚠️ 이 저장소엔 ${missing.join(' · ')} 스크립트가 **없다** — 지어내지 않았다. 게이트가 그만큼 덜 본다.`);
}
console.log(`   ⛔ 사람이 채울 자리 ${todos}곳 (\`TODO:\`) — **짐작으로 채우지 않았다.**`);
console.log(`      태양계는 특히 그렇다: 폴더 이름은 사람이 정하는 것이라 열거하면 낡는다(§9).`);
/**
 * ── **이름을 config 에 올린다** (R121).
 *
 * ⛔ 실측: 문서대로 `init` → `galaxy` → `observe` 를 쳤더니 **③이 초록불인데 아무것도 안 쟀다** —
 * 「은하 없음 — 실측할 대상이 없다」. 좌표 파일은 만들었는데 `config.galaxies` 가 비어 있었다.
 * **새 사람이 처음 걷는 길에서 「못 쟀다」가 「통과」로 보인 것**이다(§8).
 *
 * ⚠️ `--out` 으로 딴 데 쓸 때는 안 올린다 — 그건 이 우주의 은하가 아니다.
 */
if (!flag('--out')) {
  const configPath = path.join(home, 'universe.config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8').catch(() => 'null'));
  if (config && !(config.galaxies ?? []).includes(name)) {
    config.galaxies = [...(config.galaxies ?? []), name];
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    console.log(`\n   + config 의 은하 목록에 \`${name}\` 을 올렸다 — 안 올리면 관측이 **아무것도 안 재고 초록불**을 낸다.`);
  }
}

console.log(`\n   다음: ${path.relative(process.cwd(), out)} 의 TODO 를 채우고 \`universe observe --update\``);
