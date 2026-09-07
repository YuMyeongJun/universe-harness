#!/usr/bin/env node
/**
 * 커밋 관문을 켠다 — `git config core.hooksPath .githooks`.
 *
 * ⚠️ git 훅은 **저장소를 클론해도 자동으로 안 켜진다.** `.git/hooks` 는 커밋되지 않기
 * 때문이다. 그래서 훅을 `.githooks/` 에 두고 이 명령으로 가리키게 한다.
 * 켜지 않으면 관문은 `round close` 에만 있고, 그건 **늦다** — 죽은 규칙이 HEAD 에
 * 며칠 살 수 있다(실측: `a11y/img-alt` 가 그랬다).
 *
 * 재는 법:
 *   node bin/hooks.mjs           # 상태를 본다 (0=켜짐 · 1=꺼짐)
 *   node bin/hooks.mjs --install # 켠다
 *   node bin/hooks.mjs --uninstall
 */
import { spawn } from 'node:child_process';
import { access, constants, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { requireUniverseHome } from '../lib/home.mjs';
import { rejectUnknownFlags } from '../lib/flags.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--install', '--uninstall'], 'universe hooks');

const universeArg = argv.indexOf('--universe');
const root = await requireUniverseHome(universeArg === -1 ? undefined : argv[universeArg + 1]);

const git = (args) =>
  new Promise((resolve) => {
    const child = spawn('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.on('close', (code) => resolve({ code: code ?? 1, out: out.trim() }));
  });

const HOOK = join(root, '.githooks/pre-commit');
const hookExists = await access(HOOK, constants.X_OK).then(() => true).catch(() => false);
if (!hookExists) {
  console.error('⛔ `.githooks/pre-commit` 이 없거나 실행 권한이 없다.');
  console.error('   이 저장소가 우주의 집이 맞는지 확인하라.');
  process.exit(1);
}

if (argv.includes('--uninstall')) {
  await git(['config', '--unset', 'core.hooksPath']);
  console.log('🛡  커밋 관문을 껐다. 이제 `round close` 만 문다 — 그건 늦다.');
  process.exit(0);
}

if (argv.includes('--install')) {
  /* ⚠️⚠️ `core.hooksPath` 는 **저장소 루트 기준**으로 풀린다. 우주가 하위 디렉터리에
     깔린 소비 저장소에서 `.githooks` 로 박으면 git 이 없는 경로를 보고 **아무 말 없이
     훅을 안 돈다.** 종단 시험(빈 저장소에 init → install → 법칙을 깨고 커밋)에서
     잡았다 — 안 했으면 깨진 채로 배달했다. */
  const { out: top } = await git(['rev-parse', '--show-toplevel']);
  const hookDir = relative(top || root, join(root, '.githooks')).split(sep).join('/') || '.githooks';
  const { code } = await git(['config', 'core.hooksPath', hookDir]);
  if (code !== 0) {
    console.error('⛔ `git config core.hooksPath .githooks` 가 실패했다.');
    process.exit(1);
  }
  console.log(`🛡  커밋 관문을 켰다 — **빠른 것만** 돈다(느린 것은 round close 가 본다). (core.hooksPath=${hookDir})`);
  /* ⚠️ **손으로 적은 목록은 낡는다.** 여기엔 넷이 적혀 있었는데 훅은 **다섯**을 돌고 있었다
     (`부품 시험` 이 R38 에 늘었는데 안내는 그대로였다 · 실측 R73).
     ⇒ **훅에서 읽는다.** 훅이 진실이고 안내는 그 그림자다(R55 의 처방과 같다). */
  const hookText = await readFile(HOOK, 'utf8').catch(() => '');
  const labels = [...hookText.matchAll(/^run '([^']+)'/gm)].map((m) => m[1]);
  console.log(`   ${labels.join(' · ') || '(훅을 못 읽었다 — 목록을 셀 수 없다)'}`);
  console.log('   급할 때만 `git commit --no-verify` (그래도 `round close` 가 다시 문다).');
  process.exit(0);
}

const { out: topNow } = await git(['rev-parse', '--show-toplevel']);
const expected = relative(topNow || root, join(root, '.githooks')).split(sep).join('/') || '.githooks';
const { out } = await git(['config', '--get', 'core.hooksPath']);
if (out === expected) {
  console.log(`🛡  커밋 관문 — **켜져 있다** (\`core.hooksPath=${expected}\`)`);
  process.exit(0);
}
console.log(`🛡  커밋 관문 — **꺼져 있다**${out ? ` (hooksPath=${out})` : ''}`);
console.log('   켜려면: `universe hooks --install`');
console.log('   ⚠️ 안 켜면 관문은 `round close` 에만 있다. 그건 늦다 — 죽은 규칙이 HEAD 에 며칠 산다.');
process.exit(1);
