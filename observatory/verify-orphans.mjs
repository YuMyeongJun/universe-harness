#!/usr/bin/env node
/**
 * **아무도 안 가리키는 별을 센다** — 「사람이 볼 수 있는가」의 싼 절반(R157).
 *
 * ⚠️⚠️ 이 저장소는 **세 자리에** 이렇게 적어 두고도 재지 않았다:
 *
 *     게이트는 별이 도는지 볼 뿐, **사람이 볼 수 있는지는 안 본다**
 *
 * 그리고 더 나쁜 것: **3차 팽창은 구조적으로 이 구멍을 만든다.** 에이전트의 patch 는
 * 별의 폴더 안으로 묶여 있어서 **라우터를 못 건드린다** — 3차가 성공해도 그 별은
 * 아무도 못 본다. 도구가 그걸 알면서 「라우트에 잇는다」고 **말만** 했다.
 *
 * ## ⛔ 왜 「커밋된 별」만 세는가 — 이것이 이 검사의 전부다
 *
 * 갓 태어난 별이 아직 고아인 것은 **정상이다.** 방금 만들었으니까.
 * 그걸 빨간불로 내면 `universe new` 직후마다 관문이 막혀 **사람이 검사를 끄게** 된다.
 * ⇒ **커밋된 별**만 센다. 커밋했다는 것은 「이걸로 됐다」고 말한 것이고,
 *    그런데 아무도 안 가리키면 그것은 **죽은 코드**다.
 * ⚠️ 시간(며칠 지났나)으로 가르지 않는다 — 시계는 기계마다 다르고 checkout 이 바꾼다(R48 이 겪었다).
 *
 * ## 못 잡는 것 (§8 — 적어 둔다)
 *   · **동적 import 나 문자열로 만든 경로**로만 이어진 별. 이름이 소스에 안 나오면 못 본다.
 *   · 「이어졌지만 **브라우저에서 깨지는**」 것. 그건 `commands.e2e` 축이 잰다 —
 *     ⛔ 은하가 선언해야 돈다. 이 검사는 브라우저를 안 띄운다.
 *
 * 재는 법: `node observatory/verify-orphans.mjs`
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { findGalaxyFile, resolveGalaxyPath } from '../lib/galaxy-load.mjs';

const run = promisify(execFile);
const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--galaxy'], 'universe orphans');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const root = await requireUniverseHome(flag('--universe'));
const config = JSON.parse(await readFile(path.join(root, 'universe.config.json'), 'utf8'));
const names = flag('--galaxy') ? [flag('--galaxy')] : (config.galaxies ?? []);

const walk = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      out.push(...await walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

console.log('── 고아 별 — 아무도 안 가리키는 별이 있는가');

let orphans = 0;
let looked = 0;

for (const name of names) {
  const file = await findGalaxyFile(root, name);
  if (!file) {
    continue;
  }
  const galaxy = resolveGalaxyPath(root, JSON.parse(await readFile(file, 'utf8')));
  if (!(await stat(galaxy.path).catch(() => null))) {
    console.log(`  ⏭  ${name} — 은하가 그 자리에 없다(다른 기계다). 못 쟀다.`);
    continue;
  }

  const appSrc = path.join(galaxy.path, galaxy.appDir || '.', 'src');
  const files = await walk(appSrc);
  if (files.length === 0) {
    console.log(`  ⏭  ${name} — ${path.relative(galaxy.path, appSrc)} 아래에 소스가 없다. 못 쟀다.`);
    continue;
  }

  /* 별 = `index.ts` 를 가진 폴더. 빅뱅이 내는 모양이다. */
  const stars = [...new Set(files.filter((f) => path.basename(f) === 'index.ts').map((f) => path.dirname(f)))];
  /* 태양계 아래의 것만 본다 — 은하의 다른 배럴까지 별로 세면 시끄러워진다. */
  const roots = (galaxy.solarSystems ?? []).map((s) => path.join(galaxy.path, galaxy.appDir || '.', s.srcDir));
  const mine = stars.filter((s) => roots.some((r) => s === r || s.startsWith(`${r}${path.sep}`)));

  for (const star of mine) {
    /* ⛔ **커밋된 것만 센다**(위 ⛔ 참고). 갓 만든 별은 아직 고아인 것이 정상이다. */
    const tracked = await run('git', ['ls-files', '--', star], { cwd: galaxy.path })
      .then((r) => r.stdout.trim() !== '')
      .catch(() => false);
    if (!tracked) {
      continue;
    }
    looked += 1;
    const starName = path.basename(star);
    const outside = files.filter((f) => !f.startsWith(`${star}${path.sep}`));
    /**
     * ⛔ **이름을 그냥 `includes` 로 찾으면 안 된다**(첫 판에서 밟았다).
     * 진짜 은하에는 `date`·`stat`·`type`·`mall` 같은 **짧은 이름**의 별이 있는데,
     * 그러면 `src/assets/svg/index.ts` 같은 무관한 파일에 **글자로만 걸려** 「이어져 있다」가 된다.
     * 그 방향의 오류는 **고아를 못 잡는 쪽**이라 조용하다 — 검사가 장식이 되는 자리다.
     * ⇒ **경로 조각**으로 본다: 따옴표나 `/` 로 끊긴 자리에 그 이름이 통째로 있어야 한다.
     *   `from './MenuBadge'` · `from '../shop/MenuBadge'` · `'@/components/shop/MenuBadge'` ✅
     *   `HostingBadge.tsx` 안의 `type` 이라는 낱말 ❌
     */
    const segment = new RegExp(`['"\`/]${starName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=['"\`/])`);
    const refs = [];
    for (const f of outside) {
      if (segment.test(await readFile(f, 'utf8'))) {
        refs.push(path.relative(galaxy.path, f));
      }
    }
    if (refs.length === 0) {
      orphans += 1;
      console.log(`\n  ⛔ ${name} · ${path.relative(galaxy.path, star)}`);
      console.log('     **커밋됐는데 아무도 안 가리킨다** — 사람이 볼 수 없는 별이다.');
      console.log('     → 은하의 라우터나 상위 화면에서 이어라. 이을 곳이 없으면 지워라.');
    } else {
      console.log(`  ✅ ${name} · ${starName}  ← ${refs.slice(0, 2).join(', ')}`);
    }
  }
}

/* 관측 법칙 §8 — 한 개도 안 봤으면 「없다」가 아니라 「못 쟀다」이다. */
if (looked === 0) {
  console.log('\n⚠️ **못 쟀다** — 커밋된 별을 하나도 못 찾았다(은하가 없거나 태양계에 별이 없다).');
  process.exit(0);
}
if (orphans > 0) {
  console.error(`\n⛔ 고아 별 ${orphans}개 — 만들어 놓고 **아무도 못 보는 코드**다.`);
  console.error('   ⚠️ 이 검사는 이름으로 찾는다 — 동적 import 로만 이어진 별은 못 본다(§8).');
  process.exit(1);
}
console.log(`\n✅ 커밋된 별 ${looked}개가 전부 어디선가 가리켜진다.`);
