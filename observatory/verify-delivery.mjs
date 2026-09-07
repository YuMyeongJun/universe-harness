#!/usr/bin/env node
/**
 * **배달본이 도는가** — 빈 저장소에 깔아 보고 그 우주의 관문을 돌린다.
 *
 * ⚠️ 왜 있는가: `universe init` 이 **42커밋 동안 깨진 우주를 만들고 있었다.**
 * 배달되는 `observatory/*.mjs` 가 `../lib/*.mjs` 를 import 하는데 `lib/` 이 배달 목록에
 * 없어 `ERR_MODULE_NOT_FOUND` 로 죽었다. 원본 저장소에서는 `lib/` 이 있으니 늘 초록불이었다.
 * **아무도 배달본을 돌려본 적이 없어서** 몰랐다.
 *
 * 원본이 도는 것은 배달본이 도는 것과 다르다. 그 둘을 가르는 것이 이 검사다.
 *
 * 재는 법:
 *   node observatory/verify-delivery.mjs
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

rejectUnknownFlags(process.argv.slice(2), ['--universe', '--keep'], 'universe delivery');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/* 배달본에서 직접 부르면 사유를 대고 죽는다 — 생 스택트레이스 대신(R91). */
await requireUniverseSource(ROOT, 'universe delivery');
const keep = process.argv.includes('--keep');

const run = (command, args, cwd) =>
  new Promise((resolve_) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.stderr.on('data', (c) => { out += c.toString(); });
    child.on('close', (code) => resolve_({ code: code ?? 1, out }));
  });

const box = await mkdtemp(join(tmpdir(), 'universe-delivery-'));
let failed = 0;

try {
  const init = await run(process.execPath, [join(ROOT, 'bin/init.mjs')], box);
  console.log(`── 배달본이 도는가 — 빈 곳에 깔았다`);
  if (init.code !== 0) {
    console.error(`  ⛔ init 이 실패했다(exit ${init.code}).`);
    console.error(init.out.split('\n').slice(-10).map((l) => `     ${l}`).join('\n'));
    process.exit(1);
  }

  const home = join(box, 'universe');
  if (!existsSync(home)) {
    console.error('  ⛔ init 은 성공했다는데 `universe/` 가 없다.');
    process.exit(1);
  }

  /* 엔진이 필요한 검사는 여기서 못 돈다 — 엔진은 일부러 배달하지 않는다(패키지가 준다).
     그러니 **엔진 없이도 돌아야 하는 것**만 본다. 못 재는 것은 못 잰다고 적는다. */
  const checks = [
    ['우주 형식', 'bash', [join(home, 'observatory/verify-laws.sh')]],
    ['문서 링크', process.execPath, [join(home, 'observatory/verify-links.mjs')]],
  ];

  for (const [label, command, args] of checks) {
    const { code, out } = await run(command, args, home);
    console.log(`  ${code === 0 ? '✅' : '❌'} ${label}  exit=${code}`);
    if (code !== 0) {
      console.log(out.split('\n').filter(Boolean).slice(-6).map((l) => `     ${l}`).join('\n'));
      failed += 1;
    }
  }

  /**
   * ⚠️⚠️ **안내가 시키는 명령이 정말 도는가.**
   * R43 에서 진짜 저장소에 깔고 안내의 3번(`universe observe`)을 쳤더니
   * **「관측 엔진을 찾지 못했다」**로 죽었다. 배달본이 「도는지」는 재고 있었지만
   * **안내가 시키는 대로 했을 때 도는지**는 아무도 안 쟀다.
   * 엔진은 패키지가 들고 오므로, 부르는 쪽이 패키지여야 한다 — 그 형태를 여기서 판정한다.
   */
  /* ⚠️ 산출물이 추적되면 워킹트리가 늘 더러워 **게이트가 영영 판정을 못 낸다**(실측 R46).
     그리고 두 번 깔아도 줄이 두 번 들어가면 안 된다 — 그건 남의 파일을 어지르는 것이다. */
  const ignoreOnce = await readFile(join(box, '.gitignore'), 'utf8').catch(() => '');
  await run(process.execPath, [join(ROOT, 'bin/init.mjs'), '--force'], box);
  const ignoreTwice = await readFile(join(box, '.gitignore'), 'utf8').catch(() => '');
  const hasLine = /^\s*\.harness\/?\s*$/m.test(ignoreOnce);
  const count = (ignoreTwice.match(/^\s*\.harness\/?\s*$/gm) ?? []).length;
  console.log(`  ${hasLine && count === 1 ? '✅' : '❌'} .gitignore 에 산출물을 넣는다 (두 번 깔아도 한 줄: ${count}줄)`);
  if (!hasLine || count !== 1) {
    console.error('     ⛔ 산출물이 추적되면 워킹트리가 늘 더럽고, 게이트는 「별 때문인지 원래 그랬는지 못 가린다」로 끝난다.');
    failed += 1;
  }

  const guided = await run(process.execPath, [join(ROOT, 'bin/universe.mjs'), 'observe', '--universe', home], box);
  const engineLost = guided.out.includes('관측 엔진을 찾지 못했다');
  console.log(`  ${guided.code === 0 && !engineLost ? '✅' : '❌'} 안내대로 부르면 돈다 — universe observe --universe <깔린 폴더>  exit=${guided.code}`);
  if (guided.code !== 0 || engineLost) {
    console.error('     ⛔ 갓 깐 우주에서 **안내가 시키는 명령이 안 돈다.** 안내가 거짓말이면 아무도 두 번 안 쓴다.');
    console.error(guided.out.split('\n').filter(Boolean).slice(-6).map((l) => `     ${l}`).join('\n'));
    failed += 1;
  }

  /**
   * ⚠️⚠️ **갓 깐 우주에서 관문 전부를 돌려 본다.**
   * 실측(R58): 소비 저장소에서 `universe check` 를 돌리자 **13개 중 9개가 빨간불**이었다 —
   * 고장이 아니라 **거기서는 잴 수 없는 것들**이 실려 간 것이었다. 그것을 본 사람은
   * 도구가 깨진 줄 알고 관문을 안 믿는 법부터 배운다.
   * ⇒ 갓 깐 우주는 **빨간불 0개**여야 한다. 못 재는 것은 「못 잰다」로 세어야 한다.
   */
  const checked = await run(process.execPath, [join(ROOT, 'bin/check.mjs'), '--universe', home], box);
  console.log(`  ${checked.code === 0 ? '✅' : '❌'} 갓 깐 우주에서 관문 전부가 초록불  exit=${checked.code}`);
  if (checked.code !== 0) {
    console.error('     ⛔ 배달본에서 빨간불이 난다 — 잴 수 없는 검사가 실려 갔거나 진짜 고장이다.');
    console.error(checked.out.split('\n').filter(Boolean).slice(-10).map((l) => `     ${l}`).join('\n'));
    failed += 1;
  }

  console.log('  ⏭  엔진이 필요한 나머지 검사(계약 규칙 · 행동 계약)는 여기서 못 돈다 — 엔진은 패키지가 준다');
  console.log('     이 검사가 보는 것은 **엔진 없이도 돌아야 하는 것**뿐이다.');
} finally {
  if (keep) {
    console.log(`\n   (남겨 둠: ${box})`);
  } else {
    await rm(box, { recursive: true, force: true });
  }
}

if (failed > 0) {
  console.error(`\n⛔ 배달본에서 빨간 검사 ${failed}건. **원본이 도는 것과 배달본이 도는 것은 다르다.**`);
  process.exit(1);
}
console.log('\n✅ 갓 깐 우주가 자기 관문을 통과한다.');
