#!/usr/bin/env node
/**
 * 회귀 시험 — `bigbang/behavior-contract` (행동 계약 테스트 보호)와 그 옆의
 * `bigbang/star-scope` · `bigbang/whole-file` 이 **계속** 지켜지는지 잰다.
 *
 * 이 시험은 `admitPatch()` 를 **엔진(dist) 없이** 직접 부른다 — 여기서 재는 것은
 * 「관문의 순서·경로 판정 로직」이지 은하가 켠 법칙(RULE_PRESETS)이 아니기 때문이다.
 * evaluator 를 항상 ALLOWED 로 응답하는 스텁으로 넣으면, admitPatch 안의
 * ①범위(별의 폴더·행동 계약) 체크만 골라 잴 수 있다. 엔진 dist 빌드가 없어도 돈다.
 *
 * 무엇을 지키려는가 (`bigbang/README.md` §3차 팽창 §관문이 유일한 문):
 *   ⛔ `{Star}.test.tsx` 는 에이전트가 못 고친다 — 고쳐서 통과시키는 것은 증거 인멸이다.
 *   ✅ 그런데 **새 이름의 새 테스트 파일**은 허용해야 한다 — 안 그러면 3차가 만든
 *      기능에 계약이 하나도 안 생긴다.
 *
 * 실측(2026-09-04): 케이스만 다른 경로(`Foo.TEST.tsx`)가 macOS APFS(기본 대소문자
 * 비구분)에서 원본 `Foo.test.tsx` 를 **물리적으로 덮어쓰는** 우회가 있었다.
 * `foldPath()`(NFC + lowercase 비교)로 막았다 — 이 시험의 케이스 ④가 그 회귀를 잡는다.
 *
 *   node bigbang/selftest-behavior-contract.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { admitPatch } from './nebula.mjs';

const STAR_DIR = 'src/components/SelftestStar';
const STAR_NAME = 'SelftestStar';
const PROTECTED = `${STAR_DIR}/${STAR_NAME}.test.tsx`;
const ORIGINAL_TEST_BYTES = "describe('SelftestStar', () => { it('원본 계약', () => { expect(true).toBe(true); }); });\n";

/** 엔진 dist 를 부르지 않는다 — 여기서 재는 것은 admitPatch 자체의 범위 판정이다. */
const stubEvaluator = { evaluate: async () => ({ status: 'ALLOWED', reasons: [], feedback: '' }) };
const stubContracts = {
  formatFeedback: (reasons, header) =>
    [header, ...reasons.map((r) => `[${r.rule}] ${r.where}\n  증거: ${r.evidence}\n  고칠 것: ${r.fix}`)].join('\n'),
};

const makeStarFiles = () => [
  { path: `${STAR_DIR}/${STAR_NAME}.tsx` },
  { path: `${STAR_DIR}/use${STAR_NAME}.ts` },
  { path: `${STAR_DIR}/index.ts` },
  { path: PROTECTED },
];

const patch = async (targetBase, files, actionFiles) =>
  admitPatch({
    action: { kind: 'patch', files: actionFiles },
    starDir: STAR_DIR,
    starName: STAR_NAME,
    targetBase,
    files,
    evaluator: stubEvaluator,
    contracts: stubContracts,
  });

const cases = [];
const record = (name, fn) => cases.push({ name, fn });

record('① 기존 계약 파일을 그대로 덮어쓰려 함', async (targetBase, files) => {
  const r = await patch(targetBase, files, [{ path: PROTECTED, content: 'export const x = 1;\n' }]);
  assert.equal(r.ok, false, '반려돼야 한다');
  assert.match(r.feedback, /bigbang\/behavior-contract/);
});

record('② it.skip 으로 무력화하려 함', async (targetBase, files) => {
  const r = await patch(targetBase, files, [
    { path: PROTECTED, content: ORIGINAL_TEST_BYTES.replace('it(', 'it.skip(') },
  ]);
  assert.equal(r.ok, false, '반려돼야 한다');
  assert.match(r.feedback, /bigbang\/behavior-contract/);
});

record('③ expect 를 지우려 함', async (targetBase, files) => {
  const r = await patch(targetBase, files, [{ path: PROTECTED, content: ORIGINAL_TEST_BYTES.replace(/expect\([^;]+;/, '') }]);
  assert.equal(r.ok, false, '반려돼야 한다');
  assert.match(r.feedback, /bigbang\/behavior-contract/);
});

record('④ 대소문자만 바꿔 같은 파일을 덮어쓰려 함(케이스 우회 회귀)', async (targetBase, files) => {
  const r = await patch(targetBase, files, [
    { path: `${STAR_DIR}/${STAR_NAME}.TEST.tsx`, content: 'NEUTERED\n' },
  ]);
  assert.equal(r.ok, false, '케이스만 바꾼 경로도 반려돼야 한다 — 같은 물리 파일이다(macOS APFS)');
  assert.match(r.feedback, /bigbang\/behavior-contract/);
  const onDisk = await fs.readFile(path.join(targetBase, PROTECTED), 'utf8');
  assert.equal(onDisk, ORIGINAL_TEST_BYTES, '반려됐다면 물리 파일도 안 바뀌어야 한다');
});

record('⑤ 별의 폴더 자체를 경로로 줌', async (targetBase, files) => {
  const r = await patch(targetBase, files, [{ path: STAR_DIR, content: 'x' }]);
  assert.equal(r.ok, false);
  assert.match(r.feedback, /bigbang\/star-scope/);
});

record('⑥ 경로 탈출 시도(../../../etc/evil.txt)', async (targetBase, files) => {
  const r = await patch(targetBase, files, [{ path: '../../../etc/evil.txt', content: 'pwned' }]);
  assert.equal(r.ok, false);
  assert.match(r.feedback, /bigbang\/star-scope/);
});

record('⑦ 부분 diff(content 가 문자열이 아님)', async (targetBase, files) => {
  const r = await patch(targetBase, files, [{ path: `${STAR_DIR}/${STAR_NAME}.tsx`, content: { diff: '+x' } }]);
  assert.equal(r.ok, false);
  assert.match(r.feedback, /bigbang\/whole-file/);
});

record('⑧ 새 이름의 새 테스트 파일 추가(허용돼야 함)', async (targetBase, files) => {
  const r = await patch(targetBase, files, [
    { path: `${STAR_DIR}/${STAR_NAME}.feature.test.tsx`, content: "describe('feature', () => { it('new', () => {}); });\n" },
  ]);
  assert.equal(r.ok, true, '새 파일은 허용돼야 한다');
  const exists = await fs
    .access(path.join(targetBase, `${STAR_DIR}/${STAR_NAME}.feature.test.tsx`))
    .then(() => true)
    .catch(() => false);
  assert.equal(exists, true, '새 테스트 파일이 실제로 디스크에 생겨야 한다');
});

record('⑨ 사후 — 원본 계약 파일은 전체 시험이 끝나도 바이트 불변', async (targetBase) => {
  const onDisk = await fs.readFile(path.join(targetBase, PROTECTED), 'utf8');
  assert.equal(onDisk, ORIGINAL_TEST_BYTES);
});

const main = async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bigbang-selftest-'));
  await fs.mkdir(path.join(tmpRoot, STAR_DIR), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, PROTECTED), ORIGINAL_TEST_BYTES, 'utf8');
  await fs.writeFile(path.join(tmpRoot, `${STAR_DIR}/${STAR_NAME}.tsx`), '// stub\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, `${STAR_DIR}/use${STAR_NAME}.ts`), '// stub\n', 'utf8');
  await fs.writeFile(path.join(tmpRoot, `${STAR_DIR}/index.ts`), '// stub\n', 'utf8');

  let failed = 0;
  for (const { name, fn } of cases) {
    const files = makeStarFiles();
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn(tmpRoot, files);
      console.log(`✅ ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`❌ ${name}`);
      console.log(`   ${error.message}`);
    }
  }

  /**
   * ⚠️⚠️ **「테스트를 못 돌리는 은하엔 계약을 안 만든다」가 남용되지 않게 막는다.**
   * R44 에서 그 갈래를 만들었다 — 진짜 은하에 `vitest` 가 없어 별이 `tsc` 를 깼기 때문이다.
   * 그런데 이 갈래는 **`commands.test` 만 지우면 테스트를 영영 안 만드는 문**이기도 하다.
   * 그래서 **테스트를 돌릴 수 있는 은하에서는 계약 파일이 반드시 나와야 한다**를 못 박는다.
   * ⛔ 한쪽만 시험하면 다음 사람이 반대쪽으로 빠져나간다.
   */
  const templates = (await fs.readdir(new URL('templates/star', import.meta.url))).filter((f) => f.endsWith('.tpl'));
  const withTests = templates.filter((f) => !/\.test\./.test(f));
  const contractTemplates = templates.filter((f) => /\.test\./.test(f));
  if (contractTemplates.length === 0) {
    console.log('❌ 행동 계약 템플릿이 아예 없다 — 테스트를 돌릴 수 있는 은하에도 계약이 안 나간다');
    failed += 1;
  } else if (withTests.length === templates.length) {
    console.log('❌ 거르는 조건이 템플릿 전부를 통과시킨다');
    failed += 1;
  } else {
    console.log(`✅ 행동 계약 템플릿이 있다(${contractTemplates.join(' · ')}) — 테스트를 돌리는 은하에는 나간다`);
  }

  await fs.rm(tmpRoot, { recursive: true, force: true });

  console.log(`\n${cases.length - failed}/${cases.length} 통과`);
  if (failed > 0) {
    console.log(`\n⛔ ${failed}건 실패 — bigbang/behavior-contract 관문이 회귀했다.`);
    process.exit(1);
  }
  console.log('\n✅ PASS — 행동 계약 보호 + 새 테스트 허용이 둘 다 지켜진다.');
  process.exit(0);
};

await main();
