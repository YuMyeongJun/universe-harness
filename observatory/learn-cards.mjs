#!/usr/bin/env node
/**
 * **반복해서 막힌 것 → 다음 주행의 브리핑 카드.** 모델 호출 **0회**.
 *
 * ## 왜 이 자리가 비어 있었나 — 실측
 *
 * 학습 고리의 **돌아오는 절반**에는 자리가 이미 있다:
 *   · `bigbang/nebula.mjs:412` — `<은하>/universe/knowledge/*.md` 를 읽어 `skillCards` 로 만든다
 *   · `bigbang/nebula.mjs:451` — 그것을 에이전트의 **첫 관측**에 끼워 넣는다
 *   · `bigbang/nebula.mjs:689` — 무엇이 들어갔는지 궤적에 남긴다
 * 그런데 그 자리에 넣을 것을 만드는 도구가 **`observatory/extract.mjs` 하나뿐**이고,
 * 그것은 **궤적 한 건마다 모델을 한 번 부른다**(그래서 `--write` 없이는 아무것도 안 뽑는다).
 *
 * ⇒ 실측: 궤적 2450건의 `nebula-start` 2389줄 중 `skillCards` 가 **비어 있지 않은 것은 1줄**이다.
 *   자리는 있는데 **채우는 길이 유료 하나뿐이라 사실상 안 채워졌다.**
 *
 * ## 무엇을 카드로 만드는가 — **모델이 필요 없는 것만**
 *
 * 관문의 반려 사유(`contract.feedback` · `contract.verdict.reasons`)는 **규칙이 스스로 쓴
 * 결정론적 문장**이다. 요약이 필요 없다 — 세어서 **반복되는 것만 골라내면** 그대로 브리핑이다.
 * 실측(궤적 2450건): 반려 1301줄에서 규칙이 세 개 나온다 —
 * `bigbang/star-scope` 737회 · `bigbang/behavior-contract` 565회 · `repo/braces-required` 1회.
 * 「737번 막힌 것」을 다음 주행 전에 말해 주는 데 모델은 필요 없다.
 *
 * ⛔ **이것은 「무엇을 하라」가 아니라 「무엇에 반복해서 막혔다」다.** 판정하지 않는다 —
 *    규칙이 과한 것일 수도, 브리핑에 처방이 없는 것일 수도 있다(`learn.mjs` 머리말과 같은 규율).
 *
 * ## ⛔ 모델을 안 부른다 — 그래서 관문에 넣어도 된다
 *
 * `extract.mjs` 가 관문 밖에 있는 이유는 **돈이 나가서**다(R145). 이 도구는 궤적을 읽고
 * 문자열을 세는 것뿐이라 그 이유가 없다. 대신 **`--write` 없이는 파일을 안 쓴다** —
 * 카드는 은하의 커밋 자리(`universe/`)에 떨어지므로 남의 저장소를 조용히 더럽히지 않는다.
 *
 * 재는 법:
 *   node observatory/learn-cards.mjs --galaxy tiny-galaxy          # 무엇이 카드가 될지만 본다
 *   node observatory/learn-cards.mjs --galaxy tiny-galaxy --write  # 카드를 쓴다(모델 0회)
 *   node observatory/learn-cards.mjs --from <궤적폴더>              # 은하 등재 없이 훑는다
 *   node observatory/learn-cards.mjs --self-test                   # 훑개가 진짜 무는지 잰다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 *
 * 종료코드: **0 통과 · 1 어긋남 · 3 못 쟀다.**
 */
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { findGalaxyFile, resolveGalaxyPath } from '../lib/galaxy-load.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';

/* ─────────────────────────────────────────────────────────────────────
 * 훑개 — 반려 한 줄에서 (규칙 · 자리 · 증거 · 처방) 을 꺼낸다
 * ──────────────────────────────────────────────────────────────────── */

/**
 * 반려 사유 산문에서 항목을 집는 훑개.
 *
 * ⚠️ 왜 산문을 파싱하는가: 실측(궤적 2450건)으로 반려 1301줄 중 **구조화된 `verdict`
 * 객체를 들고 있는 것은 3줄뿐**이고 나머지 1298줄은 `feedback` 산문만 있다.
 * 「구조가 있는 것만 센다」로 잡으면 **분모의 99.8% 가 조용히 사라진다.**
 *
 * 모양(관문이 스스로 찍는다):
 *   `1. [<규칙>] <자리>`
 *   `   증거: <증거>`
 *   `   고칠 것: <처방>`
 */
export const FEEDBACK_ITEM = /^[ \t]*\d+\.[ \t]*\[([^\]]+)\][ \t]*(.*)$/;
export const FEEDBACK_EVIDENCE = /^[ \t]*증거:[ \t]*(.*)$/;
export const FEEDBACK_FIX = /^[ \t]*고칠 것:[ \t]*(.*)$/;

/**
 * 산문 `feedback` 에서 사유들을 꺼낸다.
 *
 * ⛔ 못 꺼내면 **빈 배열**을 돌려준다 — 부르는 쪽이 그것을 「없다」가 아니라
 *    **「못 붙였다」**로 따로 세야 한다(§8). 조용히 0 으로 접으면 훑개가 고장 나도 초록불이다.
 *
 * @param {string} feedback 관문이 찍은 반려 사유 원문
 * @returns {{rule: string, where: string, evidence: string, fix: string}[]}
 */
export const parseFeedback = (feedback) => {
  const found = [];
  for (const line of String(feedback ?? '').split('\n')) {
    const item = FEEDBACK_ITEM.exec(line);
    if (item) {
      found.push({ rule: item[1].trim(), where: item[2].trim(), evidence: '', fix: '' });
      continue;
    }
    const last = found[found.length - 1];
    if (!last) {
      continue;
    }
    const evidence = FEEDBACK_EVIDENCE.exec(line);
    if (evidence) {
      last.evidence = evidence[1].trim();
      continue;
    }
    const fix = FEEDBACK_FIX.exec(line);
    if (fix) {
      last.fix = fix[1].trim();
    }
  }
  return found;
};

/**
 * 반려 한 줄에서 사유들을 꺼낸다 — **구조가 있으면 구조를, 없으면 산문을.**
 *
 * ⛔ 순서가 중요하다. `verdict.reasons` 는 관문이 만든 그대로라 파싱 오차가 없다.
 *    산문은 **되살린 것**이라 관문이 문장을 바꾸면 조용히 어긋난다 — 그래서 뒤에 둔다.
 *
 * @param {Record<string, unknown>} row 궤적의 `kind: 'contract'` 한 줄
 * @returns {{rule: string, where: string, evidence: string, fix: string}[]}
 */
export const reasonsOf = (row) => {
  const structured = row?.verdict?.reasons;
  if (Array.isArray(structured) && structured.length > 0) {
    return structured
      .filter((reason) => typeof reason?.rule === 'string' && reason.rule.trim() !== '')
      .map((reason) => ({
        rule: String(reason.rule).trim(),
        where: String(reason.where ?? '').trim(),
        evidence: String(reason.evidence ?? '').trim(),
        fix: String(reason.fix ?? '').trim(),
      }));
  }
  return parseFeedback(row?.feedback);
};

/**
 * 궤적 줄들을 규칙별로 모은다.
 *
 * ⛔ **못 붙인 반려를 따로 센다.** 「규칙 0개」와 「반려가 0줄」은 다르다 —
 *    앞의 것은 훑개가 고장 난 것이고 뒤의 것은 잴 것이 없던 것이다(§8).
 *
 * @param {Record<string, unknown>[]} rows 궤적 줄 전부
 * @returns {{rules: Map<string, {rule: string, hits: number, fixes: Set<string>, wheres: {where: string, evidence: string}[]}>, rejections: number, unattributed: number}}
 */
export const tallyRejections = (rows) => {
  const rules = new Map();
  let rejections = 0;
  let unattributed = 0;

  for (const row of rows ?? []) {
    if (row?.kind !== 'contract' || row?.decision !== 'REJECTED') {
      continue;
    }
    rejections += 1;
    const reasons = reasonsOf(row);
    if (reasons.length === 0) {
      /* ⛔ 「반려는 있었는데 왜인지 못 읽었다」 — 통과로도 위반으로도 세지 않는다. */
      unattributed += 1;
      continue;
    }
    for (const reason of reasons) {
      const entry = rules.get(reason.rule) ?? { rule: reason.rule, hits: 0, fixes: new Set(), wheres: [] };
      entry.hits += 1;
      if (reason.fix !== '') {
        entry.fixes.add(reason.fix);
      }
      if (reason.where !== '') {
        entry.wheres.push({ where: reason.where, evidence: reason.evidence });
      }
      rules.set(reason.rule, entry);
    }
  }
  return { rules, rejections, unattributed };
};

/**
 * 규칙 이름을 파일 이름으로 — `bigbang/star-scope` → `bigbang-star-scope`.
 * ⛔ 규칙 이름을 **열거하지 않는다**(§9). 무엇이 오든 구조로 접는다.
 */
export const slugOf = (rule) =>
  String(rule).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';

/** 카드 한 장. **모델이 쓴 문장은 한 줄도 없다** — 전부 관문이 스스로 낸 것이다. */
export const renderCard = ({ rule, hits, fixes, wheres }, { episodes }) => {
  const spots = wheres.slice(0, 5).map(({ where, evidence }) =>
    `- ${where}${evidence === '' ? '' : ` — \`${evidence}\``}`);
  return [
    `# 반복해서 막힌 것 — \`${rule}\``,
    '',
    `지난 주행의 궤적에서 이 규칙에 **${hits}번** 막혔다 (에피소드 ${episodes}건을 훑었다).`,
    '',
    ...(fixes.size === 0 ? ['처방이 궤적에 안 남아 있다 — **못 쟀다**. 규칙 이름만 아는 상태다.'] : [
      '관문이 스스로 적어 둔 처방:',
      ...[...fixes].map((fix) => `- ${fix}`),
    ]),
    ...(spots.length === 0 ? [] : ['', '막힌 자리(최대 5곳):', ...spots]),
    '',
    '---',
    '⚠️ 이 카드는 **모델이 쓴 것이 아니다.** 관문이 낸 반려 사유를 세어서 그대로 옮긴 것이다.',
    '⚠️ 카드는 **참고**지 법칙이 아니다 — 카드와 법칙이 부딪히면 법칙이 이긴다.',
    '⛔ 이것은 「에이전트가 못 한 것」이지 「우주의 결함」이 아니다. 규칙이 과한 것일 수도 있다.',
    '',
  ].join('\n');
};

/* ─────────────────────────────────────────────────────────────────────
 * 궤적 읽기
 * ──────────────────────────────────────────────────────────────────── */

/**
 * 궤적 폴더 하나를 읽는다.
 * @returns {{rows: Record<string, unknown>[], files: number, episodes: number, unreadable: number}}
 */
export const readTrajectories = async (dir) => {
  const names = (await readdir(dir).catch(() => null));
  if (names === null) {
    return { rows: [], files: 0, episodes: 0, unreadable: 0 };
  }
  const rows = [];
  let files = 0;
  let episodes = 0;
  let unreadable = 0;
  for (const name of names.filter((n) => n.endsWith('.jsonl')).sort()) {
    files += 1;
    /* eslint-disable-next-line no-await-in-loop */
    const text = await readFile(path.join(dir, name), 'utf8').catch(() => null);
    if (text === null) {
      unreadable += 1;
      continue;
    }
    const parsed = text.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
    if (parsed.length === 0) {
      unreadable += 1;
      continue;
    }
    episodes += 1;
    rows.push(...parsed);
  }
  return { rows, files, episodes, unreadable };
};

/* ─────────────────────────────────────────────────────────────────────
 * 자기 시험 — 훑개가 진짜 무는가
 * ──────────────────────────────────────────────────────────────────── */

/**
 * ⛔ **픽스처를 저장소에 심지 않는다.** 임시 폴더에 만들고 지운다 —
 *    심어 둔 픽스처는 관문이 바뀌면 낡고, 낡은 픽스처는 거짓 초록을 판다.
 */
const SELFTEST_LINES = [
  '# 주석 줄은 건너뛴다',
  JSON.stringify({ kind: 'nebula-start', lane: 'script', requirement: '가짜' }),
  /* ① 산문만 있는 반려 — 실측 분모의 99.8% 가 이 모양이다. 두 항목이 한 줄에 들어 있다. */
  JSON.stringify({
    kind: 'contract',
    decision: 'REJECTED',
    feedback: [
      '결정론 레인에서 막혔다. 아래를 고치고 다시 제출하라.',
      '1. [zeta/one] a.tsx:1',
      '   증거: if (x) y',
      '   고칠 것: 중괄호를 쓴다.',
      '2. [zeta/one] a.tsx:2',
      '   증거: if (z) w',
      '   고칠 것: 중괄호를 쓴다.',
    ].join('\n'),
  }),
  /* ② 구조화된 반려 — 있으면 이쪽이 이겨야 한다. */
  JSON.stringify({
    kind: 'contract',
    decision: 'REJECTED',
    verdict: { status: 'REJECTED', lane: 'static', reasons: [{ rule: 'zeta/two', where: 'b.tsx:9', evidence: 'q', fix: '고쳐라.' }] },
    feedback: '1. [zeta/never] 이 산문은 구조가 이기므로 안 읽혀야 한다',
  }),
  /* ③ 사유를 못 붙이는 반려 — **못 쟀다**로 따로 세어져야 한다. */
  JSON.stringify({ kind: 'contract', decision: 'REJECTED', feedback: '무슨 말인지 모를 산문' }),
  /* ④ 반려가 아닌 줄 — 세면 안 된다. */
  JSON.stringify({ kind: 'contract', decision: 'ALLOWED', files: ['a.tsx'] }),
  JSON.stringify({ kind: 'nebula-end', decision: 'RED', why: '가짜' }),
];

const selfTest = async () => {
  const failures = [];
  const check = (ok, what) => { if (!ok) { failures.push(what); } };

  const dir = await mkdtemp(path.join(tmpdir(), 'learn-cards-'));
  try {
    await writeFile(path.join(dir, 'fake.jsonl'), `${SELFTEST_LINES.join('\n')}\n`, 'utf8');
    const { rows, files, episodes, unreadable } = await readTrajectories(dir);

    /* ⛔ 분모 가드 — 훑개가 폴더를 못 보면 그 뒤 판정은 전부 무의미하다(§8 · R138). */
    check(files === 1 && episodes === 1 && unreadable === 0, `궤적을 못 읽었다 (파일 ${files} · 에피소드 ${episodes} · 못 읽음 ${unreadable})`);
    check(rows.length === SELFTEST_LINES.length - 1, `줄을 ${rows.length}개만 읽었다 — 주석 하나를 뺀 ${SELFTEST_LINES.length - 1}개여야 한다`);

    const { rules, rejections, unattributed } = tallyRejections(rows);

    check(rejections === 3, `반려를 ${rejections}줄로 셌다 — 3줄이어야 한다(ALLOWED 를 세면 안 된다)`);
    /* ⛔⛔ **이 검사가 이 파일의 심장이다.** 훑개가 눈멀면 반려는 그대로인데 규칙이 0이 된다.
       그때 「위반 없음」으로 접히면 카드가 영영 안 나오면서 초록불이 뜬다. */
    check(unattributed === 1, `사유를 못 붙인 반려를 ${unattributed}줄로 셌다 — 1줄이어야 한다(훑개가 눈멀면 이 수가 뛴다)`);
    check(rules.size === 2, `규칙을 ${rules.size}개 찾았다 — 2개여야 한다 (찾은 것: ${[...rules.keys()].join(' · ') || '없음'})`);
    check(rules.get('zeta/one')?.hits === 2, `\`zeta/one\` 을 ${rules.get('zeta/one')?.hits ?? 0}회로 셌다 — 산문 두 항목이라 2회여야 한다`);
    check(rules.get('zeta/two')?.hits === 1, `\`zeta/two\` 를 ${rules.get('zeta/two')?.hits ?? 0}회로 셌다 — 구조화된 것 1회여야 한다`);
    /* 구조가 산문을 이겨야 한다 — 아니면 같은 반려가 두 규칙으로 샌다. */
    check(!rules.has('zeta/never'), '구조화된 반려인데 산문까지 읽었다 — 같은 반려가 두 번 세어진다');

    /**
     * ⛔ **여기서 죽으면 안 된다.** 처음엔 `renderCard(rules.get('zeta/one'))` 를 그냥 불렀다.
     * 훑개를 눈멀게 하는 변이를 걸었더니 그 줄이 `undefined` 를 구조분해하며 **터졌고**,
     * 변이 틀은 「⚠️ 사유불일치」를 냈다 — 죽긴 했는데 **내가 세운 사유가 아니라 스택트레이스**였다.
     * 검사가 터지면 「무엇이 틀렸는지」가 사라진다. 없으면 없다고 **말하고** 넘어간다.
     */
    const oneEntry = rules.get('zeta/one');
    if (!oneEntry) {
      check(false, '`zeta/one` 을 못 찾아 카드를 못 만들었다 — 훑개가 눈멀었다');
    } else {
      const card = renderCard(oneEntry, { episodes: 1 });
      check(card.includes('zeta/one') && card.includes('2번') && card.includes('중괄호를 쓴다.'),
        '카드에 규칙·횟수·처방 중 빠진 것이 있다');
    }
    check(slugOf('bigbang/star-scope') === 'bigbang-star-scope', `슬러그가 어긋났다: ${slugOf('bigbang/star-scope')}`);

    /* ⛔ 빈 폴더는 「깨끗하다」가 아니라 **못 쟀다**다. */
    const emptyDir = await mkdtemp(path.join(tmpdir(), 'learn-cards-empty-'));
    const empty = await readTrajectories(emptyDir);
    check(empty.files === 0 && empty.episodes === 0, '빈 폴더에서 0이 안 나왔다');
    await rm(emptyDir, { recursive: true, force: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  console.log('── 카드 훑개 자기 시험');
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`  ❌ ${failure}`);
    }
    console.error(`\n⛔ 훑개가 어긋났다 — ${failures.length}건.`);
    process.exit(1);
  }
  console.log('  ✅ 9갈래 전부 맞다 — 산문·구조·못 붙인 것·ALLOWED 제외·분모·슬러그·카드 문구.');
  process.exit(0);
};

/* ─────────────────────────────────────────────────────────────────────
 * 본체
 * ──────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
rejectUnknownFlags(
  argv.filter((token, at) => {
    const before = argv[at - 1];
    return !(typeof before === 'string' && ['--universe', '--galaxy', '--from', '--min'].includes(before));
  }),
  ['--universe', '--galaxy', '--from', '--write', '--min', '--self-test'],
  'universe learn-cards',
);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

if (argv.includes('--self-test')) {
  await selfTest();
}

/** 몇 번 막혀야 카드가 되는가. **한 번은 교훈이 아니다** — 기본 2. */
const MIN_HITS = Number(flag('--min') ?? 2);
if (!Number.isFinite(MIN_HITS) || MIN_HITS < 1) {
  console.error(`⛔ --min 을 못 읽었다: ${flag('--min')}`);
  process.exit(1);
}

const root = await requireUniverseHome(flag('--universe'));
const fromDir = flag('--from');

let trajectoryDir;
let knowledgeDir;
let galaxyName;

if (fromDir) {
  trajectoryDir = path.resolve(fromDir);
  knowledgeDir = null;
  galaxyName = '(--from)';
} else {
  const config = JSON.parse(await readFile(path.join(root, 'universe.config.json'), 'utf8'));
  galaxyName = flag('--galaxy') ?? config.galaxies?.[0];
  const file = await findGalaxyFile(root, galaxyName);
  if (!file) {
    console.error(`⛔ 없는 은하: ${galaxyName}\n   등재된 것: ${(config.galaxies ?? []).join(' · ') || '(없음)'}`);
    process.exit(1);
  }
  const galaxy = resolveGalaxyPath(root, JSON.parse(await readFile(file, 'utf8')));
  trajectoryDir = path.join(galaxy.path, '.harness', 'trajectories');
  knowledgeDir = path.join(galaxy.path, 'universe', 'knowledge');
}

console.log(`── 반복 반려 → 브리핑 카드 — ${galaxyName}  (모델 호출 **0회**)`);
console.log(`   궤적   ${trajectoryDir}`);

const { rows, files, episodes, unreadable } = await readTrajectories(trajectoryDir);

/* ⛔ 관측 법칙 §8 — 0 은 무죄가 아니다. 궤적이 없는 것은 「배울 것이 없다」가 아니다. */
if (files === 0) {
  console.log('\n⚠️ **못 쟀다** — 궤적이 하나도 없다. 주행을 한 번 돌린 뒤에 다시 불러라.');
  process.exit(EXIT_UNMEASURED);
}
if (episodes === 0) {
  console.log(`\n⚠️ **못 쟀다** — 궤적 파일 ${files}개를 봤는데 읽어 낸 에피소드가 0건이다(못 읽음 ${unreadable}개).`);
  process.exit(EXIT_UNMEASURED);
}

const { rules, rejections, unattributed } = tallyRejections(rows);

console.log(`   궤적 ${files}개 · 에피소드 ${episodes}건${unreadable > 0 ? ` (못 읽음 ${unreadable}개)` : ''} · 줄 ${rows.length}개`);
console.log(`   관문 반려 ${rejections}줄 — 사유를 붙인 것 ${rejections - unattributed} · ⚪ 못 붙인 것 ${unattributed}`);

if (rejections === 0) {
  console.log('\n✅ 반려가 한 줄도 없다 — 카드로 만들 반복 실패가 없다.');
  process.exit(0);
}

/**
 * ⛔⛔ **훑개 고장 가드.** 반려는 있는데 사유를 **하나도** 못 붙였다면 그것은
 * 「위반이 없다」가 아니라 **훑개가 눈멀었거나 관문이 문장을 바꾼 것**이다.
 * 조용히 「카드 0장」으로 끝내면 그때부터 이 도구는 영영 아무것도 안 내면서 초록불이다 —
 * `learn.mjs` 가 같은 자리에 같은 가드를 두고 있다(「훑개가 고장 났거나 형식이 바뀌었다」).
 */
if (unattributed === rejections) {
  console.error(`\n⛔ 반려 ${rejections}줄에서 **사유를 하나도 못 붙였다** — 훑개가 고장 났거나 관문이 문장을 바꿨다.`);
  console.error('   0장은 「반복 실패가 없다」가 아니다. `parseFeedback` 의 모양과 관문의 출력을 대조하라.');
  process.exit(1);
}

const ranked = [...rules.values()].sort((a, b) => b.hits - a.hits);
const chosen = ranked.filter((entry) => entry.hits >= MIN_HITS);
const dropped = ranked.filter((entry) => entry.hits < MIN_HITS);

console.log(`\n   규칙 ${ranked.length}개 (문턱 ${MIN_HITS}회 이상 ${chosen.length}개 · 미만 ${dropped.length}개)`);
for (const entry of ranked) {
  console.log(`     ${entry.hits >= MIN_HITS ? '📗' : '·'} ${String(entry.hits).padStart(4)}회  ${entry.rule}`);
}
/* ⛔ **조용히 빼지 않는다.** 문턱 아래도 이름을 부른다 — 안 부르면 「원래 없었다」와 구별이 안 된다. */
if (dropped.length > 0) {
  console.log(`   ⚠️ 문턱(${MIN_HITS}회) 아래 ${dropped.length}개는 카드가 안 된다 — 한 번은 교훈이 아니다. \`--min 1\` 로 낮춘다.`);
}

if (chosen.length === 0) {
  console.log(`\n⚠️ 문턱을 넘은 규칙이 없다 — 카드 0장. (반려는 ${rejections}줄 있었다)`);
  process.exit(0);
}

if (!argv.includes('--write')) {
  console.log(`\n   카드 ${chosen.length}장이 나온다. 미리보기(첫 장):\n`);
  console.log(renderCard(chosen[0], { episodes }).split('\n').map((line) => `     ${line}`).join('\n'));
  console.log(`\n   \`--write\` 로 ${knowledgeDir === null ? '(--from 은 쓸 자리가 없다 — --galaxy 로 불러라)' : knowledgeDir} 에 쓴다.`);
  process.exit(0);
}

if (knowledgeDir === null) {
  console.error('\n⛔ `--from` 으로는 못 쓴다 — 카드가 어느 은하의 것인지 모른다. `--galaxy <이름>` 으로 불러라.');
  process.exit(1);
}

await mkdir(knowledgeDir, { recursive: true });
const written = [];
for (const entry of chosen) {
  const target = path.join(knowledgeDir, `rejected-${slugOf(entry.rule)}.md`);
  /* eslint-disable-next-line no-await-in-loop */
  await writeFile(target, renderCard(entry, { episodes }), 'utf8');
  written.push(path.relative(root, target));
}
console.log(`\n✅ 카드 ${written.length}장을 썼다 — **모델 호출 0회**.`);
for (const file of written) {
  console.log(`     ${file}`);
}
console.log('\n   다음 주행에 넣으려면 `--skills` 를 줘라(기본은 꺼져 있다 — nebula.mjs 의 규율).');
process.exit(0);
