#!/usr/bin/env node
/**
 * `universe init` — 소비 저장소에 우주를 깐다.
 *
 *   universe init [--dir universe] [--force] [--dry-run]
 *
 * ## 무엇을 까는가
 * **법칙과 관측소와 궤도만** 깐다. 은하·성운·로그는 빈 틀로 만든다 —
 * 그것은 당신 저장소의 것이라 **배달되지 않는다**(보존 법칙).
 *
 * ⚠️ 카카시 하네스의 씨앗에는 에이전트가 **하나(tamer)** 뿐이다 — 에이전트는 도메인에 매여
 *    있어서다. 이 우주는 거기서 갈라진다: **법칙은 배달한다.** 프론트엔드 규칙은 도메인 무관이다.
 */
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { packageHome } from '../lib/home.mjs';
import { classifyBlind, READABLE, CODE_BUT_BLIND } from '../lib/blind.mjs';
import { DELIVERED, isJunk } from '../lib/delivered.mjs';
import { mergeCatalogues } from '../lib/laws-merge.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';

const argv = process.argv.slice(2);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const has = (n) => argv.includes(n);
/* ⛔ 실측(R91): `universe init --존재하지않는플래그` 가 **조용히 삼켜졌다.** §7 이 있는 바로
   그 이유인데(안 켜진 모드가 켜진 것처럼 보인다) 이 진입점만 빠져 있었다. */
rejectUnknownFlags(argv, ['--dir', '--force', '--dry-run', '--update', '--scripts'], 'universe init');

const exists = (p) => fs.stat(p).then(() => true).catch(() => false);

const dir = flag('--dir') ?? 'universe';
const target = path.resolve(process.cwd(), dir);
/**
 * ⚠️ **저장소 밖에 깔면 조용히 다 어긋난다**(실측 R77: `--dir ../탈출우주` 가 밖에 깔렸다).
 * 커밋 관문(`core.hooksPath`)도, `universe/` 를 git 에 올리라는 안내도, 배달본 갱신도
 * **전부 이 저장소를 전제**한다. ⛔ 막지는 않는다 — 일부러 그러는 사람이 있을 수 있다.
 * 다만 **조용히 지나가지 못하게** 한다(R65 의 규율).
 */
if (!target.startsWith(`${process.cwd()}${path.sep}`)) {
  console.log(`⚠️ **이 저장소 밖에 깐다**: ${target}`);
  console.log('   커밋 관문·`universe/` 를 git 에 올리라는 안내·배달본 갱신은 전부 이 저장소를 전제한다.');
  console.log('   일부러가 아니면 `--dir` 없이 다시 깔아라.\n');
}
/**
 * ⛔ **git 저장소가 아니면 커밋 관문이 못 돈다(R123).** 실측: 아무 폴더에서 `init` 을 쳤더니
 * 조용히 깔리고 `.githooks` 를 「커밋 관문」이라 소개했다 — **켤 수 없는 것을 준 것이다.**
 * 막지는 않는다(일부러 그러는 사람이 있다). **조용히 지나가지 못하게** 할 뿐이다(R65 의 규율).
 */
/* ⚠️ **cwd 가 아니라 깔리는 자리를 본다(R123).** 훅은 `--dir` 로 지정한 그 저장소에 걸린다 —
   우주 저장소 안에서 남의 폴더에 깔면 cwd 만 보고는 「git 이 있다」고 착각한다. */
const inGitRepo = await new Promise((resolve) => {
  const child = spawn('git', ['rev-parse', '--git-dir'], { cwd: path.dirname(target), stdio: 'ignore' });
  child.on('close', (code) => resolve(code === 0));
  child.on('error', () => resolve(false));
});
if (!inGitRepo) {
  console.log('⚠️ **여기는 git 저장소가 아니다.** 커밋 관문(`.githooks`)은 깔려도 **못 돈다** —');
  console.log('   `universe hooks --install` 도 걸 자리가 없다. 우주의 나머지는 그대로 쓴다.\n');
}

const dryRun = has('--dry-run');
/* ⛔ **남의 `package.json` 은 플래그가 있어야 고친다** — 두 겹 자물쇠(`repeat --fix` 와 같다). */
const wantScripts = has('--scripts');
/* ⚠️ target 이 cwd 와 같으면 `path.relative` 가 빈 문자열이라 「이미 있다: /」가 됐다(R91). */
const rel = (p) => path.relative(process.cwd(), p) || p;

/**
 * ⛔⛔ **우주 저장소 안에는 안 깐다 — 여기는 경고가 아니라 거절이다.**
 *
 * ## 왜 위의 둘(저장소 밖 · git 아님)과 다르게 막는가
 *
 * 그 둘은 「일부러 그러는 사람이 있을 수 있다」가 참이라 **말만 하고 지나간다**(R65).
 * 이것은 다르다 — **여기는 이미 우주다.** 우주 안에 우주를 까는 것은 뜻이 없고,
 * 실측으로 **하루에 두 번** 사고가 났다(둘 다 그럴 의도가 아니었다):
 *   · 배달본 실패를 재현하려다 도구가 저장소 루트에서 돌았다
 *   · 대화형 메뉴에서 **1번(그냥 엔터)** 이 `init` 이라 사용자가 눌렀다
 *
 * ## 무엇이 망가지나 — 조용하지 않다
 *   · `universe/` 1MB 가 워킹트리에 생기고 `.gitignore` 가 바뀐다
 *   · 구조 그림(`docs/08-architecture.md`)이 그 폴더를 그려 관문이 빨간불이 된다
 *   · ⛔ **변이 하나가 안 물게 됐다** — 복제된 `orbits/round.md` 가 그림 참조를 하나 더
 *     만들어서 「고아 그림」 변이가 물지 않았다. 검사가 **조용히 장식이 됐다.**
 *     그것이 이 사고의 진짜 값이다. 워킹트리가 더러운 것은 눈에 보이지만 이것은 안 보인다.
 *
 * ⛔ **`--force` 로도 못 뚫는다.** 넘길 수 있는 관문은 넘겨진다 — 그리고 이건 넘겨서 얻을 것이 없다.
 * ⚠️ 신호는 **구조**로 잡는다: 엔진 소스는 배달되지 않으므로 그것이 있으면 여기가 우주다
 *    (`bin/check.mjs` 의 `isUniverseRepo` 와 **같은 신호**를 쓴다 — 두 자리가 갈리면 안 된다).
 *
 * ## ⚠️ 겨냥은 **`--dir` 을 안 준 기본 자리**다 — 처음엔 cwd 로 잡았다가 틀렸다
 *
 * 첫 판은 「cwd 가 우주 저장소면 거절」이었는데, 그러면 `--dir` 로 **다른 자리**를 겨눈
 * 호출까지 막았다(`--dir /tmp/…` 로 「git 이 아니다」를 재는 시험 둘이 죽었다).
 * ⛔ 이 저장소는 R123 에서 바로 이것을 배웠다 — 「**cwd 가 아니라 깔리는 자리를 본다**」.
 *    바로 위 git 검사가 그래서 `path.dirname(target)` 을 본다. **내가 그걸 되풀이했다.**
 * ⇒ `--dir` 을 **명시한 것은 일부러다**(R65 의 규율 — 일부러 그러는 사람이 있을 수 있다).
 *   막는 것은 **그냥 `universe init`** 뿐이고, 실측 사고 셋이 전부 그 모양이었다.
 */
if (!flag('--dir') && await exists(path.join(process.cwd(), 'observatory/engine'))) {
  console.error([
    '⛔ **여기가 우주 저장소다** — 우주 안에 우주를 깔지 않는다.',
    '',
    `   깔릴 뻔한 곳: ${rel(target)}/`,
    '   `init` 은 **소비 저장소**(우주를 쓰는 남의 저장소)에 까는 명령이다.',
    '',
    '   여기서 우주를 쓰려면 그냥 부르면 된다 — 이미 깔려 있다:',
    '     universe check      관문 전부',
    '     universe observe    은하의 법칙 위반을 잰다',
    '',
    '   진짜로 소비 저장소에 깔려면 **그 저장소로 가서** 부른다:',
    '     cd <당신의-저장소> && universe init',
    '',
    '   ⛔ `--force` 로는 안 뚫린다 — 이건 넘겨서 얻을 것이 없다.',
    '      정말로 이 저장소 안 어딘가에 깔아야 한다면 `--dir <경로>` 로 **자리를 대라.**',
  ].join('\n'));
  process.exit(1);
}

/**
 * ⛔ **갱신 경로가 없었다(R91).** `universe check` 는 배달본이 낡으면 「다시 깔고 나서 다시
 * 재라」고 말하는데, `init` 은 이미 있으면 거부하고 유일한 길인 `--force` 는
 * **은하·성운·로그를 지운다** — 도구가 시키는 대로 하면 그 팀의 것이 사라진다.
 * `--update` 는 **기계(DELIVERED)만** 다시 깐다. 팀의 것(EMPTY·SEEDED)은 손대지 않는다.
 */
const update = has('--update');
const already = await exists(target);
if (update && !already) {
  console.error(`갱신할 것이 없다: ${rel(target)}/ 가 아직 없다. \`universe init\` 으로 먼저 깔아라.`);
  process.exit(1);
}
if (already && !has('--force') && !update) {
  console.error([
    `이미 있다: ${rel(target)}/`,
    '',
    '  기계만 새로 받으려면 `--update` — **은하·성운·로그는 그대로 둔다**(권장).',
    '  전부 덮어쓰려면 --force. 다만 **은하·성운·로그가 지워진다** — 그것은 당신 저장소의 것이다.',
    '  다른 자리에 깔려면 --dir <경로>.',
  ].join('\n'));
  process.exit(1);
}

/** 씨앗으로 배달되는 것. 여기 없는 것은 소비 저장소가 자기 것을 만든다. */


/**
 * 빈 틀로만 만드는 것. 내용은 당신 저장소의 것이다.
 *
 * ⚠️ 성운은 여기 없다 — **두 성격이 섞여 있기 때문**이다.
 *    ① 엔진 규칙 중 주인 없는 것(은하 무관 · 배달돼야 한다)
 *    ② 그 저장소에서 관측된 것(배달되면 안 된다)
 *    그래서 성운은 `seed/nebula.md`(①만 담은 판)로 깔고, ②는 소비 저장소가 채운다.
 *    빈 틀로 깔았더니 커버리지 검사가 죽었다(실측) — 주인 없는 규칙 선언이 사라져서다.
 */
const EMPTY = [
  ['galaxies', '은하 — 법칙이 적용되는 저장소의 좌표'],
  ['log', '라운드 — 무엇을 했고 어떻게 평가했나'],
];

/** 씨앗 파일 — 원본이 아니라 배달용으로 따로 쓴 판. */
const SEEDED = [
  ['nebula/README.md', 'seed/nebula.md', '성운 — 주인 없는 규칙 선언 포함'],
  /* ⚠️ 배달 트리에 **입구가 없었다.** `docs/README.md` 가 `../README.md` 를 가리키는데
     루트 README 는 배달되지 않아 깨진 링크였고, 소비 저장소 사람은 어디부터 읽을지
     알 수 없었다. 배달본을 실제로 돌려 보고서야 드러났다. */
  ['README.md', 'seed/universe-readme.md', '입구 — 여기 있는 것과 처음 할 일'],
];

/** 배달하지 않는 것 — 있으면 오히려 해롭다. */
const EXCLUDE = new Set(['engine', 'out', 'pages.json', 'node_modules', '.DS_Store']);

const copyTree = async (from, to) => {
  const entries = (await fs.readdir(from, { withFileTypes: true })).filter((e) => !isJunk(e.name));
  for (const e of entries) {
    if (EXCLUDE.has(e.name)) {
      continue;
    }
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) {
      if (!dryRun) {
        await fs.mkdir(dst, { recursive: true });
      }
      await copyTree(src, dst);
    } else if (!dryRun) {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
      /* ⚠️⚠️ **실행 권한이 배달에서 사라진다.** 실측(2026-09-08): yarn berry 의 기본 배치(PnP)는
         꾸러미를 zip 에 둔 채 읽어 주는데 거기서 읽은 모드가 `0644` 다. 그대로 복사하면
         `.githooks/pre-commit` 이 **실행 불가**로 깔리고, `universe hooks --install` 이
         「이 저장소가 우주의 집이 맞는지 확인하라」로 죽는다 — 사유가 엉뚱해서 아무도 못 고친다.
         ⛔ 더 나쁜 갈래: 권한 없이 켜지기라도 하면 git 은 그 훅을 **말없이 안 돈다**(§8).
         ⇒ 훅은 원본 모드를 믿지 않고 못 박는다. npm·pnpm 에서는 원래 실행 권한이 살아 있다. */
      if (dst.split(path.sep).includes('.githooks')) {
        await fs.chmod(dst, 0o755);
      }
    }
  }
};

console.log(update
  ? `🌌 기계만 새로 받는다 — ${rel(target)}/ (은하·성운·로그는 그대로 둔다)\n`
  : `🌌 우주를 깐다 — ${rel(target)}/\n`);

/**
 * ⛔⛔ **선언했는데 없는 것을 조용히 건너뛰지 않는다.**
 *
 * ⚠️⚠️ 실측(2026-09-08): `lib/delivered.mjs` 의 `DELIVERED` 는 `.githooks` 를
 * **배달한다고 선언**하고 그 이유까지 적어 두었는데(「안 배달하면 죽은 규칙이 HEAD 에
 * 며칠 산다」), `package.json` 의 `files` 에는 없었다. 두 명부가 어긋난 것이다.
 * 그런데 여기서 `continue` 로 **말없이 건너뛰어서** 아무도 몰랐다 —
 * `init` 은 초록으로 끝나고, 소비 저장소에서 `universe hooks --install` 만 죽었다.
 * ⇒ 위반이 늘어난 채로 **커밋이 그냥 통과했다.** 커밋 관문은 이 제품이 「오류·배포 위험
 *   최소화」를 실제로 집행하는 장치인데, 그것이 없다는 사실을 도구가 안 알려 줬다.
 *
 * ⛔ 조용히 빼면 「몇 개가 깔렸는지」를 속이는 것이다(관측 법칙 §8).
 */
const notDelivered = [];
for (const [name, what] of DELIVERED) {
  const from = path.join(packageHome, name);
  if (!(await exists(from))) {
    notDelivered.push(name);
    console.error(`   ⛔ ${name.padEnd(12)} 배달 목록에 선언됐는데 **꾸러미에 없다** — ${what}`);
    continue;
  }
  await copyTree(from, path.join(target, name));
  console.log(`   + ${name.padEnd(12)} ${what}`);
}

if (notDelivered.length > 0) {
  console.error('');
  console.error(`⛔ 배달 목록에 선언된 ${notDelivered.length}개가 꾸러미에 없다: ${notDelivered.join(' · ')}`);
  console.error('   ⚠️ 이 우주는 **덜 깔린 것**이다 — 그 자리의 기능은 조용히 없다.');
  console.error('   ⇒ 우주 저장소의 `package.json` 의 `files` 와 `lib/delivered.mjs` 의 DELIVERED 를 맞춰라.');
  process.exit(1);
}

/**
 * ── **새 법칙은 목록에 이어 붙인다** (R119).
 *
 * ⛔ 실측: `--update` 가 `laws/derivation.md` 를 배달했는데 팀의 `universe.config.json` 에는
 * 안 넣어서, 소비 저장소가 **설명할 수 없는 빨간불 둘**을 받았다 —
 * 「파일은 있는데 config 에 없다」·「아무 은하도 켤 수 없다」.
 *
 * ⚠️ **목록은 「있다」지 「켰다」가 아니다.** 어느 은하가 켜는가는 `galaxies/*.json` 이 정하고
 * 거기는 안 건드린다 — 팀의 수는 안 움직인다(R108 에서 확인한 그 성질).
 * ⚠️ 팀이 **일부러 뺀 법칙**을 되살리는 것은 아닌가? 그럴 수 있다 — 그래서 **무엇을 이었는지
 * 말한다.** 조용히 넣지 않는다.
 */
if (update) {
  const configPath = path.join(target, 'universe.config.json');
  const theirs = JSON.parse(await fs.readFile(configPath, 'utf8').catch(() => 'null'));
  if (theirs) {
    const packaged = JSON.parse(await fs.readFile(path.join(packageHome, 'universe.config.json'), 'utf8'));
    const merged = mergeCatalogues(theirs, packaged);
    const added = Object.entries(merged.added);
    if (added.length > 0) {
      if (!dryRun) {
        await fs.writeFile(configPath, `${JSON.stringify(merged.config, null, 2)}\n`, 'utf8');
      }
      const what = added.map(([field, names]) => `${field}: ${names.join(' · ')}`).join(' | ');
      console.log(`\n   + 새 항목을 목록에 이었다 — ${what}`);
      console.log('     ⚠️ **목록에 있다는 것이지 켰다는 것이 아니다** — 켜려면 은하의 `laws` 에 적어라.');
      console.log('     일부러 뺀 것이면 다시 빼라. 조용히 넣지 않으려고 여기 적는다.');
    }
  }
}

/* ⛔ **갱신은 여기서 멈춘다.** 아래는 전부 「당신 저장소의 것」이라 덮으면 지우는 것이 된다. */
if (update) {
  console.log('\n   · 은하·성운·로그  그대로 뒀다 (당신 저장소의 것)');
  console.log('\n다음: `universe check` 로 배달본이 지금 것인지 다시 재라.');
  process.exit(0);
}

for (const [name, what] of EMPTY) {
  if (!dryRun) {
    await fs.mkdir(path.join(target, name), { recursive: true });
    await fs.writeFile(path.join(target, name, '.gitkeep'), '', 'utf8');
  }
  console.log(`   · ${name.padEnd(12)} ${what} (빈 틀)`);
}

for (const [dest, from, what] of SEEDED) {
  if (!dryRun) {
    await fs.mkdir(path.dirname(path.join(target, dest)), { recursive: true });
    await fs.copyFile(path.join(packageHome, from), path.join(target, dest));
  }
  console.log(`   + ${dest.split('/')[0].padEnd(12)} ${what}`);
}

/* config — 씨앗의 것을 그대로 쓰되 은하는 비운다. */
const config = JSON.parse(await fs.readFile(path.join(packageHome, 'universe.config.json'), 'utf8'));
config.galaxies = [];
/* ⚠️⚠️ **`attached: true` 는 거짓말이었다.** 소비 저장소에는 엔진이 배달되지 않는데(EXCLUDE)
   설정은 「연결됨」이라 적고 있었다. 실측(R43): 진짜 저장소에 깔고 안내가 시키는 3번
   `universe observe` 를 치자 **「관측 엔진을 찾지 못했다」**로 죽었다.
   엔진은 **우주 패키지**가 들고 온다 — 그래서 여기서는 아직 안 붙은 것이 맞다. */
config.observatory = {
  engine: 'fe-agent-harness',
  path: '',
  attached: false,
  '//attached': '엔진은 배달되지 않는다. 우주 패키지의 CLI 로 부르면 그쪽 엔진이 쓰인다 — `universe observe --universe <이 폴더>`.',
};
config['//observatory'] = '경로가 비면 패키지가 들고 온 엔진을 쓴다(lib/home.mjs 의 resolveEngine).';
config.created = new Date().toISOString().slice(0, 10);
if (!dryRun) {
  await fs.writeFile(path.join(target, 'universe.config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}
console.log(`   + universe.config.json  법칙 ${config.laws.length} · 궤도 ${config.orbits.length} · 은하 0`);

/* 예시는 참고용으로만 */
const example = path.join(packageHome, 'examples/galaxy.example.jsonc');
if (await exists(example)) {
  if (!dryRun) {
    await fs.mkdir(path.join(target, 'examples'), { recursive: true });
    await fs.copyFile(example, path.join(target, 'examples/galaxy.example.jsonc'));
  }
  console.log('   + examples/galaxy.example.jsonc  은하 좌표 예시');
}

if (dryRun) {
  console.log('\n(dry-run — 파일을 쓰지 않았다)');
  process.exit(0);
}

/**
 * **깐 자리가 우주가 볼 수 있는 자리인가** — 깔면서 바로 센다.
 *
 * ⚠️⚠️ 이걸 안 세서 **44% 를 못 보면서 멀쩡해 보이는 설치**가 가능했다. Nuxt 저장소에
 * 깔아 보니 코드 파일 217개 중 `.vue` 95개를 규칙이 아예 안 읽는데, 아무 말도 없었다.
 * 사람은 나중에 「위반 105건」만 보고 우주가 자기 UI 절반을 안 봤다는 걸 알 길이 없다.
 * ⇒ **설치 시점에 분모를 말한다.** 늦게 말하면 이미 기준선이 심긴 뒤다.
 */
const SKIP = new Set(['node_modules', 'coverage', dir]);

/** 상대경로별로 갈라 센다 — 갈라 놓지 않으면 생성물이 경고를 부풀린다. */
const census = async (from, acc = { seen: 0, blind: [] }) => {
  for (const entry of await fs.readdir(from, { withFileTypes: true }).catch(() => [])) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(from, entry.name);
    if (entry.isDirectory()) {
      await census(full, acc);
    } else if (READABLE.test(entry.name)) {
      acc.seen += 1;
    } else if (CODE_BUT_BLIND.test(entry.name)) {
      acc.blind.push(path.relative(process.cwd(), full));
    }
  }
  return acc;
};

const counted = await census(process.cwd());
const grouped = { 코드: [], 생성물: [], 설정: [], 스크립트: [] };
for (const file of counted.blind) {
  grouped[classifyBlind(file)].push(file);
}
const unread = grouped['코드'];
if (unread.length > 0) {
  const share = Math.round((unread.length / (counted.seen + unread.length)) * 100);
  const byExt = {};
  for (const file of unread) {
    const ext = path.extname(file);
    byExt[ext] = (byExt[ext] ?? 0) + 1;
  }
  const rest = ['생성물', '설정', '스크립트'].filter((kind) => grouped[kind].length > 0);
  /* ⚠️ **경고의 크기를 실측에 맞춘다.** 파일 한 개에 여섯 줄을 쓰면 그것도 늑대소년이다 —
     사람은 큰 경고와 작은 경고를 못 가리게 되고, 결국 둘 다 안 읽는다. */
  if (share === 0) {
    console.log(`\nⓘ 코드 파일 ${unread.length}개(${Object.keys(byExt).join(' · ')})는 규칙이 못 읽는다 — 전체의 1% 미만이다.`);
  } else {
  console.log([
    '',
    `⚠️ 이 저장소의 코드 파일 ${counted.seen + unread.length}개 중 **${unread.length}개(${share}%)를 지금 규칙이 못 읽는다.**`,
    `   ${Object.entries(byExt).sort((a, b) => b[1] - a[1]).map(([ext, n]) => `${ext} ${n}`).join(' · ')}`,
    '   규칙은 `.ts`·`.tsx` 만 읽는다. 못 읽는 것은 **위반이 없는 게 아니라 안 재진 것**이다.',
    ...(rest.length > 0
      ? [`   (${rest.map((kind) => `${kind} ${grouped[kind].length}개`).join(' · ')}는 규칙 대상이 아니라 위 수에서 뺐다)`]
      : []),
    `   은하 좌표에 판단을 적어라 — "blindJudged": { "${Object.keys(byExt)[0]}": "왜 안 재도 되는가" }`,
    '   적기 전에는 `universe observe` 가 초록불을 주지 않는다.',
  ].join('\n'));
  }
}

/**
 * **`.gitignore` 에 산출물을 넣어 준다.**
 *
 * ⚠️⚠️ 실측(R46): 안내는 「`.harness` 같은 산출물만 gitignore 하면 된다」고 **말만 했다.**
 * 그래서 진짜 은하에서 워킹트리가 늘 더러웠고, 게이트를 돌릴 때마다
 * **「이 빨간불이 별 때문인지 원래 그랬는지 가릴 수 없다」**가 떴다.
 * 재는 도구가 자기 산출물로 자기 측정을 오염시킨 것이다.
 * ⇒ 말하지 말고 **넣는다.** 이미 있으면 건드리지 않는다.
 */
const gitignore = path.join(process.cwd(), '.gitignore');
const IGNORE_LINE = '.harness/';
const current = await fs.readFile(gitignore, 'utf8').catch(() => null);
if (current === null) {
  await fs.writeFile(gitignore, `${IGNORE_LINE}\n`, 'utf8');
  console.log(`\n   + .gitignore  (${IGNORE_LINE} — 관측 산출물)`);
} else if (!current.split('\n').some((line) => line.trim() === IGNORE_LINE || line.trim() === '.harness')) {
  const sep = current.endsWith('\n') ? '' : '\n';
  await fs.appendFile(gitignore, `${sep}\n# 우주 — 관측 산출물(측정마다 바뀐다). 이것이 추적되면 워킹트리가 늘 더러워 게이트가 판정을 못 낸다.\n${IGNORE_LINE}\n`, 'utf8');
  console.log(`\n   ~ .gitignore  (${IGNORE_LINE} 를 더했다 — 관측 산출물)`);
} else {
  console.log(`\n   · .gitignore  (${IGNORE_LINE} 는 이미 있다)`);
}

/**
 * **`./node_modules/.bin/universe` 는 아무도 두 번 안 친다.**
 *
 * npm 스크립트 안에서는 `universe` 가 그냥 이름으로 풀린다(`node_modules/.bin` 이 PATH 에 붙는다).
 * ⛔ **`npx universe` 는 치지 마라** — 안 깐 곳에서는 npm 의 **남의 패키지**를 내려받는다.
 *    그래서 안내도 그것을 가르치지 않는다.
 *
 * ⛔⛔ **기본은 보여 주기만 한다.** 남의 `package.json` 을 말없이 고치는 것은 이 저장소가
 * `repeat --fix`·`blueprint --write` 에서 지키는 규율과 같은 자리다 — **선언 + 플래그 두 겹**이다.
 * `--scripts` 를 줘야 쓰고, **이미 있는 이름은 절대 덮지 않는다**(무엇을 건너뛰었는지 말한다).
 */
const SUGGESTED_SCRIPTS = {
  'universe:check': 'universe check',
  'universe:observe': `universe observe --universe ${dir}`,
  'universe:hooks': 'universe hooks --install',
};
{
  const pkgPath = path.join(process.cwd(), 'package.json');
  let pkg = null;
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  } catch {
    pkg = null;
  }
  if (pkg === null) {
    console.log('\n   ⚪ `package.json` 이 없거나 못 읽어 스크립트는 못 봤다 — 손으로 부르면 된다.');
  } else {
    const have = pkg.scripts ?? {};
    const add = Object.entries(SUGGESTED_SCRIPTS).filter(([k]) => have[k] === undefined);
    const kept = Object.keys(SUGGESTED_SCRIPTS).filter((k) => have[k] !== undefined);
    if (add.length === 0) {
      console.log('\n   ✅ 스크립트가 이미 있다 — 그대로 둔다.');
    } else if (!wantScripts) {
      console.log('\n   💡 `package.json` 에 이렇게 넣으면 `./node_modules/.bin/universe` 를 안 쳐도 된다:');
      for (const [k, v] of add) {
        console.log(`        "${k}": "${v}"`);
      }
      console.log('      ⛔ 지금은 **아무것도 안 썼다.** 쓰려면 `universe init --scripts`.');
      console.log('      ⚠️ yarn 은 `yarn universe check` 로 그냥 부를 수 있다 — 스크립트가 없어도 된다.');
    } else if (dryRun) {
      console.log(`\n   (dry-run) 스크립트 ${add.length}개를 넣었을 것이다.`);
    } else {
      pkg.scripts = { ...have, ...Object.fromEntries(add) };
      await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
      console.log(`\n   + package.json 의 scripts ${add.length}개`);
      for (const [k] of add) {
        console.log(`        ${k}`);
      }
      if (kept.length > 0) {
        console.log(`      ⚠️ 이미 있어 **안 건드린 것** ${kept.length}개: ${kept.join(' · ')}`);
      }
    }
  }
}

console.log([
  '',
  '다음:',
  `  1. 은하를 등록한다 — universe galaxy <이름>   ← 저장소를 읽어 초안을 만든다(못 읽은 자리는 TODO 로 남는다)`,
  '  2. universe hooks --install   ← **커밋 관문을 켠다** (깔기만 해서는 안 켜진다)',
  /* ⚠️ **깔린 폴더 안에서 `node observatory/observe.mjs` 를 치면 안 된다** — 엔진이 없다.
     우주 패키지의 CLI 로 부르고 `--universe` 로 이 폴더를 겨눠야 한다(실측 R43). */
  `  3. universe observe --universe ${dir}   ← 법칙이 무엇을 잡는지 본다 (엔진은 패키지가 들고 온다)`,
  `  4. universe observe --universe ${dir} --update   ← 기준선을 심는다`,
  '  5. universe new <은하> <태양계> <별>',
  '',
  `  ⚠️ ${dir}/ 를 git 에 올려라 — 법칙과 기준선은 팀의 합의다.`,
  '     .harness 같은 산출물만 gitignore 하면 된다.',
].join('\n'));
