#!/usr/bin/env node
/**
 * `universe round` — 라운드 궤도를 **기계가 돌린다.**
 *
 *   universe round new "<제목>"     라운드를 연다 (로그 뼈대)
 *   universe round close [--log <경로>] [--dry-run]
 *                                  라운드를 닫는다 — 검사 → 평가 확인 → **성운 승격**
 *   universe round audit [--restore]  로그와 성운을 대조한다 — 승격이 샜는지 본다
 *
 * ## 왜 이것이 필요한가
 * 라운드 궤도의 ⑤단계는 「A 가 아닌 축을 성운으로 승격」이다. 이 단계가 궤도를 닫는다.
 * 그런데 지금까지 **사람이 손으로** 했고, 그래서 R01~R03 의 낮은 축이 전부 로그에만 남았다.
 * 성숙도가 L4 에 묶여 있던 이유가 그것이다 — **로그에만 남은 제안은 실행되지 않는다.**
 *
 * ⛔ 이 명령은 평가를 **대신 쓰지 않는다.** 평가는 사람(또는 에이전트)의 판단이다.
 *    기계가 하는 것은 「빠뜨리지 못하게 하는 것」뿐이다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { packageHome, requireUniverseHome } from '../lib/home.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { strikeNebulaRow, openNebulaRows, sourceOf } from '../lib/nebula-close.mjs';
import { forceVerdict } from '../lib/force.mjs';
import { GATES } from '../lib/gates.mjs';
import { whyItFailed } from '../lib/why.mjs';
import { frontmatter } from '../lib/frontmatter.mjs';

const argv = process.argv.slice(2);
/**
 * ⚠️⚠️ **제목이 플래그로 파싱됐다.**
 * `universe round new "--universe 를 빼고 부르면 …"` 을 치자 §7 이 제목 속 낱말을
 * **모르는 플래그**로 보고 라운드를 안 열었다(실측 R75 — 그 라운드가 안 열려서 알았다).
 * 제목은 사람이 쓰는 문장이라 `--` 로 시작할 수 있다.
 * ⇒ `new` 의 **제목 부분은 플래그 검사에서 뺀다.** §7 은 지키되 사람의 문장을 벌하지 않는다.
 * ⛔ `--universe` 는 제목 앞에 와야 한다 — 뒤에 오면 제목의 일부가 된다(그렇게 말해 준다).
 */
const titleStart = argv[0] === 'new' ? 1 : argv.length;
const flagPart = argv.slice(0, titleStart).concat(
  argv.slice(titleStart).filter((token, index, all) => token === '--universe' || all[index - 1] === '--universe'),
);
rejectUnknownFlags(flagPart, ['--universe', '--log', '--force', '--restore', '--why', '--dry-run'], 'universe round');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const has = (n) => argv.includes(n);
const positionals = argv[0] === 'new'
  ? ['new', ...argv.slice(1).filter((token, index, all) => token !== '--universe' && all[index - 1] !== '--universe')]
  : argv.filter((a, i) => !a.startsWith('--') && !['--log', '--universe'].includes(argv[i - 1]));

const root = await requireUniverseHome(flag('--universe'));
const [sub, ...rest] = positionals;

/** 검사를 **파이프 없이** 돌리고 종료코드와 전체 출력을 둘 다 받는다(관측 법칙 §3·§4). */
const runCheck = (file, args = []) =>
  new Promise((resolve) => {
    const abs = path.join(packageHome, file);
    const runner = file.endsWith('.sh') ? 'bash' : process.execPath;
    const child = spawn(runner, [abs, ...args, '--universe', root], { cwd: root });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.stderr.on('data', (c) => { out += c.toString(); });
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });

const logDirOf = (r) => path.join(r, 'log');
const PROMOTED_SECTION = '## 우주 자신의 관측 — 라운드 평가에서 승격된 것';
const promotedHeader = (rows) =>
  `${PROMOTED_SECTION}\n\n[라운드 궤도](../orbits/round.md) ⑤단계에 따라, 최고 판정이 아닌 축은 여기로 올라온다.\n**로그에만 남은 것은 실행되지 않는다.**\n\n| 관측 | 출처 | 왜 아직 법칙이 아닌가 |\n|------|------|----------------------|\n${rows}\n\n`;

/**
 * **판정 어휘** — 도구가 아는 낱말은 이것뿐이다.
 *
 * ⚠️⚠️ 여기 없는 낱말을 **조용히 「최고 아님」으로 처리하다 성운이 부풀었다.** R35 부터
 * 사람이 `A` 대신 `통과` 를 쓰기 시작했는데 도구는 그 말을 몰랐고, 그래서 **최고 판정 12건이
 * 전부 성운으로 승격**됐다. 성운 페이지가 14KB 로 한계를 넘고서야 드러났다 —
 * 모르는 입력을 삼키면 안 켜진 모드가 켜진 것처럼 보인다(관측 법칙 §7).
 * ⇒ 이제 **모르는 낱말은 거부한다.** 어휘를 늘리려면 여기에 적어야 한다.
 */
const VERDICTS = {
  통과: 'top',
  A: 'top',
  'A+': 'top',
  S: 'top',
  High: 'top',
  미흡: 'low',
  B: 'low',
  'B+': 'low',
  C: 'low',
  D: 'low',
  F: 'low',
  Low: 'low',
};
const verdictKind = (v) => VERDICTS[v] ?? VERDICTS[v.toUpperCase()] ?? null;
const isTopVerdict = (v) => verdictKind(v) === 'top';

/** 평가 표를 읽는다. close 와 audit 이 **같은 규칙**을 써야 둘이 어긋나지 않는다. */
const evalRows = (text) => {
  const block = /\n## 평가\n([\s\S]*?)(?=\n## |$)/.exec(text)?.[1] ?? '';
  return [...block.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|$/gm)]
    .map((m) => ({ axis: m[1].trim(), verdict: m[2].replace(/\*/g, '').trim(), why: m[3].trim() }))
    .filter((r) => r.axis && !/^-+$/.test(r.axis) && r.axis !== '축');
};

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}`;
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

/* ── round new ─────────────────────────────────────────────── */
if (sub === 'new') {
  const title = rest.join(' ').trim();
  if (!title) {
    console.error('제목을 줘라: universe round new "<제목>"');
    process.exit(1);
  }
  const logs = (await fs.readdir(path.join(root, 'log')).catch(() => []))
    .filter((f) => f.endsWith('.md') && f !== 'README.md');
  const n = String(logs.length + 1).padStart(2, '0');
  const name = `${stamp()}-${slug(title)}`;
  const file = path.join(root, 'log', `${name}.md`);

  const body = `---
name: ${name}
title: ${title}
type: log
parent: log
related: [observation]
round: R${n}
description: (한 줄로 무엇을 했는지 — 닫을 때 채운다)
---

# R${n} — ${title}

## 실행 요약

## 결과

## 평가

| 축 | 판정 | 근거 |
|----|------|------|
| 집행 가능성 | | 검사가 실제로 돌아 **잡히는가** |
| 실측 기반성 | | 수치가 잰 것인가, 인용인가 |
| 변경 정직성 | | 안 한 것을 안 했다고 적었는가 |

## 다음 단계
`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
  console.log(`🛰  라운드 R${n} 를 열었다 — ${path.relative(root, file)}`);
  console.log('\n닫을 때: universe round close');
  console.log('⛔ 평가를 비운 채로는 닫히지 않는다.');
  process.exit(0);
}

/* ── round audit ───────────────────────────────────────────────
 * 로그가 정본이고 성운은 파생이다. 둘이 어긋나면 **승격이 샌 것**이다.
 *
 * ⚠️ 실측(2026-09-04): R04 에서 승격한 5건이 사라졌다. 배포판화 작업이 성운을 덮어썼고
 *    커밋에도 남지 않았다. 「로그에만 남은 제안은 실행되지 않는다」를 우주 자신이 밟았다.
 *    성운은 손으로 고쳐지는 파일이라 언제든 다시 샐 수 있다 — 그래서 감사가 필요하다.
 */
/**
 * 라운드 밖에서 쌓인 커밋 — **평가되지 않은 변경**의 수.
 *
 * ⚠️ 왜: 라운드가 있는 이유는 한 일이 **평가되게** 하기 위해서다. 라운드 밖 커밋은
 * 평가표를 거치지 않았고, 따라서 낮은 축이 성운으로 올라갈 기회도 없었다.
 * 「언제 라운드를 열어야 하는가」는 기계가 못 정한다 — 그건 판단이다.
 * 그러나 **빠뜨린 것이 눈에 안 띄는 것**은 막을 수 있다. 그래서 수를 찍는다.
 */
/** 라운드가 열렸다는 것의 **유일한 정의** — frontmatter 에 `closed:` 표식이 없다.
 *  ⚠️ 한때 `audit` 은 「빈 판정」으로, `close` 는 `closed:` 로 봤다. 정의가 둘이면
 *  언제나 어긋난다 — 실제로 R08 의 평가표를 채우자 감사가 「성운에서 사라진 승격」이라
 *  외치며 close 를 막았다. 아직 안 닫혔으니 승격 전인 게 당연한데도. */
const isOpenLog = (text) => !frontmatter(text).closed;

const unevaluatedCommits = async (root) => {
  const git = async (args) => {
    const child = spawn('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    const code = await new Promise((res) => child.on('close', res));
    return code === 0 ? out.trim() : '';
  };
  /* 마지막으로 라운드를 **닫은** 커밋 = `closed:` 줄을 log/ 에 넣은 커밋. */
  const closeCommit = (await git(['log', '--format=%H', '-S', 'closed:', '--', 'log/'])).split('\n')[0];
  if (!closeCommit) {
    return null;
  }
  const count = Number(await git(['rev-list', '--count', `${closeCommit}..HEAD`]) || '0');
  const subject = await git(['log', '-1', '--format=%h %s', closeCommit]);
  return { count, since: subject };
};

/* ── round which ────────────────────────────────────────────
   ⛔ **실측(R88): 나는 열린 로그를 `ls -t` 로 찾다가 남의 로그를 덮어썼다.** 변이 시험이
   파일을 복원하며 mtime 을 새로 찍기 때문에 「가장 최근」이 「열린 것」이 아니다. `new` 가
   경로를 찍기는 하지만 **다음 세션은 그 화면을 못 본다** — 물어볼 자리가 없으면 또 mtime 을
   짚는다. 열림의 정의는 하나뿐이다(frontmatter 에 `closed:` 가 없다). 그것을 내놓는다. */
if (sub === 'which') {
  const dir = logDirOf(root);
  const files = (await fs.readdir(dir).catch(() => []))
    .filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  const open = [];
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), 'utf8');
    if (isOpenLog(text)) {
      open.push({ path: path.relative(process.cwd(), path.join(dir, f)), rid: /^round:\s*(\S+)$/m.exec(text)?.[1] ?? '?' });
    }
  }
  if (open.length === 0) {
    console.log('열린 라운드가 없다 — 모든 로그에 `closed:` 표식이 있다.');
    process.exit(0);
  }
  for (const o of open) {
    console.log(`${o.rid}\t${o.path}`);
  }
  process.exit(0);
}

/* ── round open ────────────────────────────────────────────
   ⛔ **손으로 세지 마라(R98).** 내가 성운을 grep 으로 훑어 「13줄」이라 적었는데 18줄이었다 —
   판정 표기가 있는 줄만 고르는 정규식이었다. 세는 곳과 보는 곳이 같아야 한다. */
if (sub === 'open') {
  const body = await fs.readFile(path.join(root, 'nebula/README.md'), 'utf8').catch(() => '');
  const rows = openNebulaRows(body);
  if (rows.length === 0) {
    console.log('성운에 열린 줄이 없다.');
    process.exit(0);
  }
  console.log(`성운에 열린 줄 ${rows.length}건 — 오래된 순:\n`);
  const withAge = rows.map((line) => ({
    line,
    src: sourceOf(line),
    n: Number(/R(\d+)/.exec(sourceOf(line) ?? '')?.[1] ?? Number.MAX_SAFE_INTEGER),
  })).sort((a, b) => a.n - b.n);
  for (const r of withAge) {
    const what = r.line.split('|')[1]?.trim().replace(/\s+/g, ' ') ?? '';
    console.log(`  ${(r.src ?? '(출처 없음)').padEnd(22)} ${what.slice(0, 88)}`);
  }
  console.log('\n⚠️ 출처가 없는 줄은 어느 라운드가 올렸는지 모른다 — 나이를 못 잰다.');
  process.exit(0);
}

if (sub === 'suggest') {
  const gap = await unevaluatedCommits(root);
  const logs = (await fs.readdir(logDirOf(root)).catch(() => []))
    .filter((f) => f.endsWith('.md') && f !== 'README.md');
  let open = [];
  for (const f of logs) {
    const t = await fs.readFile(path.join(logDirOf(root), f), 'utf8');
    if (!frontmatter(t).closed) {
      open.push(frontmatter(t).round ?? f);
    }
  }
  const nebula = await fs.readFile(path.join(root, 'nebula/README.md'), 'utf8').catch(() => '');
  const openItems = openNebulaRows(nebula).length;

  console.log('🧭 라운드를 열 때인가');
  console.log(`   성운에 열린 것: ${openItems}건`);
  /* ⛔ **수만 세면 낡은 줄이 숨는다(R97).** 실측: 90바퀴 전(R07) 줄이 그대로 떠 있었는데
     이미 `round suggest` 가 답하고 있었다. 넷은 이미 고쳐진 채 열려 있었다(R96).
     그래서 **가장 오래된 것의 나이**를 찍는다 — 정책이 아니라 눈에 띄게 하는 것이다. */
  const ages = nebula.split('\n')
    .filter((l) => /^\|/.test(l) && !l.includes('~~'))
    .flatMap((l) => [...l.matchAll(/\bR(\d+)\s+[가-힣]/g)].map((m) => Number(m[1])))
    .filter((n) => Number.isFinite(n));
  if (ages.length > 0) {
    const oldest = Math.min(...ages);
    const now = logs.length;   /* 로그 개수가 곧 지금까지 돈 바퀴 수다 */
    console.log(`   가장 오래된 줄: R${oldest}${now > oldest ? ` — ${now - oldest}바퀴 전이다. 아직 열려 있는지 **다시 재라**(R97 은 넷이 이미 닫혀 있었다)` : ''}`);
  }
  if (gap === null) {
    console.log('   평가되지 않은 커밋: 셀 수 없다 — 아직 닫힌 라운드가 없다');
  } else {
    console.log(`   평가되지 않은 커밋: ${gap.count}개 (마지막으로 닫은 커밋 ${gap.since})`);
  }

  if (open.length > 0) {
    console.log(`\n   → **${open.join(' · ')} 가 열려 있다.** 새로 열 것이 아니라 닫을 때다.`);
  } else if (gap && gap.count > 0) {
    console.log(`\n   → 라운드 밖에서 ${gap.count}개가 커밋됐다. **평가표를 거치지 않은 변경이다.**`);
    console.log('     `universe round new "<제목>"` 으로 열고, 성운에서 하나 꺼내 붙여라.');
  } else {
    console.log('\n   → 지금은 열 이유가 없다.');
  }
  console.log('\n⚠️ 이것은 판정이 아니라 **눈에 띄게 하는 것**이다. 언제 여는지는 사람이 정한다.');
  process.exit(0);
}

if (sub === 'audit') {
  const files = (await fs.readdir(logDirOf(root)).catch(() => []))
    .filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  const nebula = await fs.readFile(path.join(root, 'nebula/README.md'), 'utf8').catch(() => '');
  const missing = [];
  let checked = 0;
  const openRounds = new Set();

  for (const f of files) {
    const t = await fs.readFile(path.join(logDirOf(root), f), 'utf8');
    const rid = frontmatter(t).round ?? f;
    /* ⚠️ **아직 안 닫힌 라운드는 감사하지 않는다.** 승격은 close 가 하므로,
       열린 라운드의 낮은 축이 성운에 없는 것은 결함이 아니라 순서다. */
    if (isOpenLog(t)) {
      openRounds.add(rid);
      continue;
    }
    for (const r of evalRows(t)) {
      /* ⛔ **감사도 모르는 낱말을 삼키면 안 된다.** 삼키면 「최고 아님」으로 세어져
         「승격이 샜다」고 짖는다 — 무는 것은 맞는데 **이유가 틀린 경고**다.
         이유가 틀린 경고는 사람을 엉뚱한 곳으로 보낸다(실측: R39 에서 그대로 재현했다). */
      if (r.verdict && !verdictKind(r.verdict)) {
        console.error(`⛔ ${rid} ${r.axis} — 도구가 모르는 판정 「${r.verdict}」`);
        console.error(`   아는 낱말은 이것뿐이다: ${Object.keys(VERDICTS).join(' · ')}`);
        process.exit(1);
      }
      if (isTopVerdict(r.verdict)) {
        continue;
      }
      checked += 1;
      /* 대조 열쇠는 **라운드 + 축**이다.
         ⚠️ 처음엔 근거 문장으로 맞췄는데, 성운에서 항목을 「닫힘」으로 고쳐 적자
            **감사가 자기 오탐을 냈다**(실측). 성운은 손으로 고쳐지는 파일이므로
            문구가 아니라 **바뀌지 않는 식별자**로 대조해야 한다. */
      if (!nebula.includes(`${rid} ${r.axis}`)) {
        missing.push({ round: rid, ...r });
      }
    }
  }

  /* ⚠️ 라운드가 **열려 있으면** 그 안의 커밋은 「라운드 밖」이 아니다. 곧 평가된다.
     처음엔 그걸 안 보고 경고를 냈고, R08 이 열린 채로 「라운드 밖 15개」라는
     거짓 경고가 나왔다. 근거 없이 무는 경고는 무시하는 법부터 가르친다. */
  const anyOpen = (await Promise.all(files.map(async (f) =>
    !frontmatter(await fs.readFile(path.join(logDirOf(root), f), 'utf8')).closed))).some(Boolean);
  const gap = anyOpen ? null : await unevaluatedCommits(root);
  if (gap && gap.count > 0) {
    console.log(`⚠️ 라운드 밖에서 커밋 ${gap.count}개 — 평가표를 거치지 않은 변경이다 (\`universe round suggest\`).\n`);
  }
  /* ⚠️ **도피구는 세어야 도피구다.** `--force` 로 닫힌 라운드가 몇인지 아무도 안 셌다(R65). */
  const forced = [];
  for (const f of files) {
    const text = await fs.readFile(path.join(logDirOf(root), f), 'utf8');
    const meta = frontmatter(text);
    if (meta.forced) { forced.push(`${meta.round ?? f} — ${meta.forcedWhy ?? '사유 없음'} [${meta.forced}]`); }
  }
  console.log(`🔍 승격 감사 — 라운드 ${files.length}개 · 최고 판정이 아닌 축 ${checked}개`);
  if (forced.length > 0) {
    console.log(`   ⚠️ **빨간 관문을 넘어 닫은 라운드 ${forced.length}개**: ${forced.join(' · ')}`);
    console.log('      도피구를 쓴 것 자체는 죄가 아니다 — 세지 않는 것이 죄다.');
  }
  if (openRounds.size > 0) {
    console.log(`   (아직 열려 있어 건너뛴 라운드: ${[...openRounds].join(' · ')})`);
  }
  if (missing.length === 0) {
    console.log('\n✅ 로그의 낮은 축이 전부 성운에 있다.');
    process.exit(0);
  }
  console.log(`\n⛔ 성운에서 사라진 승격 ${missing.length}건 — 로그에만 남았다:`);
  for (const m of missing) {
    console.log(`   ${m.round} ${m.axis} (${m.verdict})`);
    console.log(`     ${m.why}`);
  }
  console.log('\n   `universe round audit --restore` 로 성운에 되살린다.');

  if (has('--restore')) {
    const file = path.join(root, 'nebula/README.md');
    const rows = missing.map((m) => `| ${m.why} | ${m.round} ${m.axis} **${m.verdict}** | 무엇을 해야 이 축이 최고 판정이 되는가 |`).join('\n');
    const idx = nebula.indexOf(PROMOTED_SECTION);
    if (idx === -1) {
      await fs.writeFile(file, `${nebula}\n${promotedHeader(rows)}`, 'utf8');
    } else {
      const end = nebula.indexOf('\n\n', nebula.indexOf('|------', idx));
      await fs.writeFile(file, `${nebula.slice(0, end)}\n${rows}${nebula.slice(end)}`, 'utf8');
    }
    console.log(`\n   ↳ 성운에 ${missing.length}건 되살렸다.`);
    process.exit(0);
  }
  process.exit(1);
}

/* ── round close ───────────────────────────────────────────── */
if (sub !== 'close') {
  console.error('사용법: universe round new "<제목>" | which | open | close [--log <경로>] [--dry-run] | audit [--restore]');
  process.exit(1);
}

const logDir = path.join(root, 'log');
const logs = (await fs.readdir(logDir).catch(() => []))
  .filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
if (!logs.length) {
  console.error('닫을 라운드가 없다. `universe round new "<제목>"` 으로 먼저 열어라.');
  process.exit(1);
}

/* ⚠️⚠️ **열린 라운드는 「파일명이 마지막인 것」이 아니다.**
   예전엔 `logs.at(-1)` 로 골랐다. 그런데 앞선 로그들이 실제 시각보다 앞선 이름을 갖고
   있어서, 새로 연 R07(21-23)이 R04(21-30)·R05(22-10) 사이에 끼었고
   **close 가 이미 닫힌 R05 를 다시 닫았다**(실측). 승격이 없어 피해는 없었지만,
   있었다면 엉뚱한 라운드의 축이 성운에 실렸을 것이다.
   열렸다는 것의 정의는 하나뿐이다 — **평가표에 빈 판정이 있다.**
   close 가 빈 판정을 거부하므로, 빈 칸은 곧 「아직 안 닫혔다」는 뜻이다(감사도 같은 신호를 쓴다). */
/* 닫혔다는 것의 표식은 frontmatter 의 `closed:` 한 줄이다.
   ⚠️ 「평가표가 비었으면 열린 것」으로 잡아 봤다가 틀렸다 — **정상 흐름은 표를 채우고
   닫는 것**이라 닫기 직전의 라운드가 「닫힌 것」으로 보였다. 열림은 표의 상태가 아니라
   **닫는 행위를 했는가**의 문제다. 그래서 close 가 흔적을 남기게 했다. */
const isOpen = isOpenLog;
/**
 * ⛔ **`--log` 는 이 우주의 `log/` 안이어야 한다.**
 * 실측(R78): `round close --log /tmp/가짜라운드.md` 가 **우주 밖 파일에 `closed:` 를 썼고**
 * 「R99 를 닫았다」고 말했다 — 이 우주에 없는 라운드를. 도구가 남의 파일을 고친 것이다.
 * ⚠️ 이름 검사(R76)와 같은 종류지만 자리가 다르다 — **하나를 막았다고 다 막힌 게 아니다.**
 */
let logFile = flag('--log') ? path.resolve(root, flag('--log')) : '';
if (logFile) {
  const logHome = `${logDirOf(root)}${path.sep}`;
  if (!logFile.startsWith(logHome)) {
    console.error(`⛔ \`--log\` 는 이 우주의 로그여야 한다: ${flag('--log')}`);
    console.error(`   로그가 사는 곳: ${path.relative(process.cwd(), logDirOf(root))}/`);
    process.exit(1);
  }
  /* ⛔ **이미 닫힌 라운드를 또 닫지 않는다.** 실측(R78): 짚어 주면 검사를 다 돌고
     「✅ R38 를 닫았다」고 말했다 — 이미 닫힌 것을. 파일은 안 바뀌었지만 **말이 거짓말이었다.**
     ⚠️ `--log` 없이 부를 때는 열린 라운드만 고르므로 이 자리에서만 난다. */
  const already = frontmatter(await fs.readFile(logFile, 'utf8').catch(() => '')).closed;
  if (already) {
    console.error(`⛔ 이미 닫힌 라운드다: ${path.basename(logFile)} (closed: ${already})`);
    console.error('   다시 닫아도 아무것도 안 바뀐다 — 그런데 「닫았다」고 말하게 된다.');
    process.exit(1);
  }
}
if (!logFile) {
  const open = [];
  for (const f of logs) {
    const t = await fs.readFile(path.join(logDir, f), 'utf8');
    if (isOpen(t)) {
      open.push({ file: f, rid: /^round:\s*(\S+)$/m.exec(t)?.[1] ?? f });
    }
  }
  if (open.length === 0) {
    console.error('열린 라운드가 없다 — 모든 로그에 `closed:` 표식이 있다.');
    console.error('`universe round new "<제목>"` 으로 먼저 열어라(특정 로그를 닫으려면 --log <경로>).');
    process.exit(1);
  }
  if (open.length > 1) {
    console.error(`열린 라운드가 ${open.length}개다 — 어느 것을 닫을지 --log 로 짚어라:`);
    for (const o of open) { console.error(`   ${o.rid}  log/${o.file}`); }
    process.exit(1);
  }
  logFile = path.join(logDir, open[0].file);
}
const text = await fs.readFile(logFile, 'utf8');
const roundId = /^round:\s*(\S+)$/m.exec(text)?.[1] ?? '?';
console.log(`🛰  라운드 ${roundId} 를 닫는다 — ${path.relative(root, logFile)}\n`);

/* 1) 검사 — 파이프 없이 */
let blocked = false;
/** ⚠️ `--force` 로 넘어간 관문의 이름 — **흔적을 남기려고** 모은다(R65). */
const redGates = [];
for (const { label, file, args = [] } of GATES) {
  const { code, out } = await runCheck(file, args);
  console.log(`   ${code === 0 ? '✅' : '❌'} ${label}  exit=${code}`);
  if (code !== 0) {
    /* ⚠️ **왜 빨간불인지 그 자리에서 보여 준다.** 안 보여 주면 사람이 두 번 돌려 보고
       「두 번째엔 되네」로 넘기고, 그러다 `--force` 를 습관으로 만든다. */
    console.log(whyItFailed(out));
    blocked = true;
    redGates.push(label);
  }
}
if (blocked && !has('--force')) {
  console.log('\n⛔ 검사가 빨간불이라 라운드를 닫지 않는다. 고치고 다시 닫아라(정 안 되면 --force).');
  process.exit(1);
}
/**
 * ⛔ **`--force` 로 넘어갔으면 그렇게 적는다.**
 * 그전엔 흔적이 **아무 데도** 안 남았다 — 라운드가 **초록불이었던 것처럼** 닫혔다(실측 R65).
 * 도피구를 없애지는 않는다(정말 필요할 때가 있다). **조용히 지나가지 못하게** 할 뿐이다.
 * R64 가 기준선에 한 것과 같은 처방이다.
 */
if (blocked) {
  /**
   * ⛔ **막지 않는다. 사유를 적게 한다.** R64 가 기준선에 쓴 처방과 같다.
   * 실패로 세면 사람은 **흔적을 안 남기는 길**을 찾고 도피구가 더 어두워진다 —
   * R65 가 그래서 관문을 안 만들었고, 그 축을 「미흡」으로 적었다.
   * 이름만 남기는 것으로는 **왜 넘었는지**를 모른다. 그것이 나중에 읽는 사람에게 필요한 전부다.
   */
  const why = flag('--why');
  if (forceVerdict(blocked, has('--force'), why) === '사유를 요구한다') {
    console.log(`\n⛔ 빨간 관문 ${redGates.length}개를 넘으려 한다 — ${redGates.join(' · ')}`);
    console.log('   `--why "<왜 넘는가>"` 를 붙여라. **막지 않는다** — 기록 없이 넘지 못하게 할 뿐이다.');
    process.exit(1);
  }
  console.log(`\n⚠️ **빨간 관문 ${redGates.length}개를 넘어간다** — 로그에 적는다: ${redGates.join(' · ')}`);
  console.log(`   사유: ${why}`);
}

/* 2) 평가 절 확인 — 기계가 대신 쓰지 않고, 빠뜨리지 못하게만 한다 */
const evalBlock = /\n## 평가\n([\s\S]*?)(?=\n## |$)/.exec(text)?.[1] ?? '';
const rows = evalRows(text);

if (rows.length === 0) {
  console.log('\n⛔ 평가 절이 비어 있다. **평가 없는 라운드는 불완전한 실행이다.**');
  process.exit(1);
}
const empty = rows.filter((r) => !r.verdict);
if (empty.length) {
  console.log(`\n⛔ 판정이 빈 축이 있다: ${empty.map((r) => r.axis).join(' · ')}`);
  process.exit(1);
}
const noWhy = rows.filter((r) => !r.why);
if (noWhy.length) {
  console.log(`\n⛔ 근거 없는 등급은 무효다: ${noWhy.map((r) => r.axis).join(' · ')}`);
  process.exit(1);
}
if (/종합\s*[A-DSF]/.test(evalBlock)) {
  console.log('\n⛔ 합성 등급 금지 — 여러 축을 하나로 합치지 않는다.');
  process.exit(1);
}

console.log(`\n   평가 ${rows.length}축:`);
for (const r of rows) {
  console.log(`     ${r.verdict.padEnd(6)} ${r.axis}`);
}

/* ⛔ 모르는 판정 낱말은 여기서 멈춘다 — 삼키면 승격이 조용히 틀린다(위 VERDICTS 주석). */
const unknownVerdicts = rows.filter((r) => r.verdict && !verdictKind(r.verdict));
if (unknownVerdicts.length > 0) {
  console.error(`\n⛔ 도구가 모르는 판정 ${unknownVerdicts.length}건: ${unknownVerdicts.map((r) => `${r.axis}=「${r.verdict}」`).join(' · ')}`);
  console.error(`   아는 낱말은 이것뿐이다: ${Object.keys(VERDICTS).join(' · ')}`);
  console.error('   어휘를 늘리려면 bin/round.mjs 의 VERDICTS 에 적어라 — 모르는 낱말을 삼키면 승격이 조용히 틀린다(§7).');
  process.exit(1);
}

/* 3) ⭐ 승격 — 이 단계가 궤도를 닫는다 */
const low = rows.filter((r) => !isTopVerdict(r.verdict));

if (low.length === 0) {
  console.log('\n✅ 모든 축이 최고 판정이다 — 승격할 것이 없다.');
} else {
  const nebulaFile = path.join(root, 'nebula/README.md');
  let nebula = await fs.readFile(nebulaFile, 'utf8');
  const marker = '## 당신의 은하에서 관측된 것';
  const section = PROMOTED_SECTION;
  const newRows = low.map((r) => `| ${r.why} | ${roundId} ${r.axis} **${r.verdict}** | 무엇을 해야 이 축이 최고 판정이 되는가 |`).join('\n');

  if (!nebula.includes(section)) {
    const header = promotedHeader(newRows);
    nebula = nebula.includes(marker) ? nebula.replace(marker, `${header}${marker}`) : `${nebula}\n${header}`;
  } else {
    const idx = nebula.indexOf(section);
    const tableEnd = nebula.indexOf('\n\n', nebula.indexOf('|------', idx));
    nebula = `${nebula.slice(0, tableEnd)}\n${newRows}${nebula.slice(tableEnd)}`;
  }

  console.log(`\n   ⭐ 성운으로 승격 ${low.length}건:`);
  for (const r of low) {
    console.log(`     ${r.axis} (${r.verdict}) — ${r.why.slice(0, 60)}`);
  }
  if (!has('--dry-run')) {
    await fs.writeFile(nebulaFile, nebula, 'utf8');
  }
}

if (has('--dry-run')) {
  console.log('\n(dry-run — 성운을 고치지 않았다)');
  process.exit(0);
}

/**
 * ── **닫힘을 기계가 잇는다** (R96).
 *
 * ⛔ **이 블록은 `closed:` 도장보다 앞이어야 한다(R113 실측).** 뒤에 뒀더니 `closes:` 가
 * 못 찾아 거부했는데 **라운드는 이미 닫힌 뒤**였다 — 「닫았다고 적고 아무것도 안 닫히는 것」을
 * 막으려는 코드가 정작 **자기 자신에게 그 일을 했다.**
 *
 * ⛔ 실측: 성운이 **이미 고친 것을 열려 있다고** 말하고 있었다. R85 의 미흡은 R87 이
 * (`universe args`), R89 의 미흡은 R95 가(36/36 사유 판정) 닫았는데 두 줄 다 그대로 떠 있었다.
 * 승격은 기계가 하는데(`round close`) **닫는 것은 사람이 손으로 줄을 그어야** 했다 —
 * 한쪽만 자동이면 기록은 한쪽으로만 자란다.
 *
 * 로그 frontmatter 에 `closes: R89 변경 정직성 · R85 집행 가능성` 을 적으면 여기서 줄을 긋는다.
 * ⛔ **못 찾으면 거부한다** — 「닫았다」고 적어 놓고 아무 줄도 안 그어지는 것이 지금 상태다.
 */
const closesRaw = /^closes:\s*(.+)$/m.exec(text)?.[1];
if (closesRaw) {
  const targets = closesRaw.split('·').map((s) => s.trim()).filter(Boolean);
  const file = path.join(root, 'nebula/README.md');
  let body = await fs.readFile(file, 'utf8');
  const notFound = [];
  for (const entry of targets) {
    const [target, closer] = entry.split('->').map((s) => s.trim());
    const result = strikeNebulaRow(body, target, closer ?? null, roundId);
    if (!result.found) {
      notFound.push(target);
      continue;
    }
    body = result.body;
  }
  if (notFound.length > 0) {
    console.error(`\n⛔ \`closes:\` 가 가리키는 성운 줄을 못 찾았다: ${notFound.join(' · ')}`);
    console.error('   이미 그어졌거나, 출처 문구가 다르다. **닫았다고 적고 아무것도 안 닫히는 것**을 막으려고 거부한다.');
    process.exit(1);
  }
  await fs.writeFile(file, body, 'utf8');
  console.log(`\n   ↳ 성운에서 ${targets.length}건에 줄을 그었다: ${targets.join(' · ')}`);
}

/* 닫았다는 것을 로그에 남긴다 — 남기지 않으면 같은 라운드를 두 번 닫을 수 있고,
   실제로 그랬다(R05 를 두 번 닫았다). */
{
  const closedText = await fs.readFile(logFile, 'utf8');
  if (!/^closed:\s*\S/m.test(closedText)) {
    /* ⛔ `--force` 로 넘어갔으면 **frontmatter 에 남긴다** — 감사가 읽는 자리다(R65). */
    const marker = blocked
      ? `$1\nclosed: ${stamp()}\nforced: ${redGates.join(' · ')}\nforcedWhy: ${flag('--why')}`
      : `$1\nclosed: ${stamp()}`;
    await fs.writeFile(logFile, closedText.replace(/^(round:\s*\S+)$/m, marker), 'utf8');
  }
}

console.log(`\n✅ ${roundId} 를 닫았다. 한 바퀴의 끝 = 성운에 항목이 올라갔거나, 올릴 것이 없었을 때.`);
console.log('   다음 바퀴: 성운에서 하나를 꺼내 `universe round new "<제목>"`');
