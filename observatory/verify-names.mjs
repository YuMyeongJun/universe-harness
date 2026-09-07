#!/usr/bin/env node
/**
 * **같은 이름이 여러 곳에서 나오는가** — 토스 「이름 겹치지 않게 관리하기」.
 *
 * ⚠️ 왜 규칙이 아니라 여기 있나: 이름 충돌은 **저장소 전체를 봐야** 보인다.
 * 관문(Contract)은 패치의 파일 하나하나를 보므로 이 검사가 안 들어간다.
 *
 * ⚠️ 왜 기준선을 쓰나: 충돌이 **전부 나쁜 것은 아니다.** 플러그인마다 자기
 * `createStage01` 을 갖는 것은 병렬 구조이지 복제가 아니다. 반대로
 * `parseArgv` 가 두 곳에 있던 것은 **진짜 복제**였고 코어로 올렸다(9 → 5).
 * 그 판단을 사람이 한 번 하고 **기준선에 사유와 함께** 적어 둔다.
 * 새 충돌이 생기면 그때 다시 판단하게 만드는 것이 이 검사의 전부다.
 *
 * ⛔ 「충돌 0개」를 목표로 하지 않는다. **판단하지 않은 충돌 0개**가 목표다.
 *
 * 재는 법:
 *   node observatory/verify-names.mjs            # 0=판단 안 된 충돌 없음
 *   node observatory/verify-names.mjs --update    # 지금 충돌을 기준선에 적는다(사유는 사람이 채운다)
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--update'], 'universe names');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/* 배달본에서 직접 부르면 사유를 대고 죽는다 — 생 스택트레이스 대신(R91). */
await requireUniverseSource(ROOT, 'universe names');
/* ⛔ **엔진만 훑고 있었다(R98).** 우주 자신의 코드(`lib/`·`bin/`·`observatory/`·`beacon/`·
   `bigbang/`)에서 같은 이름이 겹쳐도 이 검사는 못 봤다 — 실측: `whyItFailed` 를 `lib/pick.mjs`
   에 심어도 「충돌 5개 전부 판단돼 있다」고 초록불을 냈다.
   ⚠️ R21 이 「이름만 본다」는 한계를 적어 뒀는데, 그보다 앞서 **보는 자리 자체가 좁았다.** */
const SCAN_ROOTS = [
  join(ROOT, 'observatory/engine/packages'),
  join(ROOT, 'lib'),
  join(ROOT, 'bin'),
  join(ROOT, 'beacon'),
  join(ROOT, 'bigbang'),
];
const SCAN = ROOT;
const BASELINE = join(ROOT, 'observatory/names-baseline.json');

const walk = async (dir, out = []) => {
  for (const name of await readdir(dir).catch(() => [])) {
    if (['node_modules', 'dist', '.git'].includes(name)) { continue; }
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) { await walk(full, out); } else if (/\.(ts|mjs)$/.test(name)) { out.push(full); }
  }
  return out;
};

const files = [];
for (const dir of SCAN_ROOTS) {
  files.push(...await walk(dir));
}
const owners = new Map();
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/^export (?:const|function|class|interface|type) (\w+)/gm)) {
    const name = match[1];
    if (!owners.has(name)) { owners.set(name, new Set()); }
    owners.get(name).add(relative(SCAN, file));
  }
}

/* ── **이름이 달라도 몸통이 같으면 복제다** (R113).
   ⛔ R21·R22 가 남긴 한계 — 「**이름만 본다.** 이름이 다른 복제는 못 잡는다. R21 에서
   걷어낸 넷이 마침 이름이 같았을 뿐이다」. 몸통을 정규화해 견주면 잴 수 있다.
   ⚠️ 주석은 걷어내고 공백은 하나로 만든다 — **주석만 다른 복제**가 진짜 복제다.
   ⚠️ 40자 미만은 안 센다. 짧은 화살표는 우연히 같아진다(`(x) => x.trim()`). */
const bodies = new Map();
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const m of text.matchAll(/export const (\w+)\s*=\s*([\s\S]*?)\n(?=export |\/\*\*|\/\* |const |\};?\n|$)/g)) {
    const body = m[2].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
    if (body.length < 40) {
      continue;
    }
    const key = createHash('sha1').update(body).digest('hex').slice(0, 12);
    if (!bodies.has(key)) {
      bodies.set(key, new Map());
    }
    bodies.get(key).set(m[1], relative(SCAN, file));
  }
}
const twins = [...bodies.values()]
  .filter((byName) => byName.size > 1)
  .map((byName) => [...byName].map(([name, where]) => `${name} (${where})`));

const collisions = [...owners.entries()]
  .filter(([, where]) => where.size > 1)
  .map(([name, where]) => ({ name, where: [...where].sort() }))
  .sort((a, b) => a.name.localeCompare(b.name));

/* 관측 법칙 §8 — 아무것도 못 훑었으면 통과가 아니다. */
if (files.length === 0 || owners.size === 0) {
  console.error(`⛔ 파일 ${files.length}개 · export ${owners.size}개를 훑었다 — 통과가 아니라 **훑개가 고장 난 것**이다.`);
  process.exit(1);
}

const baseline = await readFile(BASELINE, 'utf8').then((t) => JSON.parse(t)).catch(() => ({}));

if (argv.includes('--update')) {
  const next = {};
  for (const { name, where } of collisions) {
    next[name] = baseline[name] ?? '⚠️ 사유를 적어라 — 병렬 구조인가, 복제인가';
  }
  await writeFile(BASELINE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const blank = Object.values(next).filter((v) => v.startsWith('⚠️')).length;
  console.log(`✅ 기준선에 충돌 ${collisions.length}개를 적었다${blank > 0 ? ` — 그중 ${blank}개는 **사유가 비어 있다.** 사람이 채워라.` : ''}`);
  process.exit(0);
}

console.log(`── 이름 충돌 — 파일 ${files.length}개 · export ${owners.size}개 · 충돌 ${collisions.length}개`);
if (twins.length > 0) {
  console.error(`\n⛔ **이름은 다른데 몸통이 같은 무리 ${twins.length}개** — 이름만 보면 안 보인다(R22):`);
  for (const group of twins) {
    console.error(`   ${group.join('  =  ')}`);
  }
  console.error('   한쪽을 지우고 부르거나, 정말 다른 것이면 몸통이 갈라져야 한다.');
  /* ⛔ **말만 하면 보고지 관문이 아니다**(R65 가 미흡으로 남긴 그 모양). 여기서 죽는다.
     ⚠️ 이름 충돌과 달리 **기준선을 두지 않는다** — 몸통이 같은 것은 「병렬 구조」일 수 없다.
     같은 코드가 두 이름으로 있으면 그냥 하나가 남는 것이 맞다. */
  process.exit(1);
}

const unjudged = collisions.filter(({ name }) => !baseline[name] || baseline[name].startsWith('⚠️'));
const stale = Object.keys(baseline).filter((name) => !collisions.some((c) => c.name === name));

for (const { name, where } of collisions) {
  const why = baseline[name];
  const judged = why && !why.startsWith('⚠️');
  console.log(`  ${judged ? '✅' : '⛔'} ${name}  (${where.length}곳)`);
  if (judged) { console.log(`       ${why}`); } else { for (const w of where) { console.log(`       ${w}`); } }
}

if (stale.length > 0) {
  console.log(`\n  ⚠️ 기준선에 있는데 이제 안 겹치는 것 ${stale.length}개: ${stale.join(' · ')}`);
  console.log('     `--update` 로 기준선을 줄여라 — 낡은 기준선은 다음 사람을 속인다.');
}

if (unjudged.length > 0) {
  console.error(`\n⛔ 판단하지 않은 충돌 ${unjudged.length}개. **「충돌 0개」가 목표가 아니라 「판단하지 않은 충돌 0개」가 목표다.**`);
  console.error('   병렬 구조라면 기준선에 사유를 적고, 복제라면 코어로 올려라.');
  process.exit(1);
}
console.log(`\n✅ 충돌 ${collisions.length}개 전부 판단돼 있다.`);
