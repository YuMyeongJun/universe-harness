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
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
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

/**
 * ⚠️ `stdout` 을 **따로** 돌려준다. `npm pack --json` 의 출력을 파싱해야 하는데
 * stderr 의 경고가 섞이면 JSON 이 깨진다. `out` 은 사람에게 보여 줄 합본이다.
 */
const run = (command, args, cwd) =>
  new Promise((resolve_) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let stdout = '';
    child.stdout.on('data', (c) => { out += c.toString(); stdout += c.toString(); });
    child.stderr.on('data', (c) => { out += c.toString(); });
    child.on('close', (code) => resolve_({ code: code ?? 1, out, stdout }));
    child.on('error', (e) => resolve_({ code: 1, out: String(e), stdout: '' }));
  });

const box = await mkdtemp(join(tmpdir(), 'universe-delivery-'));
let failed = 0;

try {
  console.log('── 배달본이 도는가 — **진짜로 꾸리고, 빈 저장소에 깔아서 잰다**\n');

  /**
   * ① **꾸린다.** ⛔ 원본에서 `bin/init.mjs` 를 돌리는 것으로 대신하지 마라 —
   *    그러면 `packageHome` 이 원본을 가리켜 **배달 목록의 구멍이 영영 안 보인다.**
   *    ⚠️⚠️ 실측(2026-09-08): 이 검사가 바로 그렇게 돌고 있었고, 그래서
   *    `universe.config.json` 이 `files` 에 없어 **`init` 이 fresh install 에서 죽는 것**을
   *    3.4초짜리 초록불로 덮고 있었다. 결함 6개가 그 아래 숨어 있었다.
   */
  const packed = await run('npm', ['pack', '--pack-destination', box, '--json'], ROOT);
  if (packed.code !== 0) {
    console.error(`  ⛔ npm pack 이 실패했다(exit ${packed.code}).`);
    console.error(packed.out.split('\n').slice(-10).map((l) => `     ${l}`).join('\n'));
    process.exit(1);
  }
  let tarball;
  try {
    tarball = join(box, JSON.parse(packed.stdout)[0].filename);
  } catch {
    console.error('  ⛔ npm pack 의 출력을 못 읽었다 — 꾸러미 이름을 모른다.');
    console.error(packed.stdout.split('\n').slice(0, 6).map((l) => `     ${l}`).join('\n'));
    process.exit(1);
  }
  console.log(`  ✅ 꾸렸다 — ${tarball.split('/').pop()}`);

  /** ② **빈 저장소에 깐다.** 이 패키지는 의존이 0개라 네트워크 없이 깔린다. */
  const repo = join(box, 'consumer');
  await mkdir(repo, { recursive: true });
  await run('git', ['init', '-q'], repo);
  await run('npm', ['init', '-y'], repo);
  const installed = await run('npm', ['install', '--silent', '--no-audit', '--no-fund', tarball], repo);
  if (installed.code !== 0) {
    console.error(`  ⛔ 깔다가 실패했다(exit ${installed.code}).`);
    console.error(installed.out.split('\n').slice(-10).map((l) => `     ${l}`).join('\n'));
    process.exit(1);
  }
  /**
   * ⛔⛔ **`.bin/universe` 는 「명령 이름」이라 패키지 이름이 바뀌어도 그대로다.**
   * npm 은 `package.json` 의 `bin` **키**로 이 파일을 만든다 — 패키지 이름(`universe-front-harness`)이
   * 아니다. 여기를 `.bin/universe-front-harness` 로 바꾸면 **이 검사만 빨개지고 제품은 멀쩡**하다
   * (더 나쁜 쪽으로는, `bin` 키를 바꿔 놓고 이 줄도 같이 바꾸면 **훅이 CLI 를 못 찾는 것**을
   * 이 검사가 못 잡는다 — `.githooks/pre-commit` 이 `node_modules/.bin/universe` 를 찾는다).
   * ⚠️ 위의 tgz 이름은 `npm pack --json` 이 알려 준 것을 쓴다 — **패키지 이름을 손으로 안 적는다.**
   * 그래서 이 파일에는 패키지 이름이 한 글자도 없고, 이름이 바뀌어도 이 검사는 안 낡는다.
   */
  const cli = join(repo, 'node_modules/.bin/universe');
  if (!existsSync(cli)) {
    console.error('  ⛔ 깔았는데 `node_modules/.bin/universe` 가 없다 — bin 선언이 깨졌다.');
    process.exit(1);
  }
  console.log('  ✅ 깔았다 — node_modules/.bin/universe');

  /** ③ **소비자가 제일 먼저 치는 명령.** 여기서 죽으면 제품의 정문이 막힌 것이다. */
  const init = await run(cli, ['init'], repo);
  if (init.code !== 0) {
    console.error(`  ⛔ **배달본의 「init」 이 죽는다**(exit ${init.code}). 소비자가 첫 명령에서 막힌다.`);
    console.error(init.out.split('\n').slice(-12).map((l) => `     ${l}`).join('\n'));
    process.exit(1);
  }
  const home = join(repo, 'universe');
  if (!existsSync(home)) {
    console.error('  ⛔ init 은 성공했다는데 `universe/` 가 없다.');
    process.exit(1);
  }
  console.log('  ✅ init 이 돈다 — universe/ 가 생겼다');

  /* ⚠️ 산출물이 추적되면 워킹트리가 늘 더러워 **게이트가 영영 판정을 못 낸다**(실측 R46).
     그리고 두 번 깔아도 줄이 두 번 들어가면 안 된다 — 그건 남의 파일을 어지르는 것이다. */
  const ignoreOnce = await readFile(join(repo, '.gitignore'), 'utf8').catch(() => '');
  await run(cli, ['init', '--force'], repo);
  const ignoreTwice = await readFile(join(repo, '.gitignore'), 'utf8').catch(() => '');
  const hasLine = /^\s*\.harness\/?\s*$/m.test(ignoreOnce);
  const count = (ignoreTwice.match(/^\s*\.harness\/?\s*$/gm) ?? []).length;
  console.log(`  ${hasLine && count === 1 ? '✅' : '❌'} .gitignore 에 산출물을 넣는다 (두 번 깔아도 한 줄: ${count}줄)`);
  if (!hasLine || count !== 1) {
    console.error('     ⛔ 산출물이 추적되면 워킹트리가 늘 더럽고, 게이트는 「별 때문인지 원래 그랬는지 못 가린다」로 끝난다.');
    failed += 1;
  }

  /**
   * ④ **안내가 시키는 명령이 정말 도는가.**
   * R43 에서 진짜 저장소에 깔고 안내의 3번을 쳤더니 **「관측 엔진을 찾지 못했다」**로 죽었다.
   * ⚠️⚠️ 그리고 2026-09-08 실측: 엔진 `dist` 가 **껍데기로** 실리고(글로브에 `/**` 가 없었다),
   * 실리게 고쳤더니 이번엔 dist 가 형제를 **이름으로** 불러 `ERR_MODULE_NOT_FOUND` 로 죽었다.
   * 둘 다 원본에서는 심링크 덕에 멀쩡히 돌아서 **여기서만** 보이는 결함이었다.
   */
  const guided = await run(cli, ['observe', '--universe', home], repo);
  const engineLost = guided.out.includes('관측 엔진을 찾지 못했다');
  console.log(`  ${guided.code === 0 && !engineLost ? '✅' : '❌'} 안내대로 부르면 돈다 — universe observe --universe <깔린 폴더>  exit=${guided.code}`);
  if (guided.code !== 0 || engineLost) {
    console.error('     ⛔ 갓 깐 우주에서 **안내가 시키는 명령이 안 돈다.** 안내가 거짓말이면 아무도 두 번 안 쓴다.');
    console.error(guided.out.split('\n').filter(Boolean).slice(-8).map((l) => `     ${l}`).join('\n'));
    failed += 1;
  }

  /**
   * ⑤ **갓 깐 우주에서 관문 전부를 돌려 본다.**
   * 실측(R58): 소비 저장소에서 **13개 중 9개가 빨간불**이었다 — 고장이 아니라
   * **거기서는 잴 수 없는 것들**이 실려 간 것이었다. 그것을 본 사람은 도구가 깨진 줄 알고
   * 관문을 안 믿는 법부터 배운다.
   * ⇒ 갓 깐 우주는 **빨간불 0개**여야 한다. 못 재는 것은 ⚪ 로 세어야 한다.
   */
  const checked = await run(cli, ['check', '--universe', home], repo);
  console.log(`  ${checked.code === 0 ? '✅' : '❌'} 갓 깐 우주에서 관문이 빨간불 0개  exit=${checked.code}`);
  if (checked.code !== 0) {
    console.error('     ⛔ 배달본에서 빨간불이 난다 — 잴 수 없는 검사가 실려 갔거나, 관문 파일이 안 실렸거나, 진짜 고장이다.');
    console.error(checked.out.split('\n').filter(Boolean).slice(-14).map((l) => `     ${l}`).join('\n'));
    failed += 1;
  }

  /**
   * ⑥ **소비자 관문이 전부 실렸는가** — 안 실으면 「⏭ 없다」로 조용히 건너뛴다.
   * ⚠️⚠️ 실측(2026-09-08): 소비자 관문 11개 중 **7개가 안 실리고 있었다** —
   * `lint 드리프트` · `광속 한계` · `못 읽는 비율` 이 그 안에 있었다. 즉 이 제품이 내세운
   * 목표 넷 중 셋이 **배달되지 않았다.** ⛔ 거짓말은 아니지만 제품이 아무도 모르게 줄어든다.
   */
  const { GATES } = await import('../lib/gates.mjs');
  const missing = GATES
    .filter((g) => g.scope !== 'universe')
    .filter((g) => !existsSync(join(home, g.file)));
  console.log(`  ${missing.length === 0 ? '✅' : '❌'} 소비자 관문이 전부 실렸다 (안 실린 것 ${missing.length}개)`);
  if (missing.length > 0) {
    for (const g of missing) console.error(`     ⛔ ${g.label} — ${g.file} 가 배달되지 않았다`);
    console.error('     ⇒ `package.json` 의 `files` 에 더하거나, 소비자용이 아니면 `scope: \'universe\'` 로 적어라.');
    failed += 1;
  }
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
