#!/usr/bin/env node
/**
 * 새 사람의 길 — **문서에 적힌 순서를 빈 저장소에서 그대로 밟는다.**
 *
 * ⛔ 왜(R121): 이 길이 **조용히 깨져 있었다.** 문서대로 `init` → `galaxy` → `observe` 를 쳤더니
 * 세 번째가 **초록불인데 아무것도 안 쟀다** — `galaxy` 가 좌표 파일만 쓰고 이름을
 * `config.galaxies` 에 안 올렸기 때문이다. **새 사람이 처음 걷는 길에서 「못 쟀다」가 「통과」로
 * 보였다**(§8). 배달 관문은 ①과 ③의 일부만 봤고 이 틈을 못 봤다.
 *
 * ⚠️ **`--from`(3차)까지는 안 밟는다.** 에이전트를 부르기 때문이다 — ⛔ 「유료」라서가 아니라
 * (R140 실측: `claude -p` CLI 를 부르고, 키가 없으면 **구독**으로 돈다) **관문이 매 바퀴
 * 남의 사용량을 태우면 안 되기 때문**이다.
 *
 * ⚠️ 여기서 재는 것은 **문서가 시키는 그대로**다. 도구를 편하게 부르지 않는다 —
 * 편하게 부르면 새 사람이 겪는 것을 안 겪는다.
 *
 * 재는 법: `node observatory/verify-quickstart.mjs`
 */
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

const exec = promisify(execFile);
const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--keep', '--monorepo'], 'universe quickstart');
const ROOT = resolve(new URL('..', import.meta.url).pathname);
await requireUniverseSource(ROOT, 'universe quickstart');

const box = await mkdtemp(join(tmpdir(), 'universe-quickstart-'));
const failures = [];
const step = async (what, command, args, expect) => {
  const got = await exec(command, args, { cwd: box, maxBuffer: 32 * 1024 * 1024 })
    .then(({ stdout, stderr }) => ({ code: 0, out: `${stdout}${stderr}` }))
    .catch((error) => ({ code: error.code ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }));
  const ok = expect(got);
  console.log(`  ${ok ? '✅' : '❌'} ${what}  exit=${got.code}`);
  if (!ok) {
    /* ⛔ **마지막 3줄만 보이면 오류 메시지가 잘린다**(R144). 실측: `ReferenceError: saveGalaxy is
       not defined` 가 잘리고 `at main (...:711:7)` 스택만 남아, 「711줄이 왜 죽는지」를 찾느라
       상자를 세 번 되살렸다. **무엇이 깨졌는지는 메시지에 있고 어디서인지는 스택에 있다** —
       스택만 보여 주면 절반만 준 것이다. 오류 줄을 골라 **앞에** 붙인다. */
    const outLines = got.out.split('\n').filter(Boolean);
    const errorLine = outLines.filter((l) => /Error:|error:|⛔/.test(l)).slice(-1);
    const shown = [...new Set([...errorLine, ...outLines.slice(-3)])];
    failures.push(`${what}\n     ${shown.join('\n     ')}`);
  }
  return got;
};

/* ⛔ **모노레포 주장이 사라진 말뭉치에 기대고 있었다(R125).** 「✅ 실측했다」의 근거가
   977파일짜리 저장소였는데 **그 저장소가 없다**(R103 이 재현 불가로 적었다).
   ⇒ **작은 모노레포를 여기서 만든다** — 이제 매 바퀴 재현된다. */
const MONOREPO = process.argv.includes('--monorepo');
console.log(`── 새 사람의 길 — 문서 순서를 빈 저장소에서 밟는다${MONOREPO ? ' (모노레포)' : ''}\n`);
try {
  await exec('git', ['init', '-q', '.'], { cwd: box });
  await mkdir(join(box, 'src/components'), { recursive: true });
  const appDir = MONOREPO ? 'apps/web' : '.';
  const srcHome = MONOREPO ? join(box, 'apps/web/src/components') : join(box, 'src/components');
  await mkdir(srcHome, { recursive: true });
  await writeFile(join(box, 'package.json'), MONOREPO
    ? '{"name":"root","private":true,"workspaces":["apps/*","packages/*"]}\n'
    : '{"name":"my-app","scripts":{"build":"echo built","typecheck":"echo typed"}}\n', 'utf8');
  if (MONOREPO) {
    await writeFile(join(box, 'apps/web/package.json'),
      '{"name":"@acme/app-web","scripts":{"build":"echo built","typecheck":"echo typed"}}\n', 'utf8');
    /* ⚠️ 두 번째 워크스페이스는 **안 재야 하는 것**이다 — 은하는 앱 하나다. */
    await mkdir(join(box, 'packages/ui/src'), { recursive: true });
    await writeFile(join(box, 'packages/ui/package.json'), '{"name":"@acme/ui"}\n', 'utf8');
    await writeFile(join(box, 'packages/ui/src/B.tsx'),
      'export const B = () => <div className="m-[9px]" />;\n', 'utf8');
  }
  await writeFile(join(srcHome, 'A.tsx'),
    'export const A = () => <div className="p-[3px]" />;\n', 'utf8');

  /* ⛔ **진짜 저장소는 커밋이 있다.** 처음엔 커밋 없이 밟았더니 `--update` 가 옳게 거부했다 —
     「워킹트리가 오염돼 있다. 이 측정은 커밋에 귀속시킬 수 없다」(R64). 도구가 맞고 **내 상자가
     비현실적이었다.** 새 사람은 **이미 있는 저장소**에 우주를 깐다. */
  await exec('git', ['-c', 'user.email=probe@x', '-c', 'user.name=probe', 'commit', '-qm', 'init', '--allow-empty'], { cwd: box })
    .catch(() => undefined);
  await exec('git', ['add', '-A'], { cwd: box });
  await exec('git', ['-c', 'user.email=probe@x', '-c', 'user.name=probe', 'commit', '-qm', '첫 커밋'], { cwd: box });

  await step('① 깐다', process.execPath, [join(ROOT, 'bin/init.mjs')], (r) => r.code === 0);
  /* ⛔ **코드 폴더를 하나만 말하면 나머지는 안 보인다(R129).** Next 앱(`app/`)에서 실제로
     그랬다 — `src/` 만 말해 좌표가 굳었고 **관측이 진짜 코드를 하나도 안 봤다.**
     여기서는 `app/` 을 하나 더 만들어 **둘 다 보여 주는지** 잰다. */
  /* ⚠️ 단일 앱에만 넣는다. 모노레포 갈래에 넣었더니 **그 은하의 기준선이 흔들려** ⑤-b 가
     깨졌다 — 시험이 시험을 오염시킨 것이다(R62 의 그 종류). */
  if (!MONOREPO) {
    await mkdir(join(box, 'app'), { recursive: true });
    await writeFile(join(box, 'app/page.tsx'),
      'export default function Page() { return <div className="p-[5px]" />; }\n', 'utf8');
  }

  await step('② 좌표 초안 — 이름을 목록에 올린다',
    process.execPath, [join(ROOT, 'bin/universe.mjs'), 'galaxy', 'my-app', '--dir', '.', '--universe', './universe'],
    (r) => r.code === 0 && /목록에 `my-app` 을 올렸다/.test(r.out)
      /* 단일 앱일 때만 꼭대기에 둘이 보인다 — 모노레포는 앱 폴더 안이라 이 줄이 안 뜬다. */
      && (MONOREPO || /코드가 든 꼭대기 폴더 2개/.test(r.out)));

  /* ⛔ **여기가 R121 이 깨져 있던 자리다.** TODO 가 남은 좌표로는 초록불이 나면 안 된다. */
  await step('③ TODO 가 남은 좌표를 거부한다',
    process.execPath, [join(ROOT, 'bin/universe.mjs'), 'observe', '--universe', './universe'],
    (r) => r.code !== 0 && /좌표가 없는 자리를 가리킨다/.test(r.out));

  const coord = join(box, 'universe/galaxies/my-app.json');
  let filled = (await readFile(coord, 'utf8'))
    .replace(/"TODO: 모노레포다 — 위 후보에서 골라[^"]*"/, '"@acme/app-web"')
    .replace(/"TODO: 모노레포다 — 위 후보의 폴더[^"]*"/, `"${appDir}"`)
    .replace(/"TODO:[^"]*"/g, '"src/components"');
  await writeFile(coord, filled, 'utf8');
  /* 우주와 채운 좌표도 커밋한다 — 문서가 「`universe/` 를 git 에 올려라」라고 시킨다. */
  await exec('git', ['add', '-A'], { cwd: box });
  await exec('git', ['-c', 'user.email=probe@x', '-c', 'user.name=probe', 'commit', '-qm', '우주를 깐다'], { cwd: box });

  await step('④ 기준선을 심는다',
    process.execPath, [join(ROOT, 'bin/universe.mjs'), 'observe', '--universe', './universe', '--update'],
    (r) => r.code === 0);
  await step('⑤ 그 뒤 관측이 초록불이다',
    process.execPath, [join(ROOT, 'bin/universe.mjs'), 'observe', '--universe', './universe'],
    (r) => r.code === 0);
  /* ⛔ 모노레포면 **앱 하나만** 재야 한다 — 두 번째 워크스페이스의 위반이 세이면 은하가 틀린 것이다. */
  if (MONOREPO) {
    const measured = await exec(process.execPath,
      [join(ROOT, 'bin/universe.mjs'), 'observe', '--universe', './universe'], { cwd: box })
      .then(({ stdout }) => stdout).catch((e) => e.stdout ?? '');
    const ok = /apps\/web\/src/.test(measured) && !/packages\/ui/.test(measured);
    console.log(`  ${ok ? '✅' : '❌'} ⑤-b 앱 하나만 잰다 (packages/ui 는 안 본다)`);
    if (!ok) {
      failures.push('⑤-b 앱 하나만 잰다 — 다른 워크스페이스까지 쟀거나 앱을 못 찾았다');
    }
  }

  await step('⑥ 별이 태어난다',
    process.execPath, [join(ROOT, 'bin/universe.mjs'), 'new', 'my-app', 'src/components', 'DashboardToday', '--universe', './universe'],
    (r) => r.code === 0 && /별이 태어났다/.test(r.out));

  /**
   * ⑦ **「끝났는가」까지 간다.** 사람의 계획은 여기서 끝난다 — 재고 · 화면 시험 · 판정 · 반복.
   *
   * ⛔ 새 은하는 `commands.e2e` 를 **선언하지 않았다.** 그러면 이 칸은 ⚪(3)여야 한다 —
   *   **초록도 빨강도 아니다.** 실측(R163): 등록된 은하 하나도 그 축을 선언 안 해서
   *   이 칸은 **한 번도 안 돌았고**, 사람은 계획의 마지막 칸이 있는지도 몰랐다.
   * ⚠️ 여기서 브라우저를 띄우지 않는다 — 관문이 매 바퀴 화면 시험을 돌리면 아무도 안 본다.
   *   재는 것은 **길이 이어져 있는가**이고, 실제 주행은 `probe-loop`·`qa-e2e` 은하가 잰다.
   */
  await step('⑦ 「끝났는가」가 이어져 있다 (축이 없으면 ⚪ 3)',
    process.execPath, [join(ROOT, 'bin/universe.mjs'), 'loop', '--galaxy', 'my-app', '--universe', './universe'],
    /**
     * ⛔ **⚪ 가 났다고 통과가 아니다 — 「왜 ⚪ 인가」를 본다.**
     *
     * ⚠️⚠️ **이 칸이 실제로 재는 것을 정확히 적는다.** 갓 깐 우주엔 `qa/dist` 가 **안 배달된다** —
     * 그래서 여기서 나오는 ⚪ 는 **언제나 「TC 계약이 안 지어져 있다」**이고, 「축을 선언 안 했다」
     * 갈래는 **이 상자에서 한 번도 안 밟힌다.** 변이로 확인했다(축 문구를 바꿔도 안 물린다).
     * ⇒ 여기서 재는 것은 **「길이 이어져 있고, 못 잴 때 ⚪ 로 정직하게 죽는가」**까지다.
     *   축 갈래는 `probe-loop.sh` 가, 실제 주행은 `qa-e2e` 은하가 잰다.
     * ⛔ 「둘 중 하나면 통과」로 두면 **재는 척**이 된다 — 그래서 무엇을 못 재는지 여기 적었다.
     */
    (r) => r.code === 3 && /(commands\.e2e|TC 계약)/.test(r.out));
} finally {
  if (!argv.includes('--keep')) {
    await rm(box, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(`\n⛔ 새 사람의 길이 ${failures.length}곳에서 막힌다 — **문서가 시키는 그대로 쳤는데**:`);
  for (const f of failures) {
    console.error(`   ${f}`);
  }
  process.exit(1);
}
console.log('\n✅ 새 사람이 문서대로만 쳐도 별까지 간다.');
