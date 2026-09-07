#!/usr/bin/env node
/**
 * 관측소 — 별이 법칙을 지키는지 **실제로 잰다.**
 *
 *   node observatory/observe.mjs                       모든 은하 · 켜진 법칙 전부
 *   node observatory/observe.mjs --galaxy <이름>
 *   node observatory/observe.mjs --law tokens --sample 10
 *   node observatory/observe.mjs --update              은하의 observed 를 실측으로 갱신
 *
 * 이 스크립트가 `verify-laws.sh` 와 다른 점: 저쪽은 **형식**(frontmatter·필수 절)을 보고,
 * 이쪽은 **동작**(실제 코드의 위반 건수)을 본다. 앞선 정원들이 갖지 못한 축이 이것이다.
 *
 * 종료 코드
 *   0  법칙이 규칙을 빠짐없이 덮고, 문서의 수치가 실측과 같다
 *   1  주인 없는 규칙이 있거나(커버리지 구멍), 문서 수치가 낡았다(관측 법칙 위반)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createHash } from 'node:crypto';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { loadGalaxy, saveGalaxy } from '../lib/galaxy-load.mjs';
import { openNebulaRows } from '../lib/nebula-close.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { requireUniverseHome } from '../lib/home.mjs';
import { openEngine } from '../lib/engine.mjs';

const run = promisify(execFile);

/**
 * 무엇을 쟀는지 남긴다.
 *
 * ⚠️ 실측(2026-09-04): 기준선에 `date` 와 `files` 만 남겼더니 드리프트 −4 의 원인을
 *    이틀간 못 밝혔다. `git status` 는 **HEAD 대비 워킹트리**만 본다 — 두 측정 사이의
 *    **HEAD 이동은 안 보인다.** 실제 원인은 그 사이 들어온 커밋 하나였다.
 *    그래서 커밋 SHA 와 워킹트리 오염 여부를 함께 남긴다.
 */
const provenance = async (repoRoot, target) => {
  const git = async (args) => (await run('git', args, { cwd: repoRoot }).catch(() => ({ stdout: '' }))).stdout.trim();
  const dirty = (await git(['status', '--porcelain', '--', target])).split('\n').filter(Boolean).length;
  return {
    commit: (await git(['rev-parse', 'HEAD'])) || null,
    /** 0 이 아니면 이 측정은 **커밋에 귀속시킬 수 없다** — 기준선으로 심으면 안 된다. */
    dirtyFiles: dirty,
  };
};

/**
 * 드리프트가 나면 **원인을 기계가 짚는다.**
 *
 * ⚠️ 실측(2026-09-04): 수치가 −4 달라진 원인을 이틀간 못 밝혔다. `git status` 로 「변경 없음」을
 *    확인하고 원인 미상으로 남겼는데, **git status 는 HEAD 대비 워킹트리만 본다** —
 *    두 측정 사이의 **HEAD 이동은 안 보인다.** 실제 원인은 그 사이 들어온 커밋 하나였다.
 *    그래서 이 함수가 기준선 커밋과 지금 HEAD 사이를 대신 훑는다. 사람에게 미루지 않는다.
 */
const diagnoseDrift = async (repoRoot, target, baselineCommit) => {
  const git = async (args) => (await run('git', args, { cwd: repoRoot }).catch(() => ({ stdout: '' }))).stdout.trim();

  if (!baselineCommit) {
    return ['기준선에 commit 이 없다 — 출처 기록 이전에 심어진 기준선이다. `--update` 로 다시 심어라.'];
  }
  const head = await git(['rev-parse', 'HEAD']);
  const lines = [];

  if (head === baselineCommit) {
    lines.push(`HEAD 가 기준선과 같다(${head.slice(0, 8)}) — 커밋은 원인이 아니다.`);
  } else {
    const log = await git(['log', '--oneline', `${baselineCommit}..HEAD`, '--', target]);
    if (log) {
      const commits = log.split('\n').filter(Boolean);
      lines.push(`기준선 이후 이 경로를 건드린 커밋 ${commits.length}개:`);
      for (const c of commits.slice(0, 5)) {
        lines.push(`   ${c}`);
      }
      /* 어느 파일이 얼마나 바뀌었는지까지 짚어 준다 — 여기서 대개 답이 나온다. */
      const stat = await git(['diff', '--numstat', baselineCommit, 'HEAD', '--', target]);
      const files = stat.split('\n').filter(Boolean)
        .map((l) => { const [a, d, f] = l.split('\t'); return { f, n: Number(a) + Number(d) }; })
        .filter((x) => x.f && !Number.isNaN(x.n))
        .sort((x, y) => y.n - x.n)
        .slice(0, 5);
      if (files.length) {
        lines.push('   가장 많이 바뀐 파일:');
        for (const { f, n } of files) {
          lines.push(`     ${String(n).padStart(5)}줄  ${f}`);
        }
      }
    } else {
      lines.push(`기준선 이후 HEAD 는 움직였으나(${baselineCommit.slice(0, 8)}→${head.slice(0, 8)}) 이 경로는 안 건드렸다.`);
    }
  }

  const dirty = (await git(['status', '--porcelain', '--', target])).split('\n').filter(Boolean).length;
  if (dirty > 0) {
    lines.push(`⚠️ 워킹트리에 커밋되지 않은 변경 ${dirty}건 — 지금 잰 수는 어느 커밋에도 귀속되지 않는다.`);
  }
  if (lines.length === 1 && dirty === 0) {
    lines.push('커밋도 워킹트리도 원인이 아니다 → **규칙이 바뀌었을 가능성**을 보라(엔진 selftest 와 규칙 목록).');
  }
  return lines;
};

/** 잰 대상의 지문. 파일 목록이 흔들렸는지(1227↔1228) 즉시 드러난다. */
/**
 * **무엇을 쟀는가의 지문** — 파일 **집합**이지 횟수가 아니다.
 *
 * ⚠️⚠️ 실측(R54): 중복을 안 걷어서 **법칙 수만큼 같은 파일을 세고 있었다.**
 * 그래서 `--law tokens` 로 하나만 재면 지문이 달라져 **「잰 대상이 바뀌었다」는 거짓 경고**가 떴고,
 * 은하가 법칙 하나를 켜고 끄기만 해도 같은 일이 났다 — 파일은 그대로인데.
 * 문서에 적힌 명령을 그대로 쳐 보다 드러났다.
 */
/** ⚠️ **방식에 판을 붙인다.** 안 붙이면 옛 기준선이 「대상이 바뀌었다」로 잘못 읽힌다 —
 *  파일은 그대로인데 세는 법만 바뀐 것이라 그건 거짓말이다(규칙 지문이 이미 같은 처방을 쓴다). */
const FINGERPRINT_VERSION = 'v2';
const fingerprint = (paths) => `${FINGERPRINT_VERSION}:${createHash('sha256').update([...new Set(paths)].sort().join('\n')).digest('hex').slice(0, 12)}`;

/**
 * **규칙 자체의 지문.**
 *
 * ⚠️ 왜 필요한가: 수치가 바뀌면 자동 진단이 「그 경로를 건드린 커밋」을 짚는다.
 * 그런데 **코드는 그대로인데 규칙이 넓어져서** 바뀌었을 수도 있다 —
 * 실제로 R30 에서 그랬다(`naming-intent` 를 낱말 단위로 넓히자 은하가 빨간불이 됐는데,
 * 진단은 엉뚱하게 별을 만든 커밋을 지목했다).
 * **틀린 진단은 사람이 진단을 안 믿게 만든다.**
 *
 * 규칙은 은하가 아니라 **우주에** 산다. 그래서 은하의 git 이력으로는 영영 안 보인다.
 * 규칙의 id 와 패턴을 해시해 기준선에 같이 남긴다.
 */
const rulesFingerprint = (contracts) => {
  const shape = Object.values(contracts.RULE_PRESETS).flat()
    .map((rule) => `${rule.id}:${rule.pattern?.source ?? rule.scan?.toString() ?? ''}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(shape).digest('hex').slice(0, 12);
};

/** `--universe <경로>` 를 argv 에서 먼저 꺼낸다(우주의 집을 찾기 전에 필요하다). */
const argvUniverse = () => {
  const i = process.argv.indexOf('--universe');
  return i === -1 ? undefined : process.argv[i + 1];
};

/* 우주의 집은 cwd 에서 찾는다 — 패키지 안이 아니다(lib/home.mjs 참고). */
const root = await requireUniverseHome(argvUniverse());
const argv = process.argv.slice(2);
/* ⛔ `--force` 가 목록에 없었다(R144). 그런데 **코드는 `has('--force')` 를 읽고 있었고**,
   더러운 트리에서 도구가 스스로 「굳이 심으려면 --force」라고 **권했다.**
   권한 대로 치면 「모르는 플래그」로 죽는다 — 도구가 알려 준 탈출구가 제 파서에 없었다.
   §7 이 잡아 준 것은 맞지만, 잡힌 것은 **사용자가 아니라 도구 자신의 안내**였다. */
rejectUnknownFlags(argv, ['--universe', '--update', '--galaxy', '--law', '--sample', '--why', '--force'], 'universe observe');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const has = (n) => argv.includes(n);

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));

/** 법칙 문서의 frontmatter 를 읽는다. 파서를 들이지 않는다 — 필요한 필드가 6개뿐이다. */
const readLaw = async (name) => {
  const file = path.join(root, 'laws', `${name}.md`);
  const text = await fs.readFile(file, 'utf8');
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim();
  const list = (k) => (field(k) ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    name,
    file,
    title: field('title') ?? name,
    scope: field('scope') ?? 'meta',
    optIn: field('optIn') === 'true',
    rules: list('rules'),
  };
};

const main = async () => {
  const config = await readJson(path.join(root, 'universe.config.json'));
  const laws = await Promise.all(config.laws.map(readLaw));
  const matter = laws.filter((l) => l.scope === 'matter');

  /* ── 관측 장치를 끌어온다. 경로는 config 가 들고 있다(하드코딩 금지).
        엔진은 우주 안에 벤더링돼 있으므로 config 의 경로는 **우주 루트 기준 상대**다.
        path.resolve 는 절대경로가 오면 그대로 쓰므로, 외부 엔진을 물려도 깨지지 않는다. */
  const { scan, contracts } = await openEngine(root, config, ['scan', 'contracts']);
  const { scanCodebase } = scan;

  /* ── 커버리지: 모든 규칙에 주인(법칙)이 있는가. 없으면 성운에 있어야 한다. */
  const allRules = Object.values(contracts.RULE_PRESETS).flat().map((r) => r.id);
  const owned = new Map();
  for (const law of matter) {
    for (const id of law.rules) {
      if (owned.has(id)) {
        console.log(`  ⚠️ 규칙을 두 법칙이 주장한다: ${id} (${owned.get(id)} · ${law.name})`);
      }
      owned.set(id, law.name);
    }
  }
  /**
   * **성운은 「열려 있는 줄」만 주인이다.**
   *
   * ⚠️⚠️ 그전엔 성운 파일 **전체를 문자열로** 훑었다(`includes`). 그래서
   * **닫힌 줄(취소선 · ✅ 닫힘)도 주인으로 셌다** — 규칙이 법칙을 잃고 성운 항목도 닫히면
   * 커버리지 구멍이 생기는데 화면은 「주인 없는 규칙 없음」이었다(실측 R67: 그대로 재현했다).
   * 산문·형식 예시도 함께 세고 있었다 — R66 이 로그에서 찾은 것과 **같은 종류**다.
   * ⇒ 표 줄만 보고, **닫힌 줄은 빼고** 센다.
   */
  const nebulaText = await fs.readFile(path.join(root, 'nebula/README.md'), 'utf8');
  /* ⛔ 「열린 성운 줄」의 정의가 여기와 `lib/nebula-close.mjs` 두 자리에 있었다(R108). 한 자리로 모았다. */
  const openNebula = openNebulaRows(nebulaText).join('\n');
  const orphans = allRules.filter((id) => !owned.has(id) && !openNebula.includes(id));

  let failed = false;
  console.log(`── 커버리지 — 규칙 ${allRules.length} · 법칙이 덮은 것 ${owned.size} · 성운 ${allRules.length - owned.size - orphans.length}`);
  for (const id of orphans) {
    console.log(`  ❌ 주인 없는 규칙: ${id} — 법칙으로 덮거나 성운에 올려라`);
    failed = true;
  }
  if (orphans.length === 0) {
    console.log('  ✅ 주인 없는 규칙 없음');
  }

  /**
   * **반대 방향** — 커버리지는 규칙→법칙만 봤다. 법칙 쪽에서 나가는 화살은 아무도 안 봤다.
   *
   * ⚠️ 이 세 가지는 전부 **조용히 약해지는** 고장이다.
   *   · 법칙이 없는 규칙 id 를 가리키면 → 그 법칙은 **자기가 말한 것보다 적게 막는다.**
   *   · 법칙 파일과 config 가 어긋나면 → 은하가 켤 수 없거나, 있어도 안 도는 법칙이 생긴다.
   *   · 법칙이 목차에 없으면 → **있는데 아무도 모르는 법칙**이다(실측 R56: `cohesion` 이 그랬다).
   * 셋 다 화면은 정상이다. R53 의 「명령이 문서에 없다」와 같은 방향의 고장이다.
   */
  const realRules = new Set(allRules);
  for (const law of matter) {
    const ghosts = law.rules.filter((id) => !realRules.has(id));
    if (ghosts.length > 0) {
      console.log(`  ❌ 법칙 ${law.name} 이 없는 규칙을 가리킨다: ${ghosts.join(' · ')}`);
      console.log('     그 법칙은 자기가 말한 것보다 **적게 막는다.**');
      failed = true;
    }
  }
  const lawFiles = new Set((await fs.readdir(path.join(root, 'laws')))
    .filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.replace(/\.md$/, '')));
  const declared = new Set(config.laws);
  for (const name of [...declared].filter((n) => !lawFiles.has(n))) {
    console.log(`  ❌ config 가 켠 법칙에 파일이 없다: ${name}`);
    failed = true;
  }
  for (const name of [...lawFiles].filter((n) => !declared.has(n))) {
    console.log(`  ❌ 법칙 파일이 있는데 config 에 없다: ${name} — 아무 은하도 켤 수 없다`);
    failed = true;
  }
  const lawIndex = await fs.readFile(path.join(root, 'laws/README.md'), 'utf8');
  const unlisted = [...declared].filter((n) => !new RegExp(`\\(${n}\\.md\\)`).test(lawIndex));
  if (unlisted.length > 0) {
    console.log(`  ❌ 목차(laws/README.md)에 없는 법칙: ${unlisted.join(' · ')} — 있는데 아무도 모른다`);
    failed = true;
  }
  if (!failed) {
    console.log(`  ✅ 법칙 ${declared.size}개가 실재하는 규칙만 가리키고, 파일·config·목차가 서로 맞다`);
  }

  /* ── 은하마다 실측 */
  /**
   * ⛔ **모르는 은하 이름을 삼키면 아무것도 안 재고 초록불이 난다**(실측 R77).
   * `--galaxy tiny-galexy` 라는 오타 하나에 「✅ 기준선이 실측과 같다」가 떴다 —
   * 잰 것이 하나도 없는데. §7 이 모르는 **플래그**에 하는 답을 모르는 **이름**에도 한다.
   * ⚠️ 좌표 파일이 없는 은하를 건너뛰는 것은 config 에 이름만 올라간 상태(영입 전)를 위한 것인데,
   * **사람이 이름을 짚어 물었을 때**는 그 관용이 거짓말이 된다.
   */
  const asked = flag('--galaxy');
  if (asked && !config.galaxies.includes(asked)) {
    console.error(`⛔ 그런 은하가 없다: ${asked}`);
    console.error(`   아는 은하는 이것뿐이다: ${config.galaxies.join(' · ') || '(없음)'}`);
    process.exit(1);
  }
  const galaxyNames = asked ? [asked] : config.galaxies;
  const lawFilter = flag('--law');

  if (galaxyNames.length === 0) {
    console.log('\n── 은하 없음 — 실측할 대상이 없다. 커버리지만 본다.');
    /* ⛔ **좌표 파일이 있는데 목록이 비었으면 그것은 「없는 것」이 아니라 「빠뜨린 것」이다(R121).**
       실측: 새 사람이 문서대로 `init` → `galaxy` → `observe` 를 쳤더니 **초록불인데 아무것도
       안 쟀다.** 좌표는 만들어져 있었고 `config.galaxies` 만 비어 있었다(§8). */
    const drafts = (await fs.readdir(path.join(root, 'galaxies')).catch(() => []))
      .filter((f) => f.endsWith('.json'));
    if (drafts.length > 0) {
      console.error(`     ⛔ 그런데 좌표 파일이 ${drafts.length}개 있다: ${drafts.map((f) => f.replace(/\.json$/, '')).join(' · ')}`);
      console.error('        `universe.config.json` 의 `galaxies` 에 이름을 올려라 — **안 올리면 영영 안 잰다.**');
      failed = true;
    }
  }

  for (const gname of galaxyNames) {
    /* 좌표 파일이 없는 은하는 **실측 대상이 아니다.** config 에 이름만 올라간 상태(영입 전)라
       여기서 죽으면 커버리지 검사까지 같이 죽는다 — 경고만 하고 넘어간다. */
    const gfile = path.join(root, 'galaxies', `${gname}.json`);
    if (!(await fs.stat(gfile).catch(() => null))) {
      console.log(`\n  ⚠️ 은하 ${gname} — 좌표 파일이 없다(${path.relative(root, gfile)}). 실측을 건너뛴다.`);
      if (asked) {
        console.error('     ⛔ 이름을 짚어 물었는데 잴 것이 없다 — 통과가 아니다(§8).');
        failed = true;
      }
      continue;
    }
    /* ⛔ 전엔 `readJson` 이 그대로 던져 **생 스택트레이스**로 죽었다(R90) — 사람에게
       「어느 좌표의 몇 번째 글자가 문제인지」를 아무도 안 말해 줬다. */
    const loaded = await loadGalaxy(root, gname, config.galaxies ?? []);
    if (loaded.problem) {
      console.error(`  ${loaded.problem}`);
      failed = true;
      continue;
    }
    const g = loaded.galaxy;
    /**
     * ⛔ **초안이 완성본 행세를 하면 안 된다.**
     * `universe galaxy` 는 못 읽은 자리를 `TODO:` 로 남긴다(R51). 그 채로 기준선을 심으면
     * **채우지 않은 좌표에 수치가 붙어** 다음 사람은 그것이 합의된 값인 줄 안다.
     * 관측은 재는 도구지 좌표를 완성해 주는 도구가 아니다 — 그러니 여기서 멈춘다.
     */
    /* ⚠️ **깊이까지 본다.** 처음엔 최상위만 봐서 `solarSystems[].name` 의 TODO 를 놓쳤다 —
       가장 중요한 자리(별이 어디서 태어나는가)가 바로 거기다. */
    const findTodo = (value, at = '') => {
      if (typeof value === 'string') { return value.startsWith('TODO:') ? [at] : []; }
      if (Array.isArray(value)) { return value.flatMap((v, i) => findTodo(v, `${at}[${i}]`)); }
      if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([k, v]) => findTodo(v, at ? `${at}.${k}` : k));
      }
      return [];
    };
    /**
     * **좌표가 가리키는 자리가 실재하는가.**
     *
     * ⚠️⚠️ 셋 다 **조용히 약해지는** 고장이다(R57).
     *   · 태양계 폴더가 없으면 → 별이 **빈 곳에서 태어난다.** 아무도 안 쓰는 코드가 생긴다.
     *   · lint 대상이 없으면 → eslint 가 **exit 2 로 죽고 「Oops! Something went wrong!」만 남긴다.**
     *     ⚠️ 처음엔 「0 error 를 내서 초록불이 된다」(§8)고 적었는데 **재 보니 틀렸다** —
     *     조용하지 않다. 하네스도 결과 파일이 없으면 `null`(모름)로 다룬다.
     *     값은 다른 데 있다: eslint 의 그 메시지로는 **원인을 알 수 없다.** 좌표가 먼저 짚어 준다.
     *   · 명령이 없는 스크립트를 부르면 → 게이트가 그 축을 못 잰다.
     * 폴더 이름 한 번 바꾸면 셋 다 난다. 그런데 화면은 정상이다.
     */
    /* 워크스페이스 이름 → 폴더. 모노레포가 아니면 빈 지도다. */
    const rootManifest = await fs.readFile(path.join(g.path, 'package.json'), 'utf8')
      .then((raw) => JSON.parse(raw)).catch(() => null);
    const workspaceDir = new Map();
    for (const pattern of (Array.isArray(rootManifest?.workspaces)
      ? rootManifest.workspaces
      : (rootManifest?.workspaces?.packages ?? []))) {
      const base = pattern.replace(/\/\*+$/, '');
      for (const entry of await fs.readdir(path.join(g.path, base), { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory()) { continue; }
        const meta = await fs.readFile(path.join(g.path, base, entry.name, 'package.json'), 'utf8')
          .then((raw) => JSON.parse(raw)).catch(() => null);
        if (meta?.name) { workspaceDir.set(meta.name, `${base}/${entry.name}`); }
      }
    }

    const missingPaths = [];
    const at = (rel) => path.join(g.path, g.appDir ?? '.', rel);
    /**
     * ⚠️⚠️ **lint 대상은 자기 워크스페이스 기준이다.** 그전엔 전부 `appDir` 기준으로 풀어
     * 공유 패키지의 대상이 **없는 경로여도 통과**했다 — 앱에 같은 이름의 폴더가 있으면
     * 그것을 보고 있다고 착각한다(실측 R70: `./src/components/pages` 로 재현했다).
     */
    const atWorkspace = (entry, rel) => {
      const dir = entry.workspace && workspaceDir.has(entry.workspace)
        ? workspaceDir.get(entry.workspace)
        : (g.appDir ?? '.');
      return path.join(g.path, dir, rel);
    };
    if (!(await fs.stat(g.path).catch(() => null))) {
      missingPaths.push(`path — ${g.path}`);
    } else {
      for (const s of g.solarSystems ?? []) {
        if (typeof s.srcDir === 'string' && !(await fs.stat(at(s.srcDir)).catch(() => null))) {
          missingPaths.push(`태양계 ${s.name} 의 srcDir — ${s.srcDir} (별이 빈 곳에서 태어난다)`);
        }
      }
      for (const target of g.lintTargets ?? []) {
        const rel = String(target.target ?? '').replace(/^\.\//, '');
        if (rel && !(await fs.stat(atWorkspace(target, rel)).catch(() => null))) {
          missingPaths.push(`lintTarget — ${target.workspace ? `${target.workspace} 의 ` : ''}${target.target} (eslint 가 「Oops! Something went wrong!」만 남기고 죽는다)`);
        }
      }
      /* ⛔ **간단한 형태만 본다.** `yarn build` 처럼 스크립트 하나를 부르는 것만 —
         플래그·파이프가 붙은 것은 여기서 판정할 수 없다. 못 보는 것은 못 본다고 둔다. */
      const pkgPath = path.join(g.path, 'package.json');
      const scripts = await fs.readFile(pkgPath, 'utf8')
        .then((raw) => JSON.parse(raw).scripts ?? {}).catch(() => null);
      if (scripts) {
        for (const [key, value] of Object.entries(g.commands ?? {})) {
          if (key.startsWith('//') || typeof value !== 'string') { continue; }
          const simple = /^(?:yarn|npm run)\s+([\w:.-]+)$/.exec(value.trim());
          if (simple && !(simple[1] in scripts)) {
            missingPaths.push(`commands.${key} 가 없는 스크립트를 부른다 — ${value}`);
          }
        }
      }
    }
    /**
     * **앱만 재고 공유 패키지를 빼면 초록불이 난다.**
     *
     * ⚠️⚠️ 좌표 예시가 **스스로 경고해 둔 구멍**인데(「앱만 넣고 공유 패키지를 빼면,
     * 별이 그것을 망가뜨려도 초록불이 난다」) **검사가 없었다**(실측 R70).
     * 진짜 모노레포 은하에서 앱이 워크스페이스 패키지 **셋**을 쓰는데 lint 대상엔 **하나도 없었다.**
     * ⛔ 자동으로 넣지 않는다 — 그 패키지를 이 은하가 책임지는지는 팀이 정한다.
     * 대신 **판단을 요구한다**(`blindJudged` 와 같은 방식).
     */
    if (workspaceDir.size > 0 && g.appDir && g.appDir !== '.') {
      const owned = workspaceDir;
      const appPkg = await fs.readFile(path.join(g.path, g.appDir, 'package.json'), 'utf8')
        .then((raw) => JSON.parse(raw)).catch(() => ({}));
      const deps = Object.keys({ ...(appPkg.dependencies ?? {}), ...(appPkg.devDependencies ?? {}) });
      const linted = new Set((g.lintTargets ?? []).map((entry) => entry.workspace));
      const judged = g.sharedPackagesJudged ?? {};
      const unlinted = deps.filter((name) => owned.has(name) && !linted.has(name) && !judged[name]);
      if (unlinted.length > 0) {
        console.log(`\n  ⛔ 은하 ${gname} — 앱이 쓰는 **워크스페이스 패키지 ${unlinted.length}개가 lint 밖**이다.`);
        for (const name of unlinted) {
          console.log(`     · ${name} (${owned.get(name)}) — 별이 이것을 망가뜨려도 **초록불이 난다**`);
        }
        console.log('     좌표에 넣어라: `lintTargets` 에 `{ "workspace": "<이름>", "target": "./src" }`');
        console.log('     이 은하의 몫이 아니면 그렇게 적어라: `"sharedPackagesJudged": { "<이름>": "왜 안 재는가" }`');
        failed = true;
        continue;
      }
    }

    if (missingPaths.length > 0) {
      console.log(`\n  ⛔ 은하 ${gname} — 좌표가 없는 자리를 가리킨다 ${missingPaths.length}건`);
      for (const line of missingPaths) {
        console.log(`     · ${line}`);
      }
      failed = true;
      continue;
    }

    const todoFields = findTodo(g);
    if (todoFields.length > 0) {
      console.log(`\n  ⛔ 은하 ${gname} — 좌표에 아직 안 채운 자리 ${todoFields.length}곳: ${todoFields.join(' · ')}`);
      console.log('     초안 그대로는 재지 않는다. 채우고 다시 불러라.');
      failed = true;
      continue;
    }
    const galaxyFile = gfile;
    /** 이번 실행에서 잰 값. `--update` 면 은하 파일의 기준선으로 심는다. */
    const measuredNow = {};
    let fileCountNow = 0;
    /** 코드인데 규칙이 못 읽은 파일 — 확장자별. **커버리지의 분모다**(아래 §8 주석). */
    let blindNow = [];
    /** 이 은하에서 한 번도 발동하지 않은 규칙. 0건은 무죄가 아니다. */
    const firedRules = new Set();
    const enabledRules = new Set();
    let diagnosed = false;
    const scannedPaths = [];
    const targets = g.solarSystems.map((s) => path.join(g.appDir, s.srcDir).split(path.sep).join('/'));
    const wholeApp = `${g.appDir}/src`;
    console.log(`\n── 은하 ${gname} — ${wholeApp}`);

    for (const law of matter) {
      if (!g.laws.includes(law.name)) {
        continue;
      }
      if (lawFilter && law.name !== lawFilter) {
        continue;
      }
      const rules = Object.values(contracts.RULE_PRESETS).flat().filter((r) => law.rules.includes(r.id));
      const result = await scanCodebase({
        repoRoot: g.path,
        targets: [wholeApp],
        rules,
        sampleCount: Number(flag('--sample') ?? 0),
      });

      /* ⚠️ 기준선은 **법칙이 아니라 은하**가 갖는다. 법칙 하나가 은하 N개에 걸리므로
         값 하나로는 담을 수 없다. `galaxies/{n}.json` 의 `observed.laws[법칙]` 이 정본이다. */
      const baseline = g.observed?.laws?.[law.name];
      const drift = typeof baseline === 'number' ? result.total - baseline : null;
      const mark = drift === null ? '⚠️' : drift === 0 ? '✅' : '🔴';
      const driftText = drift === null
        ? '기준선 없음 — `--update` 로 심어라'
        : drift === 0
          ? '기준선과 같다'
          : `기준선 ${baseline} → 실측 ${result.total} (${drift > 0 ? '+' : ''}${drift})`;
      console.log(`  ${mark} ${law.title.padEnd(12)} ${String(result.total).padStart(5)}건  ${driftText}`);
      for (const rule of rules) {
        enabledRules.add(rule.id);
      }
      for (const [rule, count] of result.byRule) {
        firedRules.add(rule);
        console.log(`        ${String(count).padStart(5)}  ${rule}`);
      }
      /* ⛔ **자리는 보여 주고 처방은 안 보여 줬다(R94).** R35 가 「처방 없는 관문은 무시하는
         법부터 가르친다」로 규칙마다 `fix:` 를 강제해 놨는데(`universe fix` 가 그것을 지킨다),
         정작 사람이 보는 화면에는 안 왔다. 데이터는 있었고 화면만 비어 있었다.
         ⚠️ 표본마다 반복하면 시끄럽다 — **규칙마다 한 번** 찍는다. */
      /* ⚠️ 규칙 객체는 `fix` 를 안 들고 있다 — `patternRule()` 이 흡수해 스캔이 내는
         reason 에 넣는다(실측). 그래서 표본에서 읽는다. */
      let lastRule = null;
      for (const s of result.samples) {
        if (s.rule !== lastRule) {
          lastRule = s.rule;
          const prescription = s.fix;
          console.log(`        ▸ ${s.rule}${prescription ? ` — ${prescription}` : ' (처방이 없다 — `universe fix` 가 잡아야 한다)'}`);
        }
        console.log(`          · ${s.where}\n              ${s.evidence.slice(0, 100)}`);
      }

      /* ⚠️ **드리프트가 없어도 실측은 기록한다.** 예전엔 `drift !== 0` 일 때만 담았고,
         그 결과 **드리프트가 없으면 `--update` 가 아무것도 안 썼다** — 기준선이
         새 항목(규칙 지문 같은 것)을 영영 못 얻는 구조였다. 실측으로 확인했다. */
      measuredNow[law.name] = result.total;

      if (drift !== 0) {
        failed = true;
        /* 드리프트를 처음 만났을 때 한 번만 진단한다 — 법칙마다 git 을 훑을 이유가 없다. */
        if (drift !== null && !diagnosed) {
          diagnosed = true;
          const why = await diagnoseDrift(g.path, `${g.appDir}/src`, g.observed?.commit);
          /* 규칙이 바뀌었으면 **그것부터** 말한다 — 코드 이력보다 앞선 원인이다. */
          /* ⚠️ **법칙 목록이 바뀌어도 수치는 바뀐다.** R31 이 규칙 지문을 붙이며 남긴 구멍이다 —
             은하가 법칙을 켜거나 끄면 재는 대상이 통째로 달라지는데 진단은 **코드 이력만** 짚었다.
             그러면 「그 경로를 건드린 커밋」을 아무리 뒤져도 원인이 안 나온다(실측 R74). */
          const wasLaws = g.observed?.lawsEnabled;
          if (Array.isArray(wasLaws)) {
            const added = (g.laws ?? []).filter((name) => !wasLaws.includes(name));
            const removed = wasLaws.filter((name) => !(g.laws ?? []).includes(name));
            if (added.length > 0 || removed.length > 0) {
              why.unshift(`⚠️ **은하가 켠 법칙이 바뀌었다**${added.length > 0 ? ` (켬: ${added.join(' · ')})` : ''}${removed.length > 0 ? ` (끔: ${removed.join(' · ')})` : ''} — 코드가 그대로여도 수치는 바뀐다.`);
            }
          }
          const nowRules = rulesFingerprint(contracts);
          if (g.observed?.rulesFingerprint && g.observed.rulesFingerprint !== nowRules) {
            why.unshift(`⚠️ **규칙이 바뀌었다** (${g.observed.rulesFingerprint} → ${nowRules}) — 코드가 그대로여도 수치는 바뀐다.`);
          } else if (!g.observed?.rulesFingerprint) {
            why.unshift('⚠️ 기준선에 규칙 지문이 없다 — 규칙이 바뀌었는지 알 수 없다. `--update` 로 다시 심어라.');
          }
          console.log('\n     ── 왜 달라졌나 (자동 진단)');
          for (const line of why) {
            console.log(`     ${line}`);
          }
          console.log('');
        }
      }
      fileCountNow = result.fileCount;
      blindNow = result.blind;
      scannedPaths.push(...result.paths);
    }

    /**
     * **커버리지의 분모** — 관측 법칙 §8 이 제품 층에서 난 자리다.
     *
     * ⚠️⚠️ Nuxt 저장소에 우주를 깔아 봤더니 코드 파일 217개 중 `.vue` 95개(44%)를
     * 규칙이 **아예 안 읽는데** 105건이 보고돼 정상으로 보였다. 규칙 13개 중 11개가
     * 0건인 것도 「위반 없음」으로 읽혔다. 수치가 0이 아니어서 **아무도 의심하지 않는다** —
     * 조용한 부분 실명은 0건보다 위험하다.
     * ⇒ 못 읽은 것을 세어 말하고, **은하가 그것을 판단하기 전에는 초록불을 주지 않는다.**
     */
    const blindTotal = blindNow.reduce((sum, [, n]) => sum + n, 0);
    if (blindTotal > 0) {
      const share = Math.round((blindTotal / (fileCountNow + blindTotal)) * 100);
      console.log(`\n  ⚠️ 코드인데 **규칙이 못 읽은 파일 ${blindTotal}개** (${share}%) — ${blindNow.map(([ext, n]) => `${ext} ${n}`).join(' · ')}`);
      const judged = g.blindJudged ?? {};
      const unjudged = blindNow.filter(([ext]) => !judged[ext]);
      if (unjudged.length > 0) {
        console.log(`     이 은하는 ${unjudged.map(([ext]) => ext).join(' · ')} 를 아직 판단하지 않았다.`);
        console.log(`     ${path.basename(galaxyFile)} 에 적어라 — 예: "blindJudged": { "${unjudged[0][0]}": "왜 안 재도 되는가, 아니면 언제 재게 할 것인가" }`);
        failed = true;
      } else {
        for (const [ext] of blindNow) {
          console.log(`     · ${ext} — ${judged[ext]}`);
        }
      }
    }

    /**
     * **잰 대상이 그대로인가** — 지문을 읽는다.
     *
     * ⚠️⚠️ R37 이 지문을 되살렸지만(그전엔 늘 빈 문자열의 해시였다) **아무도 읽지 않았다.**
     * 써지기만 하는 값은 죽은 값과 같다 — 되살린 자리에 소비자를 안 붙인 것이다.
     * 수치가 같아도 **잰 파일이 달라졌으면 같은 것을 잰 게 아니다.**
     * 실측(R44): 진짜 은하에 별을 태어나게 하니 파일이 1404 → 1407 이 됐는데
     * 위반은 그대로라 관측은 「기준선과 같다」만 말했다. 맞는 말이지만 **덜 말한 것**이다.
     */
    const nowFingerprint = fingerprint(scannedPaths);
    const wasFingerprint = g.observed?.fingerprint;
    const wasFiles = g.observed?.files;
    if (wasFingerprint && !wasFingerprint.startsWith(`${FINGERPRINT_VERSION}:`)) {
      console.log(`  ⓘ 지문 **방식**이 바뀌었다(R54: 중복을 걷어냈다) — 옛 지문 ${wasFingerprint} 은 지금 것과 비교할 수 없다.`);
      console.log('     이것은 「대상이 바뀌었다」가 아니다. `--update` 로 다시 심어라.');
      /* ⚠️ **방식을 말하느라 진짜 신호를 가리지 않는다.** 파일 수는 방식과 무관하게 비교된다 —
         지문을 못 믿는다고 해서 「파일이 3개 늘었다」까지 숨기면 그건 다른 종류의 거짓말이다. */
      if (typeof wasFiles === 'number' && wasFiles !== fileCountNow) {
        console.log(`     (그와 별개로 파일은 ${wasFiles} → ${fileCountNow} 로 바뀌었다 — 이건 방식과 무관하다.)`);
      }
    } else if (wasFingerprint && wasFingerprint !== nowFingerprint) {
      const delta = typeof wasFiles === 'number' ? fileCountNow - wasFiles : null;
      const how = delta === null ? '' : delta > 0 ? ` (파일 ${wasFiles} → ${fileCountNow}, +${delta})` : delta < 0 ? ` (파일 ${wasFiles} → ${fileCountNow}, ${delta})` : ' (파일 수는 같은데 **어떤 파일인지가 달라졌다**)';
      console.log(`  ⓘ 잰 대상이 바뀌었다${how} — 지문 ${wasFingerprint} → ${nowFingerprint}`);
      console.log('     수치가 같아도 **같은 것을 잰 게 아니다.** 새 코드가 법을 지켰거나, 재던 코드가 사라졌거나 둘 중 하나다.');
    }

    /* ⚠️ **써지기만 하는 값은 죽은 값이다**(R44 에서 지문이 그랬다). 올린 이력을 읽어 말한다 —
       빚은 보여야 갚는다. */
    /* ⚠️ **`--force` 의 흔적도 써지기만 하고 있었다.** `dirtyFiles` 를 기록해 놓고
       읽는 곳이 한 군데도 없었다(실측 R65) — 더러운 트리에서 심긴 기준선은
       **어느 커밋에도 귀속되지 않는데** 아무도 그 말을 안 했다. */
    if (g.observed?.dirtyFiles > 0) {
      console.log(`  ⚠️ 이 기준선은 **더러운 트리에서 심겼다**(그때 변경 ${g.observed.dirtyFiles}개 · \`--force\`).`);
      console.log('     어느 커밋에도 귀속되지 않는 수다. 깨끗한 상태에서 다시 심어라.');
    }

    const raisedLog = g.observed?.raised ?? [];
    if (raisedLog.length > 0) {
      const last = raisedLog[raisedLog.length - 1];
      console.log(`  ⓘ 이 은하는 기준선을 **${raisedLog.length}번 올렸다** — 마지막: ${last.laws.join(' · ')} (${last.why})`);
      console.log('     올린 것은 빚이다. 내려가는 방향으로 돌려놓는 것이 목표다.');
    }

    /**
     * **꺼진 법칙의 기준선이 좌표에 남는다.**
     *
     * ⚠️⚠️ R31 은 「법칙 목록이 바뀌면 수치가 바뀐다」고 적었지만 실제 모양은 달랐다(실측 R74) —
     * 법칙을 끄면 **남은 법칙의 수치는 안 변해서 드리프트가 안 난다.** 대신 그 법칙의 기준선이
     * 좌표에 **조용히 남는다.** 나중에 다시 켜면 **낡은 기준선과 견주게 되고**,
     * 그 사이 코드가 얼마나 나빠졌는지는 아무도 모른다.
     */
    const staleBaselines = Object.keys(g.observed?.laws ?? {})
      .filter((name) => !(g.laws ?? []).includes(name));
    if (staleBaselines.length > 0) {
      console.log(`  ⚠️ 이제 안 켜진 법칙의 기준선이 좌표에 남아 있다: ${staleBaselines.join(' · ')}`);
      console.log('     다시 켜면 **낡은 기준선과 견주게 된다.** 지우거나, 왜 남겨 두는지 적어라.');
    }

    const silent = [...enabledRules].filter((id) => !firedRules.has(id));
    if (silent.length > 0) {
      console.log(`  ⓘ 한 번도 발동하지 않은 규칙 ${silent.length}/${enabledRules.size}: ${silent.join(' · ')}`);
      /* ⛔ 전엔 여기서 「따로 재야 안다」로 끝났다(R93). **옳은 말이지만 답이 아니다** —
         소비 팀은 그 「따로」를 할 수 없다. 더러운 은하는 배달되지 않기 때문이다.
         발동이 증명된 규칙 명부는 배달되므로, 여기서 갈라 준다. */
      const proven = new Set(JSON.parse(
        await fs.readFile(path.join(root, 'observatory/rules-proven.json'), 'utf8').catch(() => '{}'),
      ).provenRules ?? []);
      const unproven = silent.filter((id) => !proven.has(id));
      if (proven.size === 0) {
        console.log('     0건은 무죄가 아니다 — 규칙이 약한 것인지 위반이 없는 것인지는 따로 재야 안다(§8).');
        console.log('     ⚠️ 발동 증명 명부를 못 읽었다(observatory/rules-proven.json) — 갈라 줄 수가 없다.');
      } else if (unproven.length === 0) {
        console.log(`     이 ${silent.length}개는 **더러운 은하에서 발동함이 확인된 규칙**이다 — 여기 0건은 위반이 없다는 뜻이다(§8).`);
      } else {
        console.log(`     ⛔ 그중 ${unproven.length}개는 **발동한 적이 증명되지 않았다**: ${unproven.join(' · ')}`);
        console.log('        규칙이 약한 것인지 위반이 없는 것인지 아직 모른다(§8).');
      }
      /* **일부러 더러운 은하**는 여기서 초록불을 줄 수 없다 — 그 은하의 존재 이유가
         「규칙 전부를 파이프라인에서 발동시키는 것」이라, 무발동은 곧 **그 규칙이
         파이프라인 층에서 죽었다**는 뜻이다(문자열로 먹이는 selftest 는 이 층을 못 본다). */
      if (g.expectAllRulesFire) {
        console.log('     ⛔ 이 은하는 규칙 전부가 발동해야 한다(`expectAllRulesFire`). 위 규칙은 파이프라인 층에서 죽었다.');
        failed = true;
      }
    }
    /* 기준선을 은하 파일에 심는다 — 실측의 주인은 은하다. */
    if (has('--update') && Object.keys(measuredNow).length > 0) {
      const prov = await provenance(g.path, `${g.appDir}/src`);
      if (prov.dirtyFiles > 0 && !has('--force')) {
        console.log(`\n  ⛔ 워킹트리가 오염돼 있다(${prov.dirtyFiles}개 변경). 이 측정은 커밋에 귀속시킬 수 없다.`);
        console.log('     기준선은 깨끗한 트리에서 심어라. 굳이 심으려면 --force.');
        process.exit(1);
      }
      /**
       * **기준선은 한 방향으로만 움직여야 한다** — 내리는 것은 목표, 올리는 것은 **빚**이다.
       *
       * ⚠️⚠️ 그전엔 `--update` 가 그 둘을 안 갈랐다. 위반을 늘리고 매번 `--update` 하면
       * 우주는 **영원히 초록불**이고 코드는 계속 나빠진다 — 관문이 아니라 도장이 된다.
       * 우주는 「줄이는 것이 목표다」라고 적어 놓고 **올리는 데 아무것도 묻지 않았다**(실측 R64).
       * ⇒ 올릴 때는 **사유를 적게 한다**(`--why`). 내릴 때는 안 묻는다 — 그게 목표니까.
       * ⛔ 막지는 않는다. 올려야 할 때는 있다(규칙이 넓어졌을 때 등). **기록 없이** 올리지 못하게 한다.
       */
      const raised = Object.entries(measuredNow)
        .map(([law, now]) => ({ law, was: g.observed?.laws?.[law], now }))
        .filter((r) => typeof r.was === 'number' && r.now > r.was);
      const why = flag('--why');
      if (raised.length > 0 && !why) {
        console.log(`\n  ⛔ 기준선을 **올리려** 한다 — ${raised.map((r) => `${r.law} ${r.was}→${r.now}`).join(' · ')}`);
        console.log('     내리는 것은 목표고 올리는 것은 **빚**이다. 사유 없이 올리면 관문이 도장이 된다.');
        console.log('     `--why "<왜 올리는가>"` 를 붙여라. 막지는 않는다 — **기록 없이** 올리지 못하게 할 뿐이다.');
        process.exit(1);
      }

      g.observed = {
        ...(g.observed ?? {}),
        ...(raised.length > 0
          ? {
            raised: [
              ...(g.observed?.raised ?? []),
              { at: new Date().toISOString(), commit: prov.commit, why, laws: raised.map((r) => `${r.law} ${r.was}→${r.now}`) },
            ],
          }
          : {}),
        measuredAt: new Date().toISOString(),
        commit: prov.commit,
        dirtyFiles: prov.dirtyFiles,
        files: fileCountNow,
        blind: Object.fromEntries(blindNow),
        fingerprint: nowFingerprint,
        rulesFingerprint: rulesFingerprint(contracts),
        /* 진단이 「법칙이 바뀌었다」를 말하려면 그때 무엇이 켜져 있었는지 알아야 한다. */
        lawsEnabled: [...(g.laws ?? [])],
        laws: { ...(g.observed?.laws ?? {}), ...measuredNow },
      };
      delete g.observed.date;
      await saveGalaxy(galaxyFile, g);
      console.log(`  ↳ ${path.basename(galaxyFile)} 의 observed 를 실측으로 갱신했다`);
    }

    console.log(`\n  태양계: ${g.solarSystems.map((s) => s.name).join(' · ')} (별 채점은 P3 빅뱅에서)`);
    void targets;
  }

  if (has('--update')) {
    console.log('\n은하의 기준선을 실측으로 갱신했다. 다시 돌리면 초록불이어야 한다.');
    process.exit(0);
  }
  console.log(failed
    ? [
        '\n⛔ 관측 법칙 위반 — 은하의 기준선이 낡았거나 주인 없는 규칙이 있다.',
        '',
        '   위에 「왜 달라졌나」 자동 진단이 있다. 그것을 읽고 나서 `--update` 하라.',
        '   ⛔ 원인을 모른 채 덮으면 다음 드리프트도 원인을 모른다.',
      ].join('\n')
    : '\n✅ 법칙이 규칙을 빠짐없이 덮고, 은하의 기준선이 실측과 같다.');
  process.exit(failed ? 1 : 0);
};

await main();
