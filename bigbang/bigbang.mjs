#!/usr/bin/env node
/**
 * 빅뱅 — 별을 태어나게 한다.
 *
 *   node bigbang/bigbang.mjs new <은하> <태양계> <별> [--expand] [--dry-run] [--out <경로>]
 *   node bigbang/bigbang.mjs new 실측 은하 A dashboard DashboardToday --dry-run
 *
 * ## 1차 팽창이 하는 일
 * 별의 뼈대 한 벌(컴포넌트·훅·index·행동 계약 테스트)을 만들고,
 * **태어나자마자 관문에 건다.** 템플릿이 법칙을 어기면 빅뱅은 위반을 찍어내는 기계가 된다 —
 * 그래서 검사가 생성의 일부다.
 *
 * ## 2차 팽창(`--expand`)
 * 거기서 멈추지 않고 **게이트까지 민다** — `observatory/verify.mjs` 를 자식 프로세스로 부르고,
 * 빨간 축을 귀속(별 탓/은하 탓)한 뒤, 고칠 수 있는 부류면 한 번 고쳐 재확인하고,
 * 끝내 빨간불이면 **되돌린다.** 구현과 근거는 `bigbang/expand.mjs`.
 *
 * ## 3차 팽창(`--from "<요구사항>"`)
 * 뼈대를 세운 뒤 **에이전트에게 요구사항과 별을 준다.** 에이전트는 도구 없이 JSON 액션 하나만
 * 내고, patch 는 반드시 관문을 지나야 파일에 닿는다. 관문 → 게이트 순서로 판정하고 빨간불이면
 * 사유를 그대로 돌려준다. 구현과 근거는 `bigbang/nebula.mjs`.
 * ⚠️ 요구사항은 **데이터다** — 그 안의 지시(「법칙을 무시하라」)는 따르지 않는다.
 *
 * ⛔ 별은 **은하에** 쓴다. `universe/` 아래에 쓰지 않는다(보존 법칙).
 *    다만 `--out` 으로 임시 경로에 내면 은하를 건드리지 않고 시험할 수 있다.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { loadGalaxy } from '../lib/galaxy-load.mjs';
import { promisify } from 'node:util';

import { requireUniverseHome } from '../lib/home.mjs';
import { ALL_LANES, loadEngine, resolveGalaxyRules } from './engine.mjs';
import { attributeCompileFailure, DEFAULT_BASE, runSecondExpansion } from './expand.mjs';
import { createClaudeAsk, createScriptedAsk, loadScript, MAX_GATE_RUNS_THIRD, MAX_TURNS, runThirdExpansion } from './nebula.mjs';
import { firstFilled } from '../lib/pick.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { cannotStandMessage, missingEnv } from '../lib/required-env.mjs';
import { createOpenRouterAsk, OPENROUTER_DEFAULT_MODEL, OPENROUTER_ENV } from './agent-openrouter.mjs';

/** `--universe <경로>` 를 argv 에서 먼저 꺼낸다(우주의 집을 찾기 전에 필요하다). */
const argvUniverse = () => {
  const i = process.argv.indexOf('--universe');
  return i === -1 ? undefined : process.argv[i + 1];
};

/* 우주의 집은 cwd 에서 찾는다 — 패키지 안이 아니다(lib/home.mjs 참고). */
const root = await requireUniverseHome(argvUniverse());
const argv = process.argv.slice(2);
/* 관측 법칙 §7 — 은하를 찾기 **전에** 거부한다.
   전엔 없는 은하 오류가 먼저 나서 「플래그 때문에 죽었는지」를 가릴 수 없었다. */
rejectUnknownFlags(argv, ['--universe', '--from', '--expand', '--dry-run', '--out', '--model', '--agent-script', '--judge', '--no-fix', '--keep-on-fail', '--base', '--lane'], 'bigbang new');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const has = (n) => argv.includes(n);
/** 값을 받는 플래그. ⚠️ 여기 빠뜨리면 그 값이 **위치 인자로 오해**된다(예: `--base HEAD~1` 의 HEAD~1). */
const VALUE_FLAGS = ['--out', '--base', '--universe', '--from', '--model', '--agent-script', '--lane'];
const positionals = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(argv[i - 1]));

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));

/** 3차 팽창의 에이전트 모델. ⚠️ 버전 붙은 ID 를 적지 마라 — 별칭을 쓰면 세대가 올라가도 따라간다. */
const DEFAULT_MODEL = 'sonnet';

const usage = () => {
  console.error([
    '사용법: bigbang new <은하> <태양계> <별> [--from "<요구사항>"] [--expand] [--dry-run] [--out <경로>]',
    '',
    '  <은하>    galaxies/{이름}.json 에 등록된 은하',
    '  <태양계>  그 은하의 solarSystems 중 하나',
    '  <별>      PascalCase 이름 (예: DashboardToday)',
    '',
    '  --dry-run  무엇이 만들어질지만 본다 (파일을 쓰지 않는다)',
    '  --out      은하 대신 이 경로에 낸다 (시험용)',
    '',
    '  --expand        2차 팽창 — 태어난 뒤 게이트(verify.mjs)까지 돌고, 고칠 수 있으면 고친다',
    '  --from <한 줄>  3차 팽창 — 요구사항을 에이전트에게 주고, 관문 → 게이트까지 궤도를 돈다',
    '  --keep-on-fail  게이트가 빨간불이어도 별을 지우지 않는다 (기본은 되돌리기)',
    '  --no-fix        (2차) 자가 수정을 끄고 빨간불을 그대로 본다',
    '  --judge         관문/게이트의 판정 레인(LLM)까지 켠다 (기본은 결정론 레인만)',
    `  --model <별칭>  (3차) 에이전트 모델 (기본 ${DEFAULT_MODEL} · openrouter 레인은 ${OPENROUTER_DEFAULT_MODEL})`,
    `  --lane <레인>   (3차) 누가 답하는가: subscription(기본) · openrouter · script`,
    '                  ⛔ 자동으로 갈아타지 않는다 — 구독이 없어도 openrouter 로 몰래 안 넘어간다.',
    `  --base <ref>    게이트가 볼 변경분 기준 (기본 ${DEFAULT_BASE})`,
    '',
    '  --agent-script <파일>  (3차 · 시험용) 모델 대신 대본(JSONL)을 순서대로 낸다.',
    '                         ⚠️ 관문의 우회로가 아니다 — 대본의 patch 도 관문을 그대로 지난다.',
  ].join('\n'));
  process.exit(1);
};

const [command, galaxyName, solarName, starName] = positionals;
if (command !== 'new' || !galaxyName || !solarName || !starName) {
  usage();
}
if (!/^[A-Z][A-Za-z0-9]*$/.test(starName)) {
  console.error(`별 이름은 PascalCase 다: ${starName}`);
  process.exit(1);
}

/* ⚠️ `--out` 은 별을 은하 **밖**에 낸다. 그러면 게이트가 도는 곳(은하)에 별이 없으므로
   2차 팽창은 별과 아무 상관 없는 수를 재게 된다. 조용히 재느니 거절한다(관측 법칙).
   3차도 같다 — 게이트가 루프 안에 있으므로 더 세게 걸린다. */
const requirement = flag('--from');
if (requirement !== undefined && String(requirement).trim() === '') {
  console.error('⛔ --from 에 요구사항이 비어 있다. 한 줄이라도 적어라.');
  process.exit(1);
}
const wantsGate = has('--expand') || requirement !== undefined;
if (wantsGate && flag('--out')) {
  console.error(
    `⛔ ${requirement !== undefined ? '--from' : '--expand'} 과 --out 은 같이 못 쓴다.\n   게이트는 은하에서 돈다 — 은하 밖의 별을 재면 그 수치는 별의 것이 아니다.`,
  );
  process.exit(1);
}

const config = await readJson(path.join(root, 'universe.config.json'));

const galaxyFile = path.join(root, 'galaxies', `${galaxyName}.json`);
const loaded = await loadGalaxy(root, galaxyName, config.galaxies ?? []);
if (loaded.problem) {
  console.error(loaded.problem);
  process.exit(1);
}
const galaxy = loaded.galaxy;

/* ⛔ **은하가 서는지 먼저 본다**(R149) — 별을 쓰기도, 모델을 부르기도 전에.
   못 잴 것이 뻔한 곳에 사용량을 쓰지 않는다. 「못 쟀다」는 정직하지만 너무 늦다. */
const missing = missingEnv(galaxy, process.env);
if (missing.length > 0) {
  console.error(cannotStandMessage(galaxyName, missing));
  process.exit(2);
}

/**
 * **레인을 별보다 먼저 검증한다**(R153).
 *
 * ⚠️⚠️ 처음엔 레인 검사를 3차 블록 안에 뒀는데, 그 자리는 **별을 이미 쓴 뒤**였다 —
 * 키 없이 `--lane openrouter` 를 부르자 「멈춘다」고 말해 놓고 **은하에 별을 남겼다.**
 * 「못 잴 것이 뻔한 곳에 별을 쓰지 않는다」가 이 검사의 이유인데 그 이유를 스스로 어긴 것이다.
 * ⇒ 이름과 필수 환경변수는 **여기서** 본다. 만드는 것(`resolveAsk`)은 나중이어도 된다.
 */
const LANES = ['subscription', 'openrouter', 'script'];
const laneName = flag('--lane') ?? (flag('--agent-script') ? 'script' : 'subscription');
if (requirement !== undefined) {
  if (!LANES.includes(laneName)) {
    console.error(`⛔ 모르는 레인: ${laneName}\n   아는 것: ${LANES.join(' · ')}`);
    process.exit(2);
  }
  if (flag('--agent-script') && laneName !== 'script') {
    console.error(`⛔ --agent-script 를 줬는데 --lane ${laneName} 이다. 둘 중 하나만 골라라.`);
    process.exit(2);
  }
  if (laneName === 'openrouter' && !process.env[OPENROUTER_ENV]) {
    console.error(`⛔ **openrouter 레인이 서지 않는다** — \`${OPENROUTER_ENV}\` 가 비어 있다.`);
    console.error('   이것은 「못 쟀다」가 아니다 — **부르기 시작할 수도 없다는 뜻**이다.');
    console.error('   ⛔ 그래서 별을 쓰기 전에 멈춘다 — 못 잴 것이 뻔한 곳에 사용량을 쓰지 않는다.');
    console.error('   키 발급: https://openrouter.ai/keys');
    process.exit(2);
  }
}

const solar = galaxy.solarSystems.find((s) => s.name === solarName);
if (!solar) {
  console.error(`은하 ${galaxyName} 에 없는 태양계: ${solarName}\n있는 것: ${galaxy.solarSystems.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

/* 별이 앉을 자리. 은하가 `starRoot` 로 덮을 수 있다. */
/* ⛔ `??` 를 쓰면 **빈 문자열이 통과해 별이 저장소 뿌리에 떨어진다**(R46 과 같은 종류). */
const starRoot = firstFilled(galaxy.starRoot, solar.srcDir, 'src/components');
const relDir = path.join(galaxy.appDir, starRoot, starName).split(path.sep).join('/');
const targetBase = flag('--out') ? path.resolve(flag('--out')) : galaxy.path;

/* ── 템플릿을 읽어 별로 치환한다 ─────────────────────────────── */
const tplDir = path.join(root, 'bigbang/templates/star');
/**
 * **은하가 테스트를 못 돌리면 행동 계약 파일을 만들지 않는다.**
 *
 * ⚠️⚠️ 실측(R44): 진짜 저장소(bizmsg-backoffice-front)에 별을 태어나게 했더니
 * `tsc` 가 **2건으로 깨졌다** — 템플릿의 `*.test.tsx` 가 `vitest` 와
 * `@testing-library/react` 를 import 하는데 그 은하엔 **둘 다 없다**(테스트 스크립트도 없다).
 * 그런데 우주는 「✅ 태어난 별이 법칙을 지킨다」라고 말했다. 규칙만 보고 **컴파일은 안 봤다.**
 *
 * ⛔ 조용히 빼지 않는다. 행동 계약은 이 우주가 지키려는 것이라(`selftest-behavior-contract.mjs`),
 * 안 만들면 **무엇을 잃었는지 그 자리에서 말한다.** 안 말하면 다음 사람은 계약이 있는 줄 안다.
 */
const canRunTests = Boolean(galaxy.commands?.test);
const tplFiles = (await fs.readdir(tplDir))
  .filter((f) => f.endsWith('.tpl'))
  .filter((f) => canRunTests || !/\.test\./.test(f));
const files = await Promise.all(
  tplFiles.map(async (f) => ({
    path: `${relDir}/${f.replace(/\.tpl$/, '').replaceAll('__Star__', starName)}`,
    content: (await fs.readFile(path.join(tplDir, f), 'utf8')).replaceAll('__Star__', starName),
  })),
);

console.log(`💥 빅뱅 — 은하 ${galaxyName} · 태양계 ${solarName} · 별 ${starName}`);
console.log(`   자리: ${relDir}\n`);
for (const f of files) {
  console.log(`   + ${f.path}  (${f.content.split('\n').length}줄)`);
}
if (!canRunTests) {
  console.log('');
  console.log('   ⚠️ **행동 계약 파일(`*.test.tsx`)을 안 만들었다** — 이 은하는 테스트를 못 돌린다');
  console.log(`      (좌표 \`galaxies/${galaxyName}.json\` 의 \`commands.test\` 가 비어 있다).`);
  console.log('      만들면 `tsc` 가 `vitest`·`@testing-library/react` 를 못 찾아 **빌드가 깨진다**(실측).');
  console.log('      ⛔ 이 별에는 지켜 줄 계약이 없다. 테스트를 붙이고 `commands.test` 를 채워라.');
}

/* ── 태어난 별을 관문에 건다 ───────────────────────────────────
   ⚠️ 규칙 세우기는 `engine.mjs` 한 자리에만 있다 — 1차와 3차가 **같은 관문**을 걸어야 한다. */
const { contracts, harness } = await loadEngine(root, config);
const { enabled, rules } = await resolveGalaxyRules({ root, galaxy, contracts });
const reasons = contracts.runStaticRules(files, rules, ALL_LANES);

console.log(`\n── 관문 — 은하가 켠 법칙 ${enabled.length}개 · 규칙 ${rules.length}개`);
if (reasons.length === 0) {
  console.log('   ✅ 태어난 별이 법칙을 지킨다.');
} else {
  for (const r of reasons) {
    console.log(`   ❌ [${r.rule}] ${r.where}\n        ${r.evidence.slice(0, 100)}\n        → ${r.fix}`);
  }
  console.log(`\n⛔ 별이 태어나지 않았다 — 템플릿이 법칙을 어긴다(위반 ${reasons.length}건).`);
  console.log('   템플릿은 우주의 자산이다. 별을 고칠 게 아니라 `bigbang/templates/star/` 를 고쳐라.');
  process.exit(1);
}

/* ── 쓴다 ─────────────────────────────────────────────────── */
if (has('--dry-run')) {
  console.log('\n(dry-run — 파일을 쓰지 않았다)');
  if (has('--expand')) {
    /* 게이트는 워킹트리를 잰다. 쓰지 않은 별은 워킹트리에 없으므로 잴 것이 없다. */
    console.log('(--expand 는 돌지 않았다 — 별을 쓰지 않았으니 게이트가 잴 것이 없다)');
  }
  if (requirement !== undefined) {
    /* ⛔ 여기서 모델을 부르지 않는다. 고칠 별이 없는데 에이전트를 부르는 것은 토큰만 태우는 일이다. */
    console.log('(--from 은 돌지 않았다 — 고칠 별이 없다. 에이전트도 부르지 않았다)');
    console.log(`   요구사항(데이터로만 다룬다): ${requirement}`);
  }
  process.exit(0);
}

for (const f of files) {
  const abs = path.join(targetBase, f.path);
  if (await fs.stat(abs).catch(() => null)) {
    console.error(`\n⛔ 이미 있다: ${f.path}\n   빅뱅은 덮어쓰지 않는다. 지우거나 다른 이름을 써라.`);
    process.exit(1);
  }
}
/* 별이 태어나기 **전** 은하의 상태를 찍어 둔다.
   게이트가 빨간불일 때 「별 때문인가, 원래 그랬나」를 사람이 가릴 유일한 단서다.
   ⚠️ 단서일 뿐 근거가 아니다 — 근거는 깨끗한 상태에서 한 번 더 재는 것뿐이다. */
const execFileAsync = promisify(execFile);
const dirtyBefore = wantsGate
  /* ⛔ `--porcelain` 이 **반드시** 있어야 한다(R143). 없으면 `git status` 는 사람용 안내문을
     내고, 깨끗한 트리도 「On branch main / nothing to commit…」 **2줄**이 되어 「더러움 2건」으로
     읽혔다. 그러면 도구가 귀속을 포기하고 「별 때문인지 가릴 수 없다」고 말한다 —
     아무 일도 없었는데. 게다가 안내문은 **로케일을 탄다.** 소비자(expand.mjs)는 `?? 경로`
     꼴을 기대하므로 형식도 어긋나 있었다. */
  ? await execFileAsync('git', ['status', '--porcelain'], { cwd: galaxy.path })
      .then(({ stdout }) => stdout.split('\n').map((l) => l.trim()).filter(Boolean))
      .catch(() => [])
  : [];

for (const f of files) {
  const abs = path.join(targetBase, f.path);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, f.content, 'utf8');
}

console.log(`\n⭐ 별이 태어났다 — ${path.join(targetBase, relDir)}`);

/**
 * ── **끊기면 반쯤 태어난 별을 남기지 않는다** (R101).
 *
 * ⛔ 실측: 여기서 Ctrl-C 로 끊으면 파일 4개가 **완성된 것처럼 남았다.** 컴파일 관문도
 * 집안 규칙 관문도 한 번을 안 돌았는데, 다음 사람이 폴더를 열면 **다 된 별로 보인다.**
 * 「못 쟀다」가 「통과」로 보이는 그 자리다(§8) — 이번엔 파일 모양으로.
 *
 * ⚠️ **관문을 통과한 뒤에 끊는 것은 지운 이유가 없다.** 그래서 관문이 끝나면 감시를 푼다.
 * ⚠️ `--keep-on-fail` 을 준 사람은 잔해를 보려는 것이다 — 그때는 안 지운다.
 * ⚠️ `SIGKILL` 은 못 잡는다(R100 과 같다).
 */
const starHome = path.join(targetBase, relDir);
let watchingBirth = !flag('--out') && !has('--keep-on-fail');
const onInterrupt = (signal) => () => {
  if (!watchingBirth) {
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }
  watchingBirth = false;
  console.error(`\n⛔ 끊겼다 — **관문을 한 번도 안 돈 별**이라 지운다: ${starHome}`);
  console.error('   (남겨 두고 보려면 `--keep-on-fail`)');
  fsSync.rmSync(starHome, { recursive: true, force: true });
  process.exit(signal === 'SIGINT' ? 130 : 143);
};
const birthWatch = [['SIGINT', onInterrupt('SIGINT')], ['SIGTERM', onInterrupt('SIGTERM')]];
for (const [signal, handler] of birthWatch) {
  process.on(signal, handler);
}
const stopWatchingBirth = () => {
  watchingBirth = false;
  for (const [signal, handler] of birthWatch) {
    process.off(signal, handler);
  }
};

/**
 * ── **집안 규칙 관문** — 태어난 별이 **이 은하의 lint** 를 지키는가.
 *
 * ⚠️⚠️ 실측(R60): R44 에서 태어난 별이 `tsc` 는 통과했는데 그 은하의 lint 를 어겼다
 * (`simple-import-sort/exports` — `export type` 을 먼저 쓰라는 규칙).
 * 컴파일 관문은 **타입만** 봤다. 은하의 트렁크 lint error 가 11 → **12** 가 됐는데
 * 우주는 「별이 태어났다」로 끝냈다.
 *
 * ⛔ **템플릿에 남의 정렬 규칙을 박지 않는다.** 그 순서는 **그 팀의 합의**이고 은하마다 다르다.
 * ⇒ 대신 **은하의 lint 를 별의 폴더에만** 걸고, 은하가 `lintFix` 를 선언했으면
 *   **우리가 방금 쓴 파일에만** 그것을 돌린다. 남의 코드는 건드리지 않는다.
 */
const houseRules = async () => {
  const lintFix = firstFilled(galaxy.commands?.lintFix);
  const lintJson = firstFilled(galaxy.commands?.lintJson);
  if (!lintJson && !lintFix) {
    console.log('\n⚠️ **집안 규칙을 못 쟀다** — 이 은하는 `commands.lintJson` 도 `lintFix` 도 선언하지 않았다.');
    return;
  }
  const starDir = path.join(targetBase, relDir);
  const runLint = async () => {
    const out = path.join(galaxy.path, '.harness', `lint-star-${starName}.json`);
    await fs.mkdir(path.dirname(out), { recursive: true });
    const cmd = lintJson.replaceAll('<TARGET>', starDir).replaceAll('<OUT>', out)
      .replaceAll('<WORKSPACE>', galaxy.appWorkspace ?? '');
    await execFileAsync('bash', ['-c', cmd], { cwd: galaxy.path, maxBuffer: 32 * 1024 * 1024 }).catch(() => null);
    const parsed = await fs.readFile(out, 'utf8').then((raw) => JSON.parse(raw)).catch(() => null);
    /* ⛔ 파일이 없으면 **0이 아니라 「모름」**이다 — 없는 것을 통과로 세지 않는다(§8). */
    return parsed === null ? null : parsed.reduce((sum, file) => sum + file.errorCount, 0);
  };

  console.log('\n── 집안 규칙 관문 — 은하의 lint 를 **별의 폴더에만** 건다');
  let errors = lintJson ? await runLint() : null;
  if (errors === null && lintJson) {
    console.log('   ⚠️ **못 쟀다** — lint 결과를 못 읽었다(명령이 안 돌았거나 형식이 다르다).');
    return;
  }
  if (errors > 0 && lintFix) {
    console.log(`   ⚠️ error ${errors}건 — 은하의 \`lintFix\` 를 **방금 쓴 파일에만** 돌린다.`);
    const fixCmd = lintFix.replaceAll('<TARGET>', starDir).replaceAll('<WORKSPACE>', galaxy.appWorkspace ?? '');
    await execFileAsync('bash', ['-c', fixCmd], { cwd: galaxy.path, maxBuffer: 32 * 1024 * 1024 }).catch(() => null);
    errors = await runLint();

    /**
     * ⚠️⚠️ **우리가 고친 것을 다시 찍는다 — 안 하면 되돌리기가 남의 작업으로 착각한다**(R146 실측).
     *
     * 되돌리기(`revertStar`)는 「우리가 쓴 그대로인 파일만」 지운다. 게이트가 도는 몇 분 사이에
     * 사람이 고쳤을 수 있기 때문이다 — 옳은 규칙이다. 그런데 **바로 위 `lintFix` 도 별의 파일을
     * 바꾼다.** 그것을 다시 찍지 않으면 되돌리기는 그 변경을 남의 것으로 읽고 파일을 **안 지운다.**
     * 실측: 진짜 은하에서 2차 팽창이 빨간불로 끝났는데 `index.ts` 하나가 **남의 저장소에
     * 남았다** — 「빅뱅이 빨간불로 끝나면 은하에 흔적이 없다」는 불변이 깨진 것이다.
     * 우리가 낸 변경은 우리 것이다. **남의 변경만 보호한다.**
     * (`expand.mjs` 의 자가 수정 뒤에는 이 재-찍기가 이미 있었다. 1차 쪽에만 없었다.)
     */
    for (const file of files) {
      const abs = path.join(targetBase, file.path);
      file.content = await fs.readFile(abs, 'utf8').catch(() => file.content);
    }
  }
  if (errors === 0) {
    console.log('   ✅ 별이 이 은하의 집안 규칙을 지킨다.');
  } else {
    console.log(`   ⛔ **별이 집안 규칙을 어긴다** — error ${errors}건. 파일은 남겨 뒀다.`);
    console.log(`      직접 봐라: ${starDir}`);
  }
};

/**
 * ── **컴파일 관문** — 태어난 별이 은하에서 정말 서는가.
 *
 * ⚠️⚠️ R44 실측: 별이 `tsc` 를 2건으로 깼는데 1차 관문은 **✅ 법칙을 지킨다**라고 했다.
 * 규칙은 보고 **컴파일은 안 봤기** 때문이다. 픽스처에서는 영영 안 보였을 결함이다 —
 * 픽스처의 도구는 다 맞춰져 있다.
 *
 * ⛔ **명령을 지어내지 않는다.** 은하가 선언한 것만 쓴다(`typecheck` → `extraGates.typecheck` → `build`).
 * 하나도 없으면 **「못 쟀다」고 말한다** — 조용히 넘어가면 R44 가 그대로 되풀이된다.
 * ⛔ 그리고 **「명령이 실패한 것」과 「명령을 못 돌린 것」을 가른다.** 도구가 안 깔린 저장소에서
 * 별을 막으면, 우주는 자기가 못 잰 것을 남의 잘못으로 돌리는 도구가 된다.
 */
if (!flag('--out')) {
  const compileCmd = galaxy.commands?.typecheck
    ?? galaxy.commands?.extraGates?.typecheck
    ?? galaxy.commands?.build;
  if (!compileCmd) {
    console.log('\n⚠️ **컴파일을 못 쟀다** — 이 은하는 `commands.typecheck` 도 `commands.build` 도 선언하지 않았다.');
    console.log('   별이 정말 서는지는 아무도 확인하지 않았다. 좌표에 명령을 채워라.');
  } else {
    const kind = galaxy.commands?.typecheck || galaxy.commands?.extraGates?.typecheck ? '타입 검사' : '빌드(타입 검사 명령이 없어 더 무거운 쪽을 돌린다)';
    console.log(`\n── 컴파일 관문 — ${kind}: \`${compileCmd}\``);
    const started = process.hrtime.bigint();
    const result = await execFileAsync('bash', ['-c', compileCmd], { cwd: galaxy.path, maxBuffer: 32 * 1024 * 1024 })
      .then(({ stdout, stderr }) => ({ code: 0, out: `${stdout}${stderr}` }))
      .catch((error) => ({ code: error.code ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }));
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    /* 도구가 없는 것은 별의 잘못이 아니다 — 「못 쟀다」로 가른다. */
    const toolMissing = result.code === 127 || /command not found|not recognized|ENOENT/i.test(result.out);
    if (result.code === 0) {
      console.log(`   ✅ 별이 은하에서 선다 (${seconds.toFixed(1)}초).`);
      await houseRules();
      /* ⚠️ **값을 재서 말한다 — 짐작으로 권하지 않는다.** 실측(R50): 이 은하에서
         `yarn build`(=`tsc && vite build`) 10.1초 · `tsc --noEmit` 3.9초로 **2.6배**였다.
         ⛔ 그래도 명령을 지어내 주지 않는다. 타입 검사는 **더 싸지만 더 적게 본다** —
         번들러에서만 깨지는 import 는 못 본다. 무엇을 살지는 그 팀이 정한다. */
      const HEAVY_SECONDS = 5;
      if (!galaxy.commands?.typecheck && !galaxy.commands?.extraGates?.typecheck && seconds > HEAVY_SECONDS) {
        console.log(`      ⓘ 별 하나에 ${seconds.toFixed(1)}초다. 타입 검사만 도는 명령이 있으면 \`commands.typecheck\` 에 적어라 — 그만큼 가벼워진다.`);
        console.log('         다만 타입 검사는 **더 적게 본다**(번들러에서만 깨지는 것은 못 본다). 무엇을 살지는 은하가 정한다.');
      }
    } else if (toolMissing) {
      console.log(`   ⚠️ **못 쟀다** — 명령이 돌지 않았다(exit ${result.code}). 의존성이 안 깔린 저장소일 수 있다.`);
      console.log('      별을 막지 않는다. 우주가 못 잰 것을 남의 잘못으로 돌리지 않기 위해서다.');
    } else {
      console.log(result.out.split('\n').filter(Boolean).slice(-12).map((l) => `      ${l}`).join('\n'));

      /**
       * ⚠️⚠️ **빨간불에 이름을 붙이기 전에 「이것이 별의 것인가」를 묻는다**(R146 실측).
       *
       * 실측: 진짜 은하에서 `yarn build` 가 **0.2초 만에** exit 1 로 죽었다. 사유는
       * `Environment variable not found (NODE_AUTH_TOKEN)` — yarn 이 **컴파일에 들어가지도
       * 못하고** 자기 설정에서 멈춘 것이다. 그런데 화면은 「⛔ **별이 은하에서 서지 않는다**」
       * 라고 말했고, 2차 팽창은 거기서 끊겼다. 그 별은 **멀쩡히 컴파일된다**(env 를 채우고
       * 같은 명령을 돌려 반증했다). 우주가 **못 잰 것을 별의 잘못으로 돌린** 것이다.
       *
       * 위의 `toolMissing` 은 이것을 가르려던 장치인데 그물이 좁았다 — `command not found`
       * 부류만 봤다. ⛔ 그렇다고 사유 문자열을 하나씩 더 열거하지 않는다(§9 · R29 가 열거의
       * 한계를 이미 적어 뒀다). 대신 **증거로 가른다**: 컴파일러가 별을 봤다면 실패 출력에
       * **파일 경로가 나온다**(`tsc` 도 `vite` 도 그렇다). 한 줄도 안 나왔으면 컴파일이
       * 시작되지도 않은 것이고, 그러면 우리가 잰 것은 **아무것도 없다.**
       */
      const real = await fs.realpath(galaxy.path).catch(() => galaxy.path);
      const bases = real === galaxy.path ? [galaxy.path] : [galaxy.path, real];
      const { kind, paths: mentioned, starPaths } = attributeCompileFailure({ out: result.out, bases, starDir: relDir });

      if (kind === 'unmeasured') {
        console.log(`\n   ⚠️ **못 쟀다** — 명령이 exit ${result.code} 로 죽었지만(${seconds.toFixed(1)}초) 실패 출력에 **소스 파일이 한 줄도 없다.**`);
        console.log('      컴파일에 들어가기 전에 죽었다는 뜻이다 — 도구 설정·환경변수·인증 쪽을 먼저 보라.');
        console.log('      **별을 막지 않는다.** 우주가 못 잰 것을 남의 잘못으로 돌리지 않기 위해서다(§8).');
        console.log(`      별은 그대로 있다: ${path.join(targetBase, relDir)}`);
      } else if (kind === 'galaxy') {
        console.log(`\n⛔ **은하가 빨간불이다 — 별의 잘못이 아니다** (exit ${result.code} · ${seconds.toFixed(1)}초).`);
        console.log('   실패 출력에 나온 파일이 **전부 별의 폴더 밖**이다:');
        for (const p of mentioned.slice(0, 8)) {
          console.log(`     · ${p}`);
        }
        console.log('   은하를 먼저 초록불로 만든 뒤 다시 태워라. 되돌리려면:');
        console.log(`      rm -rf ${path.join(targetBase, relDir)}`);
        process.exit(1);
      } else {
        console.log(`\n⛔ **별이 은하에서 서지 않는다** (exit ${result.code} · ${seconds.toFixed(1)}초).`);
        console.log('   실패 출력이 별의 파일을 가리킨다:');
        for (const p of starPaths.slice(0, 8)) {
          console.log(`     · ${p}  ← 별`);
        }
        console.log('   파일은 남겨 뒀다 — 무엇이 깨졌는지 보라. 되돌리려면:');
        console.log(`      rm -rf ${path.join(targetBase, relDir)}`);
        process.exit(1);
      }
    }
  }
}

stopWatchingBirth();

if (!wantsGate) {
  console.log('\n다음:');
  console.log('  1. 라우트에 잇는다 (은하의 라우터)');
  console.log(`  2. node observatory/verify.mjs --galaxy ${galaxyName}   ← 게이트로 확인`);
  console.log('  3. 데이터 소스를 붙인다 (훅의 TODO)');
  if (!flag('--out')) {
    console.log(`\n  (게이트까지 자동으로 돌리려면: universe new ${galaxyName} ${solarName} ${starName} --expand)`);
    console.log(`  (요구사항까지 맡기려면:       universe new ${galaxyName} ${solarName} ${starName} --from "…")`);
  }
  process.exit(0);
}

/* ── 3차 팽창 ──────────────────────────────────────────────────────
   `--from` 이 있으면 3차가 게이트를 **자기 루프 안에서** 돈다. 2차를 이어서 부르지 않는다 —
   같은 별에 게이트를 두 벌 돌리는 것이고, 2차의 `--fix` 는 3차의 관문을 지나지 않은 수정이다. */
/**
 * **누가 답하는가 — 사람이 고른다.**
 *
 * ⛔⛔ **자동으로 갈아타지 않는다**(R153). R145 가 못 박은 것이 「모드가 바뀌는데 아무도 안 잰다」였다:
 * 예전엔 키가 환경에 있으면 조용히 과금 경로로 넘어갔다. 같은 실수를 레인에서 반복하지 않는다 —
 * `claude` 가 없다고 OpenRouter 로 **몰래 넘어가지 않는다.** 없으면 없다고 말하고 멈춘다.
 *
 * ⚠️ 레인을 **한 번 말한다.** 어느 레인으로 돌았는지는 궤적에도 남아야 하고(3차가 남긴다),
 *    화면에도 있어야 한다 — 「구독인 줄 알았는데 청구됐다」가 이 저장소가 가장 싫어하는 사건이다.
 */
const resolveAsk = async ({ scriptPath, harness }) => {
  if (laneName === 'script') {
    if (!scriptPath) {
      console.error('⛔ --lane script 는 --agent-script <파일> 이 있어야 한다.');
      process.exit(2);
    }
    console.log(`\n🛤  레인 — 대본 (모델 호출 0회): ${scriptPath}`);
    console.log('   (관문의 우회로가 아니다 — 대본의 patch 도 관문을 그대로 지난다)');
    return createScriptedAsk(await loadScript(path.resolve(scriptPath)));
  }

  if (laneName === 'openrouter') {
    const model = flag('--model') ?? OPENROUTER_DEFAULT_MODEL;
    console.log(`\n🛤  레인 — OpenRouter (**과금된다** · 구독이 아니다): ${model}`);
    return createOpenRouterAsk({
      model,
      apiKey: process.env[OPENROUTER_ENV],
      systemPrompt: await fs.readFile(harness.AGENT_PROTOCOL_PATH, 'utf8'),
    });
  }

  console.log(`\n🛤  레인 — 구독 (claude CLI · ANTHROPIC_API_KEY 를 자식에서 지운다)`);
  return createClaudeAsk({ harness, model: flag('--model') ?? DEFAULT_MODEL });
};

if (requirement !== undefined) {
  /* 레인 안내는 `resolveAsk` 한 자리에서만 한다 — 두 곳에서 말하면 갈린다. */
  const ask = await resolveAsk({ scriptPath: flag('--agent-script'), harness });

  process.exit(
    await runThirdExpansion({
      root,
      galaxyName,
      galaxy,
      solarName,
      files,
      relDir,
      starName,
      targetBase,
      requirement,
      contracts,
      harness,
      rules,
      ask,
      model: flag('--model') ?? DEFAULT_MODEL,
      base: flag('--base') ?? DEFAULT_BASE,
      judge: has('--judge'),
      keepOnFail: has('--keep-on-fail'),
      maxTurns: MAX_TURNS,
      maxGateRuns: MAX_GATE_RUNS_THIRD,
      dirtyBefore,
    }),
  );
}

/* ── 2차 팽창 ──────────────────────────────────────────────────── */
process.exit(
  await runSecondExpansion({
    root,
    galaxyName,
    galaxy,
    files,
    relDir,
    starName,
    targetBase,
    base: flag('--base') ?? DEFAULT_BASE,
    judge: has('--judge'),
    keepOnFail: has('--keep-on-fail'),
    autoFix: !has('--no-fix'),
    dirtyBefore,
  }),
);
