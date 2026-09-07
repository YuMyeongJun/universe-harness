#!/usr/bin/env node
/**
 * **일부러 더러운 은하** — 규칙 전부를 실제 파이프라인에서 발동시키는 픽스처를 생성한다.
 *
 * ⚠️⚠️ 왜 있는가: `fixtures/tiny-galaxy` 는 깨끗해서 **규칙 19개가 하나도 발동하지 않았다.**
 * 그래서 `observe` 의 0이 아닌 경로 — 드리프트 계산 · 드리프트 진단 · 규칙별 내역 · 표본 —
 * 이 **한 번도 안 돌았다.** 기준선 지문이 빈 문자열의 해시(`e3b0c442…`)였던 것이 그 증거다.
 *
 * ⛔ 엔진 selftest 와 겹치지 않는다. 저쪽은 문자열을 `runStaticRules` 에 바로 먹인다.
 * 여기는 **파일 훑기 → 확장자 거르기 → 스캔 → 법칙별 집계**라는 파이프라인 층을 지난다.
 * R36 이 찾은 고장(`.vue` 44% 실명)은 정확히 그 층에 있었고 selftest 는 볼 수 없었다.
 *
 * ⚠️ 손으로 쓰지 않는다 — 규칙이 늘면 픽스처가 낡고, **낡은 픽스처는 조용히 커버리지를 줄인다.**
 * 규칙 표(`selftest.ts` 의 `RULE_MATRIX`)에서 생성한다.
 *
 *   node fixtures/messy-galaxy/generate.mjs           # 생성/갱신
 *   node fixtures/messy-galaxy/generate.mjs --check    # 낡았으면 exit 1
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

import { rejectUnknownFlags } from '../../lib/flags.mjs';
import { RULE_MATRIX } from '../../observatory/engine/packages/@core/fe-agent-contracts/src/selftest.ts';

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--universe', '--check'], 'messy-galaxy generate');

const HERE = resolve(new URL('.', import.meta.url).pathname);
const SRC = join(HERE, 'src');

/** 규칙 하나 = 파일 하나. 이름에 규칙 id 를 박아 어느 파일이 무엇을 위한 것인지 보이게 한다. */
const planned = RULE_MATRIX.map((rule) => ({
  path: join(SRC, rule.path.replace(/^src\//, '')),
  content: `/* 일부러 어긴다 — ${rule.id}. 이 파일은 generate.mjs 가 만든다. 손으로 고치지 마라. */\n${rule.positive}`,
}));

const walk = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = join(dir, entry.name);
    out.push(...(entry.isDirectory() ? await walk(full) : [full]));
  }
  return out;
};

if (argv.includes('--check')) {
  const stale = [];
  for (const file of planned) {
    const now = await readFile(file.path, 'utf8').catch(() => null);
    if (now !== file.content) {
      stale.push(file.path);
    }
  }
  /* 표에서 빠진 규칙의 파일이 남아 있으면 그것도 낡음이다 — 안 그러면 지운 규칙이 계속 잡힌다. */
  const kept = new Set(planned.map((file) => file.path));
  const orphan = (await walk(SRC)).filter((file) => !kept.has(file));
  if (stale.length > 0 || orphan.length > 0) {
    console.error(`⛔ 더러운 은하가 규칙 표와 어긋난다 — 낡음 ${stale.length}개 · 고아 ${orphan.length}개`);
    for (const file of [...stale, ...orphan]) {
      console.error(`   ${file.replace(`${HERE}/`, '')}`);
    }
    console.error('   node fixtures/messy-galaxy/generate.mjs 로 다시 만들어라.');
    process.exit(1);
  }
  console.log(`✅ 더러운 은하가 규칙 ${planned.length}개와 맞다.`);
  process.exit(0);
}

await rm(SRC, { recursive: true, force: true });
for (const file of planned) {
  await mkdir(dirname(file.path), { recursive: true });
  await writeFile(file.path, file.content, 'utf8');
}
console.log(`✅ 규칙 ${planned.length}개를 어기는 파일을 만들었다 — fixtures/messy-galaxy/src/`);
