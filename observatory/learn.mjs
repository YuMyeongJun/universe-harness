#!/usr/bin/env node
/**
 * 궤적을 읽어 성운 후보를 낸다 — **두 바퀴를 잇는 다리.**
 *
 * ⚠️ 왜 있는가: 이 우주에는 바퀴가 둘인데 서로 안 닿았다.
 *   · 우주의 바퀴 — 라운드 → 평가 → 성운 → 다음 라운드. **사람의 판단이 먹인다.**
 *   · 하네스의 바퀴 — reset → step → reward. **기계가 실패를 잰다.**
 * 하네스가 잰 실패는 궤적(JSONL)에만 쌓이고 아무 데도 안 갔다. `reward` 가
 * 아무것도 바꾸지 않았다 — EnvHarness 를 **채점기로만** 쓴 것이다.
 * 실패한 에피소드는 그 자체로 관측이고, 관측이 가는 곳은 성운이다.
 *
 * ⛔ **이것이 내는 것은 「우주의 결함」이 아니라 「에이전트가 못 한 것」이다.**
 * 둘은 다르다 — 에이전트가 못 한 것이 실력 탓일 수도, 브리핑 탓일 수도, 관문이
 * 과한 탓일 수도 있다. 그래서 판정하지 않고 **증거와 함께 후보로만** 낸다.
 *
 * 재는 법:
 *   node observatory/learn.mjs              # 후보를 본다
 *   node observatory/learn.mjs --promote     # 성운에 붙인다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, writeFile, readdir, appendFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { resolveGalaxyPath } from '../lib/galaxy-load.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--promote', '--from', '--since', '--check', '--update'], 'universe learn');

/* ⚠️ **궤적은 낡는다.** 첫 판은 전체 역사를 뭉뚱그려서, 이미 고친 결함
   (boot build 가 빨갛던 스테이지 6개)을 「아직 살아 있는 문제」처럼 후보로 냈다.
   고친 뒤에 쌓인 것만 봐야 지금의 실패를 본다. 그래서 시간을 본다 —
   범위를 **항상 찍고**, `--since` 로 자를 수 있게. */
const sinceIndex = argv.indexOf('--since');
const sinceMs = (() => {
  if (sinceIndex === -1 || !argv[sinceIndex + 1]) { return null; }
  const raw = argv[sinceIndex + 1];
  const rel = /^(\d+)([hd])$/.exec(raw);
  if (rel) {
    const unit = rel[2] === 'h' ? 3600_000 : 86_400_000;
    return Date.now() - Number(rel[1]) * unit;
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    console.error(`⛔ --since 를 못 읽었다: ${raw}  (예: 2h · 3d · 2026-09-04T21:35)`);
    process.exit(1);
  }
  return parsed;
})();

const ROOT = resolve(new URL('..', import.meta.url).pathname);

/* 궤적이 있을 만한 곳 — 등록된 은하와 픽스처. */
const trajectoryDirs = async () => {
  const dirs = [];
  const fromIndex = argv.indexOf('--from');
  if (fromIndex !== -1 && argv[fromIndex + 1]) {
    dirs.push(resolve(argv[fromIndex + 1]));
    return dirs;
  }
  const config = JSON.parse(await readFile(join(ROOT, 'universe.config.json'), 'utf8'));
  for (const name of config.galaxies ?? []) {
    const galaxy = await readFile(join(ROOT, 'galaxies', `${name}.json`), 'utf8')
      .then((t) => resolveGalaxyPath(ROOT, JSON.parse(t))).catch(() => null);
    if (galaxy?.path) { dirs.push(join(galaxy.path, '.harness', 'trajectories')); }
  }
  const fixtures = join(ROOT, 'fixtures');
  if (existsSync(fixtures)) {
    for (const name of await readdir(fixtures)) {
      const dir = join(fixtures, name, '.harness', 'trajectories');
      if (existsSync(dir)) { dirs.push(dir); }
    }
  }
  return dirs;
};

const dirs = await trajectoryDirs();
const episodes = [];
let filesSeen = 0;
let filteredOut = 0;

let mtimeFallback = 0;
for (const dir of dirs) {
  const files = await readdir(dir).catch(() => []);
  for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
    /* ⚠️ **세는 자리가 맨 앞이어야 한다.** 처음엔 파싱에 실패한 파일을 세기 전에
       건너뛰었고, 그래서 「못 읽어서 0」이 **절대 안 뜨는 죽은 바닥값**이 됐다.
       음성 시험(JSON 아닌 파일을 넣어 보기)에서 잡았다 — 안 했으면 몰랐다. */
    filesSeen += 1;
    const rows = (await readFile(join(dir, file), 'utf8')).split('\n')
      .filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
    if (rows.length === 0) { continue; }
    /* ⛔ **mtime 은 시각이 아니라 「마지막으로 만진 때」다.** `git checkout`·복사·변이 시험의
       복원이 새로 찍으므로 `--since` 로 자른 범위가 조용히 달라진다(R81 이 dist 검사에서
       겪은 그 함정). 그래서 궤적이 스스로 `at` 을 적게 했고(R88), 여기서는 그것을 먼저 쓴다.
       ⚠️ 옛 궤적에는 `at` 이 없다 — 떨어질 때 **떨어졌다고 말한다.** 조용히 나쁜 값을
       쓰는 것이 이 저장소가 반복해서 당한 결함이다. */
    const stamped = rows.map((r) => Date.parse(r.at ?? '')).filter((n) => Number.isFinite(n));
    const mtime = stamped.length > 0 ? Math.min(...stamped) : (await stat(join(dir, file))).mtimeMs;
    if (stamped.length === 0) { mtimeFallback += 1; }
    if (sinceMs !== null && mtime < sinceMs) { filteredOut += 1; continue; }
    const submit = [...rows].reverse().find((r) => r.kind === 'submit' && r.decision);
    episodes.push({
      file, mtime, stage: rows[0].stageId ?? '?',
      bootBuildExit: rows.find((r) => r.kind === 'reset')?.bootBuildExit,
      steps: rows.length,
      solved: submit?.decision === 'SOLVED',
      submitted: Boolean(submit),
      reward: submit?.reward ?? null,
      rejects: rows.filter((r) => r.kind === 'contract' && r.decision === 'REJECTED').length,
      blocked: rows.filter((r) => r.kind === 'probe' && r.blocked).length,
      cost: rows.find((r) => r.kind === 'cost') ?? null,
      failedChecks: (submit?.checks ?? []).filter((c) => !c.ok).map((c) => c.name),
      failedGates: (submit?.gates ?? []).filter((g) => !g.ok).map((g) => g.name),
      rejectRules: rows.filter((r) => r.kind === 'contract' && r.decision === 'REJECTED')
        .flatMap((r) => (r.verdict?.findings ?? []).map((f) => f.rule)),
    });
  }
}

const span = episodes.length
  ? (() => {
      const times = episodes.map((e) => e.mtime).sort((a, b) => a - b);
      /* 로컬 시각으로 찍는다 — UTC 로 찍었더니 사람이 본 시각과 9시간 어긋나 헷갈렸다. */
      const fmt = (t) => new Date(t).toLocaleString('sv-SE').slice(0, 16);
      return `${fmt(times[0])} ~ ${fmt(times[times.length - 1])}`;
    })()
  : '없음';
console.log(`── 궤적 학습 — 디렉터리 ${dirs.length}곳 · 에피소드 ${episodes.length}개`);
if (mtimeFallback > 0) {
  console.log(`  ⚠️ 그중 ${mtimeFallback}개는 줄에 시각(\`at\`)이 없어 **파일 mtime 으로 떨어졌다** — 복사·checkout 이 그 값을 바꾼다.`);
}
console.log(`   기간: ${span}${sinceMs === null ? '  ⚠️ **전체 역사다** — 이미 고친 결함도 섞인다(`--since 2h` 로 잘라라)' : `  (--since 로 잘랐다)`}`);

/* 관측 법칙 §8 — 0 은 무죄가 아니다. */
if (dirs.length === 0) {
  console.log('  ⚠️ 궤적 디렉터리가 하나도 없다. 은하를 등록하거나 스테이지를 한 번 돌려라.');
  process.exit(0);
}
/* ⚠️ **걸러서 0 인 것과 못 읽어서 0 인 것은 다르다.** 처음엔 둘을 뭉뚱그려
   `--since` 로 전부 걸러진 것을 「훑개 고장」이라 외쳤다 — 내가 방금 쓴 §8 을
   내 도구가 어긴 것이다. 파일을 몇 개 봤는지로 가른다. */
if (episodes.length === 0) {
  if (filesSeen === 0) {
    console.log('  ⚠️ 궤적 파일이 하나도 없다. 스테이지를 한 번 돌려라.');
    process.exit(0);
  }
  if (filteredOut === filesSeen) {
    console.log(`  ⚠️ 궤적 ${filesSeen}개가 전부 --since 이전이다. 그 뒤로 돌린 에피소드가 없다.`);
    process.exit(0);
  }
  console.error(`  ⛔ 궤적 파일 ${filesSeen}개를 봤는데 에피소드를 하나도 못 읽었다 — **훑개가 고장 났거나 형식이 바뀌었다.**`);
  process.exit(1);
}

/**
 * ⚠️⚠️ **이 도구가 관측 법칙 §6 을 자기가 어기고 있었다.**
 * 「boot build 가 빨간 채 시작한 에피소드 N개 — 그 수치는 전부 거짓이다」라고 **찍어 놓고**,
 * 바로 그 에피소드들을 평균 reward·SOLVED 비율·실패 집계에 **그대로 넣고 있었다**(실측 R48).
 * 빨간 빌드 위에서 채점하지 않는다 — 그것이 §6 이다. 자기 출력에 쓴 말을 자기가 안 지켰다.
 * ⛔ 세되 **섞지 않는다**: 무효 에피소드는 따로 세고, 통계는 유효한 것으로만 낸다.
 */
const invalid = episodes.filter((e) => e.bootBuildExit !== undefined && e.bootBuildExit !== 0);
const valid = episodes.filter((e) => !invalid.includes(e));
if (invalid.length > 0) {
  console.log(`   ⛔ 무효 ${invalid.length}개 제외 — boot build 가 빨간 채 시작했다(§6). 아래 수치는 유효 ${valid.length}개만이다.`);
}

const solved = valid.filter((e) => e.solved).length;
const submitted = valid.filter((e) => e.submitted).length;
const rewards = valid.map((e) => e.reward).filter((r) => typeof r === 'number');
const avg = rewards.length ? (rewards.reduce((a, b) => a + b, 0) / rewards.length).toFixed(3) : '없음';
console.log(`   SOLVED ${solved}/${valid.length} · 제출까지 간 것 ${submitted} · 평균 reward ${avg}`);

const tally = (lists) => {
  const counts = new Map();
  for (const item of lists.flat()) { counts.set(item, (counts.get(item) ?? 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const candidates = [];

const failedChecks = tally(valid.map((e) => e.failedChecks));
if (failedChecks.length > 0) {
  console.log('\n   자주 빨간 채점 축:');
  for (const [name, n] of failedChecks.slice(0, 5)) { console.log(`     ${n}회  ${name}`); }
  /* ⚠️ **한 번으로 충분한 것이 있다.** 처음엔 「2회 이상 반복」만 후보로 냈는데,
     첫 진짜 에피소드에서 **채점기가 터진 것**이 1회라 그냥 지나갔다.
     반복은 「에이전트가 못 한다」의 신호이고, 크래시는 「우주가 고장 났다」의 신호다 —
     둘의 문턱이 같을 이유가 없다. */
  const crashed = failedChecks.filter(([name]) => /채점이 터졌다/.test(name));
  for (const [name, n] of crashed) {
    candidates.push({
      kind: `scorer-crash:${name}`,
      latestMs: Math.max(...valid.filter((e) => (e.failedChecks ?? []).includes(name)).map((e) => e.mtime), 0),
      what: `**채점기가 터졌다** — \`${name}\` (${n}회). 에이전트가 아니라 **스테이지가 고장 난 것**이다`,
      why: '채점이 예상 밖의 정답을 못 읽으면 옳은 답도 FAILED 가 된다 — reward 가 거짓말을 한다',
    });
  }

  const [top, n] = failedChecks.find(([name]) => !/채점이 터졌다/.test(name)) ?? [null, 0];
  if (top && n >= 2) {
    candidates.push({
      kind: `unsolved:${top}`,
      latestMs: Math.max(...valid.filter((e) => (e.failedChecks ?? []).includes(top)).map((e) => e.mtime), 0),
      what: `에이전트가 **「${top}」를 ${n}번 못 넘겼다** — 궤적 실측`,
      why: '실력 탓인지 · 브리핑에 처방이 없어서인지 · 축이 과한지 아직 안 갈랐다',
    });
  }
}

const rejectRules = tally(valid.map((e) => e.rejectRules));
if (rejectRules.length > 0) {
  console.log('\n   자주 반려된 관문 규칙:');
  for (const [rule, n] of rejectRules.slice(0, 5)) { console.log(`     ${n}회  ${rule}`); }
  const [top, n] = rejectRules[0];
  if (n >= 2) {
    candidates.push({
      kind: `gate-reject:${top}`,
      latestMs: Math.max(...valid.filter((e) => (e.rejectRules ?? []).includes(top)).map((e) => e.mtime), 0),
      what: `관문이 **\`${top}\`** 로 ${n}번 반려했다 — 에이전트가 반복해서 같은 것을 어긴다`,
      why: '규칙이 브리핑에 안 적혀 있는지, 아니면 처방이 불친절한지 봐야 한다',
    });
  }
}

const noSubmit = valid.filter((e) => !e.submitted);
if (noSubmit.length > 0) {
  console.log(`\n   ⚠️ 제출도 못 하고 끝난 에피소드 ${noSubmit.length}개 — 스텝을 다 썼거나 죽었다`);
  candidates.push({
    kind: 'no-submit',
    latestMs: Math.max(...noSubmit.map((e) => e.mtime), 0),
    what: `**제출도 못 하고 끝난 에피소드 ${noSubmit.length}개** — 조사만 하다 스텝을 소진했거나 도중에 죽었다`,
    why: '스텝 예산이 모자란 것인지, 브리핑이 조사를 부추기는 것인지 안 갈랐다',
  });
}

const bootBroken = invalid;
if (bootBroken.length > 0) {
  console.log(`\n   ⛔ boot build 가 빨간 채 시작한 에피소드 ${bootBroken.length}개 — 그 수치는 전부 거짓이다`);
  candidates.push({
    kind: 'boot-broken',
    latestMs: Math.max(...bootBroken.map((e) => e.mtime), 0),
    what: `**boot build 가 빨간 채 시작한 에피소드 ${bootBroken.length}개** — 결함을 심기 전에 이미 깨져 있었다`,
    why: '스테이지가 그 은하에서 재현되지 않는다는 뜻이다(광속 한계·관측 법칙 §6)',
  });
}

const costs = episodes.map((e) => e.cost).filter(Boolean);
const totalCost = costs.reduce((sum, c) => (sum === null || c.costUsd === null ? null : sum + c.costUsd), 0);
const calls = costs.reduce((sum, c) => sum + (c.agentCalls ?? 0), 0);
console.log(`\n   기록된 비용: LLM 호출 ${calls}회 · ${totalCost === null ? '보고 없음' : `$${totalCost.toFixed(4)}`} (에피소드 ${costs.length}개에만 기록됨)`);

if (candidates.length === 0) {
  console.log('\n✅ 궤적에서 성운으로 올릴 만한 반복 실패가 없다.');
  process.exit(0);
}

console.log(`\n🌫  성운 후보 ${candidates.length}건 — **판정이 아니라 관측이다**:`);
for (const c of candidates) { console.log(`   · ${c.what}\n     ↳ ${c.why}`); }

/**
 * **「판단하지 않은 학습 후보 0개」** — 성운의 법을 궤적에도 건다.
 *
 * ⚠️⚠️ 성운은 「로그에만 남은 제안은 실행되지 않는다」를 자기 법으로 적어 뒀다.
 * 그런데 **궤적에만 남은 관측**은 아무도 안 봤다 — `learn` 은 만들어 놓고
 * **어떤 관문도 부르지 않았다.** R10 이 「제안만 하고 아무것도 자동으로 소비하지
 * 않는다」고 성운에 적어 둔 채 그대로 있었다(실측: 후보 4건이 한 번도 안 올라갔다).
 *
 * ⛔ 자동으로 성운에 밀어 넣지 않는다. 이것은 **판정이 아니라 관측**이라
 * 「에이전트가 못 한 것」과 「우주의 결함」을 사람이 갈라야 한다(이 파일 머리말).
 * ⇒ 대신 **판단을 강제한다.** 이름 충돌·열거·처방과 같은 방식이다.
 */
const BASELINE = join(ROOT, 'observatory/learn-baseline.json');
const PLACEHOLDER = 'TODO:';
if (argv.includes('--check') || argv.includes('--update')) {
  const baseline = await readFile(BASELINE, 'utf8').then((raw) => JSON.parse(raw)).catch(() => ({}));
  if (argv.includes('--update')) {
    const next = {};
    for (const c of candidates) {
      const kept = baseline[c.kind];
      next[c.kind] = typeof kept === 'string' ? { 판단: kept }
        : kept ?? { 판단: `${PLACEHOLDER} 에이전트가 못 한 것인가, 우주의 결함인가 — 갈라서 적어라. 관측: ${c.what.replace(/\*/g, '')}` };
    }
    await writeFile(BASELINE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    const blank = Object.values(next).filter((v) => v.판단.startsWith(PLACEHOLDER)).length;
    console.log(`\n✅ 기준선에 후보 ${candidates.length}건을 적었다${blank > 0 ? ` — 그중 ${blank}건은 **판단이 비어 있다.**` : ''}`);
    process.exit(0);
  }
  /**
   * **고쳤으면 고쳤다고 적고, 증거로 확인한다.**
   *
   * ⚠️⚠️ 실측(R49): 후보 하나(`s02-spa-deeplink 채점이 터졌다`)는 궤적 **22:40** 의 것이고
   * 고친 커밋은 **22:43** — **3분 뒤**였다. 그런데 `learn` 은 그 뒤로 계속 그것을
   * 「살아 있는 문제」로 냈다. 관문이 된 지금은 **유령에 대한 판단을 영영 요구**하게 된다.
   * ⛔ `--since` 로 잘라 숨기지 않는다 — 그러면 **살아 있는 신호도 같이 숨는다.**
   * ⇒ 기준선에 `고침`(시각)을 적으면, 그 뒤 궤적에 안 나타난 후보는 **닫힌 것**으로 본다.
   *   그 뒤에도 나타나면 **재발**이라고 크게 말한다 — 고쳤다는 기록이 알리바이가 되면 안 된다.
   */
  const entry = (kind) => {
    const raw = baseline[kind];
    return typeof raw === 'string' ? { 판단: raw } : (raw ?? {});
  };
  const fixedMs = (kind) => {
    const when = entry(kind).고침;
    const parsed = when ? Date.parse(when) : Number.NaN;
    return Number.isNaN(parsed) ? null : parsed;
  };
  const regressed = candidates.filter((c) => {
    const at = fixedMs(c.kind);
    return at !== null && c.latestMs > at;
  });
  const closed = candidates.filter((c) => {
    const at = fixedMs(c.kind);
    return at !== null && c.latestMs <= at;
  });
  const live = candidates.filter((c) => !closed.includes(c));
  const unjudged = live.filter((c) => !entry(c.kind).판단 || entry(c.kind).판단.startsWith(PLACEHOLDER));
  const stale = Object.keys(baseline).filter((k) => !candidates.some((c) => c.kind === k));
  console.log(`\n── 학습 후보 감사 — 후보 ${candidates.length}건 (살아 있는 것 ${live.length} · 닫힌 것 ${closed.length})`);
  for (const c of candidates) {
    const why = entry(c.kind).판단;
    const judged = why && !why.startsWith(PLACEHOLDER);
    const mark = regressed.includes(c) ? '🔴' : closed.includes(c) ? '🗃' : judged ? '✅' : '⛔';
    console.log(`  ${mark} ${c.kind}`);
    if (regressed.includes(c)) {
      console.log(`       **재발했다** — 고쳤다고 적힌 시각(${entry(c.kind).고침}) 뒤의 궤적에 또 나타난다.`);
    } else if (closed.includes(c)) {
      console.log(`       고침 ${entry(c.kind).고침} — 그 뒤 궤적에 안 나타난다(닫힘)`);
    } else if (judged) {
      console.log(`       ${why}`);
    }
  }
  if (regressed.length > 0) {
    console.error(`\n⛔ 재발 ${regressed.length}건 — 고쳤다는 기록이 알리바이가 되면 안 된다.`);
    process.exit(1);
  }
  if (stale.length > 0) {
    console.log(`\n  ⚠️ 기준선에 있는데 이제 안 나오는 후보 ${stale.length}건: ${stale.join(' · ')}`);
  }
  if (unjudged.length > 0) {
    console.error(`\n⛔ 판단하지 않은 학습 후보 ${unjudged.length}건. **궤적에만 남은 관측은 실행되지 않는다.**`);
    console.error('   `universe learn --update` 로 적고, 각 줄에 「에이전트 탓인가 우주 탓인가」를 갈라 써라.');
    process.exit(1);
  }
  console.log(`\n✅ 학습 후보 ${candidates.length}건이 전부 판단돼 있다.`);
  process.exit(0);
}

if (argv.includes('--promote')) {
  /**
   * ⛔ **이미 판단한 것은 다시 올리지 않는다.**
   * 실측(R73): `--promote` 는 성운에 **무엇이 이미 있는지 몰랐다.** R49 에서 닫은 항목을
   * **다른 문구로 또 올렸다** — 같은 관측이 두 줄이 되면 성운은 백로그가 아니라 쓰레기통이 된다.
   * R48 이 「자동 승격 대신 **판단**」을 도입했으니, **판단된 것은 이미 처리된 것**이다.
   */
  const judged = await readFile(BASELINE, 'utf8').then((raw) => JSON.parse(raw)).catch(() => ({}));
  const fresh = candidates.filter((c) => {
    const entry = judged[c.kind];
    const verdict = typeof entry === 'string' ? entry : entry?.판단;
    return !verdict || verdict.startsWith(PLACEHOLDER);
  });
  const skipped = candidates.length - fresh.length;
  if (fresh.length === 0) {
    console.log(`\n   ↳ 올릴 것이 없다 — 후보 ${candidates.length}건이 **전부 이미 판단돼 있다.**`);
    console.log('      판단을 바꾸려면 `observatory/learn-baseline.json` 을 고쳐라. 같은 것을 두 번 올리지 않는다.');
    process.exit(0);
  }
  const rows = fresh.map((c) => `| ${c.what} | 궤적 실측 | ${c.why} |`).join('\n');
  await appendFile(join(ROOT, 'nebula/README.md'), `${rows}\n`, 'utf8');
  console.log(`\n   ↳ 성운에 ${fresh.length}건 올렸다${skipped > 0 ? ` (이미 판단된 ${skipped}건은 건너뛰었다)` : ''}.`);
} else {
  console.log('\n   `universe learn --promote` 로 성운에 올린다.');
}
