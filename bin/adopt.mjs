#!/usr/bin/env node
/**
 * `universe adopt <초안파일>` — 채운 좌표 초안을 **은하로 들인다**(등록까지).
 *
 * ## ⛔ 왜 있는가 — 도구가 스스로 경고하던 자리다
 *
 * `universe galaxy`(와 `clone`)는 초안을 내고 이렇게 말한다:
 *   「`galaxies.local/` 로 옮기고 `universe.config.json` 의 `galaxies` 에 **이름을 올려라**」
 *   「⛔ 그걸 빼먹으면 관측이 **아무것도 안 재고 초록불**을 낸다(R121 이 그랬다)」
 * ⇒ **도구가 아는 위험을 사람 손에 맡기고 있었다.** 손으로 두 자리를 고치는 일이고,
 *   한 자리만 고치면 정확히 그 사고가 난다.
 *
 * ## ⛔ 그래도 **판단은 사람이 한다** — 이 도구가 안 하는 것
 *
 *  · **`TODO:` 가 남아 있으면 들이지 않는다.** 초안은 「짐작 안 한 자리」를 그렇게 표시한다.
 *    그대로 들이면 관문이 **엉뚱한 것**을 재고, 그건 안 재는 것보다 나쁘다.
 *  · **태양계를 고르지 않는다.** 폴더 이름은 사람이 정하는 것이다(§9).
 *  · **덮어쓰지 않는다.** 같은 이름의 좌표가 이미 있으면 멈춘다.
 *  · **커밋되는 `galaxies/` 에 쓰지 않는다.** 절대 경로가 든 좌표는 그 기계의 것이라
 *    `galaxies.local/`(gitignore)이 옳은 자리다 — `universe coordinates` 가 그걸 잰다.
 *
 *   universe adopt <초안파일> [--name <이름>]
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseHome } from '../lib/home.mjs';
import { findGalaxyFile } from '../lib/galaxy-load.mjs';
import { nameProblem } from '../lib/name.mjs';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--name'], 'universe adopt');
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const taken = new Set(['--name', '--universe'].flatMap((f) => (argv.includes(f) ? [argv[argv.indexOf(f) + 1]] : [])));
const draftPath = argv.find((a) => !a.startsWith('--') && !taken.has(a));
if (!draftPath) {
  console.error('초안 파일을 줘라: universe adopt <초안파일> [--name <이름>]');
  console.error('  초안은 `universe galaxy` 나 `universe clone` 이 만든다.');
  process.exit(1);
}

const root = await requireUniverseHome(flag('--universe'));
const configPath = path.join(root, 'universe.config.json');

const raw = await fs.readFile(path.resolve(draftPath), 'utf8').catch(() => null);
if (raw === null) {
  console.error(`⛔ 그런 파일이 없다: ${draftPath}`);
  process.exit(1);
}
let draft;
try {
  draft = JSON.parse(raw);
} catch (error) {
  console.error(`⛔ JSON 이 아니다: ${draftPath}\n   ${error.message}`);
  process.exit(1);
}

const name = flag('--name') ?? draft.name;
const problem = nameProblem(name ?? '');
if (problem) {
  console.error(`⛔ 은하 이름으로 쓸 수 없다: ${name ?? '(초안에 name 이 없다)'}\n   ${problem}`);
  process.exit(1);
}

console.log(`── 은하로 들인다 — ${name}`);

/**
 * ⛔⛔ **`TODO:` 가 남아 있으면 들이지 않는다.**
 * 초안은 「짐작하지 않은 자리」를 그렇게 표시한다. 그대로 들이면 관문이 **엉뚱한 것**을 재고,
 * 그건 안 재는 것보다 나쁘다 — 수치가 나오니 아무도 의심하지 않는다(§8 이 말하는 그 자리).
 */
const todos = [];
const walk = (node, at) => {
  if (typeof node === 'string') {
    if (node.startsWith('TODO:')) { todos.push(`${at} — ${node}`); }
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${at}[${i}]`));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) { walk(v, at ? `${at}.${k}` : k); }
  }
};
walk(draft, '');
if (todos.length > 0) {
  console.error(`\n⛔ **사람이 채울 자리가 ${todos.length}곳 남았다** — 들이지 않는다.`);
  for (const line of todos) { console.error(`   · ${line}`); }
  console.error('\n   ⚠️ 그대로 들이면 관문이 **엉뚱한 것**을 잰다. 안 재는 것보다 나쁘다 —');
  console.error('      수치가 나오니 아무도 의심하지 않는다.');
  console.error(`   → ${draftPath} 를 채우고 다시 불러라.`);
  process.exit(1);
}

/* ⛔ 덮어쓰지 않는다 — 남이 손본 좌표일 수 있다. */
const existing = await findGalaxyFile(root, name);
if (existing) {
  console.error(`\n⛔ 이미 있는 은하다: ${path.relative(root, existing)}`);
  console.error('   덮어쓰지 않는다 — 좌표는 사람이 손본 것이라 잃으면 안 된다.');
  process.exit(1);
}

/**
 * ⛔ **커밋되는 `galaxies/` 가 아니라 `galaxies.local/` 이다.**
 * 초안의 `path` 는 그 기계의 절대 경로다. 커밋되는 자리에 두면 `universe coordinates` 가
 * 「그 기계에만 있는 좌표」로 문다 — 그리고 그 검사가 옳다(공개 저장소다).
 */
const target = path.join(root, 'galaxies.local', `${name}.json`);
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(target, `${JSON.stringify(draft, null, 2)}\n`);
console.log(`  ✅ 좌표를 두었다 — ${path.relative(root, target)}  (gitignore 되는 자리다)`);

/* ⛔ **등록까지 한다.** 이 한 줄을 빼먹는 것이 R121 의 사고였다. */
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
config.galaxies = config.galaxies ?? [];
if (!config.galaxies.includes(name)) {
  config.galaxies.push(name);
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`  ✅ 목록에 올렸다 — universe.config.json (은하 ${config.galaxies.length}개)`);
} else {
  console.log('  ⓘ 목록에는 이미 있었다 — 좌표만 없던 상태였다(그 상태가 R121 의 반쪽이다).');
}

console.log('\n다음: 재라 (⛔ 첫 관측은 기준선이 없어 ⚠️ 로 나온다 — 눈으로 보고 나서 심어라)');
console.log(`   universe observe --galaxy ${name}`);
console.log(`   universe observe --galaxy ${name} --update   ← 눈으로 본 뒤에`);
