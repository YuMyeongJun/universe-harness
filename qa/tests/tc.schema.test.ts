/**
 * **양식이 계약과 같은 칸을 쓰는가** — 두 벌이 되면 조용히 갈리는 자리.
 *
 * ⛔ 이 시험은 칸 이름을 **손으로 열거하지 않는다**(§9). 계약의 타입으로 만든 **증인 객체**
 * (`Required<ICaseInput>`)의 키를 훑어 양식이 그 칸을 들고 있는지 본다.
 * ⚠️ 계약에 칸이 하나 늘면 증인 객체가 **컴파일 단계에서** 깨진다(`Required<…>`) —
 * 그것을 고치면 이 시험이 「양식에 그 칸이 없다」고 잡는다. 두 겹이다.
 *
 * ## 이 시험이 **못 잡는 것** (§8)
 *   · 계약이 칸의 **뜻**만 바꾸면(같은 이름, 다른 의미) 여기서는 안 보인다.
 *   · 사람이 양식을 엑셀에서 열어 칸 이름을 고친 것은 여기가 아니라 `tc.form` 이 잡는다.
 */
import { describe, expect, it } from 'vitest';

import {
  MIN_ACCEPTED_WHY,
  NON_VERIFYING_ORIGINS,
  type ICaseInput,
  type IEvidence,
  type IPrecondition,
  type IVerdict,
} from '../src/run/contract.js';
import {
  ATTRIBUTION_VALUES,
  CASE_COLUMNS,
  ORIGIN_VALUES,
  PRECONDITION_COLUMNS,
  STATUS_VALUES,
  VERDICT_VALUES,
  caseHeader,
  renderCaseTemplate,
  renderPreconditionTemplate,
  templateFileName,
} from '../src/tc/schema.js';
import { readCaseRows, readPreconditionRows, rowsOf } from '../src/tc/form.js';
import { delimiterOf } from '../src/tc/sv.js';

/**
 * **증인** — 계약의 케이스가 가질 수 있는 칸을 하나도 빼지 않고 채운 객체.
 * ⛔ `Required<…>` 라서 계약에 칸이 늘면 **여기서 컴파일이 깨진다.**
 */
const caseWitness: Required<ICaseInput> = {
  id: 'TC-1',
  origin: 'policy',
  originRef: '정책서#L1',
  status: 'failed',
  attribution: 'star',
  evidence: { url: 'https://a', httpStatus: 200, screenshot: 's.png' } satisfies Required<IEvidence>,
  verdict: { kind: 'accepted', why: 'x'.repeat(MIN_ACCEPTED_WHY) } satisfies Required<IVerdict>,
  flaky: true,
  unmeasuredReason: '이유',
};
const preconditionWitness: Required<IPrecondition> = { id: 'p', ok: true, detail: 'd' };

const nestedKeys = (prefix: string, o: Record<string, unknown>): string[] =>
  Object.keys(o).map((k) => `${prefix}.${k}`);

describe('양식의 칸 = 계약의 칸', () => {
  it('케이스의 모든 칸이 양식에 있다 (중첩은 점으로 편다)', () => {
    const wanted = Object.entries(caseWitness).flatMap(([key, value]) =>
      key === 'evidence' || key === 'verdict'
        ? nestedKeys(key, value as Record<string, unknown>)
        : [key],
    );
    expect(wanted.length).toBeGreaterThan(0); // §8 — 0개를 훑고 통과하지 않는다
    for (const name of wanted) expect(CASE_COLUMNS).toContain(name);
  });

  it('전제의 모든 칸이 양식에 있다', () => {
    const wanted = Object.keys(preconditionWitness);
    expect(wanted.length).toBeGreaterThan(0);
    for (const name of wanted) expect(PRECONDITION_COLUMNS).toContain(name);
  });

  it('양식이 계약이 **모르는 칸**을 계약 칸으로 섞지 않는다', () => {
    const known = new Set(
      Object.entries(caseWitness).flatMap(([key, value]) =>
        key === 'evidence' || key === 'verdict'
          ? nestedKeys(key, value as Record<string, unknown>)
          : [key],
      ),
    );
    for (const name of CASE_COLUMNS) expect(known.has(name)).toBe(true);
  });
});

describe('값 어휘 = 계약의 유니온', () => {
  it('검증 분모 밖 출처가 전부 양식의 값 목록에 있다 — 사람이 그 칸을 고를 수 있어야 한다', () => {
    for (const origin of NON_VERIFYING_ORIGINS) expect(ORIGIN_VALUES).toContain(origin);
  });
  it('상태·탓·판단 어휘가 비어 있지 않다 (§8 — 0개면 대조를 안 한 것이다)', () => {
    for (const values of [ORIGIN_VALUES, STATUS_VALUES, ATTRIBUTION_VALUES, VERDICT_VALUES]) {
      expect(values.length).toBeGreaterThan(1);
    }
  });
  it('accepted 사유 길이를 양식이 **계약에서 읽어** 적는다 — 숫자를 두 벌로 두지 않는다', () => {
    expect(renderCaseTemplate('tsv')).toContain(`${MIN_ACCEPTED_WHY}자 이상`);
  });
});

describe('내준 양식은 **그대로 다시 읽힌다** — 내주는 쪽과 읽는 쪽이 갈리면 안 된다', () => {
  for (const format of ['tsv', 'csv'] as const) {
    it(`${format}: 케이스 양식은 머리 줄만 남고 예시는 안 읽힌다`, () => {
      const rows = rowsOf(renderCaseTemplate(format), delimiterOf(format));
      expect(rows[0]).toEqual(caseHeader());
      const read = readCaseRows(rows);
      expect(read.problems).toEqual([]);
      /* 예시 줄은 `#` 이라 데이터가 아니다 — **빈 양식은 0줄**이고, 그것은 「없다」가 아니라 못 잰 것이다. */
      expect(read.dataRows).toBe(0);
    });
    it(`${format}: 전제 양식도 같다`, () => {
      const read = readPreconditionRows(rowsOf(renderPreconditionTemplate(format), delimiterOf(format)));
      expect(read.problems).toEqual([]);
      expect(read.dataRows).toBe(0);
    });
    it(`${format}: 파일 이름을 한 자리에서 정한다`, () => {
      expect(templateFileName('cases', format)).toBe(`tc-cases.${format}`);
    });
  }
});
