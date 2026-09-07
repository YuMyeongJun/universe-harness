#!/usr/bin/env node
/**
 * 전파 — **git 위키로 발행한다.**
 *
 *   node beacon/wiki.mjs [--dry-run] [--remote <url>] [--only <slug>]
 *
 * ## 왜 Confluence 에서 옮겼나 (R151)
 *
 * Confluence 로 보내면 셋이 따라왔다:
 *   1) **좌표가 커밋된다** — 사이트·스페이스 키·페이지 id 일곱. 받은 사람에겐 못 쓰는 좌표고
 *      공개 저장소엔 있어선 안 되는 좌표다.
 *   2) **되읽을 수가 없다** — 본문은 MCP 로만 읽혀 스크립트의 손이 안 닿았다. 그래서
 *      「위키가 손으로 고쳐졌는가」 검사가 **혼자 못 돌았다**(R17). 사람이 받아다 줘야 했다.
 *   3) **왕복이 글자를 바꾼다** — v2 REST 가 본문을 XHTML(`storage`)로만 받아서,
 *      표 구분선·불릿·이스케이프 등 **여섯 패턴**을 정규화해야 겨우 비교가 됐다.
 *      그 정규화층은 **진짜 사람 수정이 숨을 수 있는 곳**이기도 했다.
 *
 * git 위키는 셋 다 없다. 주소는 `origin` 에서 **파생되고**(적을 좌표가 없다), `clone` 으로
 * 되읽고, **바이트가 그대로다**(변환기도 정규화도 필요 없다).
 * ⇒ 이 파일에는 마크다운→XHTML 변환기가 **없다.** 없어진 것이 성과다.
 *
 * ## 방향은 여전히 한쪽이다
 * 저장소가 정본, 위키는 뷰다(보존 법칙). 여기서는 **쓰기만** 한다.
 *
 * ⛔ **기본이 안전해야 한다.** `--push` 를 주지 않으면 **밀지 않는다** — 커밋까지만 하고
 *    무엇이 바뀌는지 보여 준다. 발행은 바깥으로 나가는 일이라 실수의 값이 크다.
 * ⛔ 렌더가 먼저다. `beacon/out/` 이 없으면 멈춘다 — 낡은 산출을 발행하는 것은 안 하느니만 못하다.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { wikiFileNameOf, wikiRemoteOf } from '../lib/wiki-remote.mjs';

const run = promisify(execFile);

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--dry-run', '--remote', '--only', '--push', '--universe'], 'universe wiki-publish');
const has = (n) => argv.includes(n);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const root = await requireUniverseHome(flag('--universe'));
const outDir = path.join(root, 'beacon/out/pages');

/* ── 무엇을 올릴 것인가 ───────────────────────────────────── */

const pages = await fs.readdir(outDir).catch(() => null);
if (pages === null) {
  console.error('⛔ `beacon/out/pages` 가 없다 — 먼저 `node beacon/render.mjs` 로 렌더하라.');
  console.error('   ⛔ 낡은 산출을 발행하지 않으려고 여기서 멈춘다.');
  process.exit(1);
}
const only = flag('--only');
const files = pages.filter((f) => f.endsWith('.md')).filter((f) => !only || f === wikiFileNameOf(only)).sort();
if (files.length === 0) {
  console.error(`⛔ 올릴 것이 없다${only ? ` — --only ${only} 에 맞는 장이 없다` : ''}.`);
  process.exit(1);
}

/* ── 어디로 보낼 것인가 — **좌표를 적지 않고 origin 에서 뽑는다** ── */

const originUrl = flag('--remote') ?? await run('git', ['remote', 'get-url', 'origin'], { cwd: root })
  .then((r) => r.stdout.trim())
  .catch(() => '');
const derived = flag('--remote') ? { url: flag('--remote'), owner: '(직접 준 주소)', repo: '' } : wikiRemoteOf(originUrl);

if (derived === null) {
  console.error('⛔ **위키 주소를 못 세웠다** — `origin` 이 GitHub 이 아니거나 비어 있다.');
  console.error(`   origin: ${originUrl || '(없다)'}`);
  console.error('   ⛔ 모르는 호스트의 위키 주소를 지어내지 않는다 — `--remote <url>` 로 직접 줘라.');
  process.exit(2);
}

console.log('── 전파 — git 위키');
console.log(`   위키   ${derived.url}`);
console.log(`   장     ${files.length}개${only ? ` (--only ${only})` : ''}`);
console.log(`   미는가 ${has('--push') ? '예' : '**아니다** (--push 를 안 줬다 — 커밋까지만 한다)'}`);

if (has('--dry-run')) {
  console.log('\n(--dry-run — 네트워크를 쓰지 않는다. 올라갈 장:)');
  for (const f of files) {
    console.log(`   · ${f}`);
  }
  process.exit(0);
}

/* ── 클론 → 덮어쓰기 → 커밋 → (선택) 푸시 ───────────────── */

const work = await fs.mkdtemp(path.join(os.tmpdir(), 'universe-wiki-'));
const say = (label, result) => console.log(`   │ ${label}${result ? ` — ${result}` : ''}`);

try {
  console.log('\n── 위키를 클론한다');
  await run('git', ['clone', '--depth', '1', derived.url, work], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  say('클론', '완료');

  let changed = 0;
  for (const file of files) {
    const from = path.join(outDir, file);
    const to = path.join(work, file);
    const next = await fs.readFile(from, 'utf8');
    const prev = await fs.readFile(to, 'utf8').catch(() => null);
    if (prev === next) {
      continue;
    }
    await fs.writeFile(to, next);
    changed += 1;
    console.log(`   ${prev === null ? '+' : '~'} ${file}`);
  }

  if (changed === 0) {
    console.log('\n✅ 위키가 이미 발행본과 같다 — 올릴 것이 없다.');
    process.exit(0);
  }

  await run('git', ['add', '-A'], { cwd: work });
  /* ⚠️ 커밋 메시지에 사람 이름·계정을 적지 않는다 — 위키는 공개다. */
  await run('git', ['commit', '-m', `우주 전파 — 장 ${changed}개 갱신`], { cwd: work });
  say('커밋', `${changed}장`);

  if (!has('--push')) {
    console.log('\n⚠️ **밀지 않았다** — `--push` 를 줘야 바깥으로 나간다.');
    console.log(`   무엇이 바뀌는지 보려면: git -C ${work} show --stat`);
    process.exit(0);
  }

  await run('git', ['push', 'origin', 'HEAD'], { cwd: work, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  console.log(`\n✅ 발행했다 — 장 ${changed}개.`);
} catch (error) {
  const text = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message ?? ''}`;
  console.error('\n⛔ **못 했다** — git 이 실패했다.');
  console.error(text.split('\n').filter(Boolean).slice(-8).map((l) => `   ${l}`).join('\n'));
  /* 「위키가 아직 없다」와 「자격증명이 없다」를 갈라 준다 — 사람이 할 일이 다르다. */
  if (/could not read Username|Authentication failed|terminal prompts disabled/i.test(text)) {
    console.error('\n   ⚠️ 자격증명이 없다. `gh auth login` 을 하거나 토큰이 박힌 remote 를 `--remote` 로 줘라.');
    console.error('   ⚠️ 위키가 **한 번도 안 만들어졌으면** 클론 자체가 이렇게 실패한다 —');
    console.error('      GitHub 저장소의 Wiki 탭에서 첫 장을 한 번 만들어야 위키 git 저장소가 생긴다.');
  }
  process.exit(1);
} finally {
  await fs.rm(work, { recursive: true, force: true }).catch(() => {});
}
