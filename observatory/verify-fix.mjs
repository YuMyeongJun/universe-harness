#!/usr/bin/env node
/**
 * **규칙이 무엇을 하라고 말하는가** — 처방을 잰다.
 *
 * 규칙은 두 가지를 말할 수 있다. 「이건 틀렸다」와 「이렇게 해라」.
 * 앞엣것만 있는 규칙은 「고쳐라」가 아니라 **「어쩌라고」**가 되고,
 * 그러면 사람은 고치는 법이 아니라 **관문을 무시하는 법부터 배운다.**
 *
 * ⛔ **정규식으로 「좋은 처방」을 판정할 수 있다고 믿지 마라.** 세 번 시도했다 —
 * 「백틱이 있어야 한다」는 `no-class`(“팩토리 함수나 훅으로 바꿔라”)를 틀렸다고 했고,
 * 「명령형 어미여야 한다」는 `img-alt`(“`alt` 를 반드시 준다”)를 틀렸다고 했다.
 * ⇒ 그래서 이름 충돌(R22)·열거(R34)와 **같은 방식**을 쓴다 — 사람이 판단하고, 기준선에 적는다.
 *   목표는 「나쁜 처방 0개」가 아니라 **「판단하지 않은 처방 0개」**다.
 *
 * 처방 문구가 바뀌면 기준선의 사본과 달라지므로 **판단이 자동으로 낡는다.**
 *
 * 재는 법:
 *   node observatory/verify-fix.mjs            # 0=판단 안 된 처방 없음
 *   node observatory/verify-fix.mjs --update    # 지금 처방을 기준선에 적는다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { requireUniverseSource } from '../lib/home.mjs';

const PLACEHOLDER = 'TODO:';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--update'], 'universe fix');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
/* 배달본에서 직접 부르면 사유를 대고 죽는다 — 생 스택트레이스 대신(R91). */
await requireUniverseSource(ROOT, 'universe fix');
const RULES_DIR = join(ROOT, 'observatory/engine/packages/@core/fe-agent-contracts/src/rules');
const BASELINE = join(ROOT, 'observatory/fix-baseline.json');

const files = (await readdir(RULES_DIR)).filter((name) => name.endsWith('.ts') && name !== 'index.ts');
const found = [];

for (const file of files) {
  const text = await readFile(join(RULES_DIR, file), 'utf8');
  /* 규칙 블록은 `id:` 로 가른다. 앞서 처방을 통째 정규식으로 뽑다가 **규칙 경계를 넘어
     엉뚱한 처방을 짝지었다** — `no-enum` 에 `arrow-only` 의 문구가 붙었다. */
  const heads = [...text.matchAll(/^\s*id: '([\w/-]+)'/gm)];
  for (const [index, head] of heads.entries()) {
    const block = text.slice(head.index, heads[index + 1]?.index ?? text.length);
    /* 처방이 놓이는 자리는 **두 곳**이다.
       ⚠️ 처음엔 `fix:` 키만 훑었고, 그래서 `copy-state` 를 「처방 없음」이라고 잘못 짚었다 —
       그 규칙은 처방을 `findAll(file, /re/, 'rule/id', '처방')` 의 **위치 인자**로 넘긴다.
       키 이름 하나를 열거한 훑개는 그 이름을 안 쓰는 자리에 눈이 먼다(관측 법칙 §9). */
    const strings = (re) => [...block.matchAll(re)].map((m) => m.at(-1).replace(/\s+/g, ' ').trim());
    const messages = [
      ...strings(/fix:\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g),
      ...strings(/'[\w-]+\/[\w-]+',\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g),
    ];
    found.push({ id: head[1], messages });
  }
}

/* 관측 법칙 §8 — 아무것도 못 훑었으면 통과가 아니다. */
if (files.length === 0 || found.length === 0) {
  console.error(`⛔ 규칙 파일 ${files.length}개에서 규칙을 하나도 못 읽었다 — 훑개가 고장 났다.`);
  process.exit(1);
}

const baseline = await readFile(BASELINE, 'utf8').then((t) => JSON.parse(t)).catch(() => ({}));
const sameText = (entry, messages) => JSON.stringify(entry?.처방) === JSON.stringify(messages);

if (argv.includes('--update')) {
  const next = {};
  for (const { id, messages } of found) {
    const kept = sameText(baseline[id], messages) ? baseline[id].판단 : null;
    next[id] = {
      처방: messages,
      판단: kept ?? `${PLACEHOLDER} 이 문구가 「무엇을 하라」를 말하는지 적어라 — 아니면 문구를 고쳐라.`,
    };
  }
  await writeFile(BASELINE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const blank = Object.values(next).filter((v) => v.판단.startsWith(PLACEHOLDER)).length;
  console.log(`✅ 기준선에 규칙 ${found.length}개를 적었다${blank > 0 ? ` — 그중 ${blank}개는 **판단이 비어 있다.**` : ''}`);
  process.exit(0);
}

console.log(`── 처방 감사 — 규칙 ${found.length}개`);
const mute = found.filter(({ messages }) => messages.length === 0);
const unjudged = found.filter(({ id, messages }) => {
  const entry = baseline[id];
  return !entry || !sameText(entry, messages) || entry.판단.startsWith(PLACEHOLDER);
});

for (const { id, messages } of found) {
  const entry = baseline[id];
  const fresh = entry && sameText(entry, messages) && !entry.판단.startsWith(PLACEHOLDER);
  const mark = messages.length === 0 ? '⛔' : fresh ? '✅' : '⚠️';
  console.log(`  ${mark} ${id}`);
  if (messages.length === 0) {
    console.log('       처방 없음 — 이 규칙은 무엇이 틀렸는지만 말하고 어쩌라는 말이 없다.');
  } else if (!entry) {
    console.log(`       판단 없음 · 처방: ${messages[0].slice(0, 70)}`);
  } else if (!sameText(entry, messages)) {
    console.log('       처방이 바뀌었다 — 판단이 낡았다. 다시 읽고 --update 한 뒤 사유를 적어라.');
  } else if (entry.판단.startsWith(PLACEHOLDER)) {
    console.log(`       ${entry.판단}`);
  }
}

const stale = Object.keys(baseline).filter((id) => !found.some((f) => f.id === id));
if (stale.length > 0) {
  console.log(`\n  ⚠️ 기준선에 있는데 이제 없는 규칙 ${stale.length}개: ${stale.join(' · ')}`);
}
if (mute.length > 0) {
  console.error(`\n⛔ 처방 없는 규칙 ${mute.length}개: ${mute.map((r) => r.id).join(' · ')}`);
  console.error('   무엇이 틀렸는지만 말하는 관문은 무시당하는 법부터 가르친다.');
  process.exit(1);
}
if (unjudged.length > 0) {
  console.error(`\n⛔ 판단하지 않은 처방 ${unjudged.length}개. **「나쁜 처방 0개」가 아니라 「판단하지 않은 처방 0개」가 목표다.**`);
  process.exit(1);
}
console.log(`\n✅ 규칙 ${found.length}개의 처방이 전부 판단돼 있다.`);
