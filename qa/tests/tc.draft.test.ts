/**
 * **정책서 → TC 초안**의 순수 부분. ⛔ 여기서 모델은 안 부른다 — 부르는 자리는 CLI 다.
 *
 * 가장 중요한 축은 「초안이 **검증으로 세어지지 않는가**」다. 모델이 만든 TC 가 검증 분모에
 * 들어가면 **사람이 한 번도 안 본 것으로 「검증했다」가 늘어난다** — 이 저장소가 가장 싫어하는 모양.
 */
import { describe, expect, it } from 'vitest';

import { NON_VERIFYING_ORIGINS } from '../src/run/contract.js';
import { buildRunReport, evaluateDone } from '../src/run/report.js';
import {
  DRAFT_ORIGIN,
  buildPrompt,
  draftNotice,
  parseDraftReply,
  splitPolicy,
  toFormRows,
} from '../src/tc/draft.js';
import { readCaseRows } from '../src/tc/form.js';

describe('⛔ 초안은 검증이 아니다', () => {
  it('초안의 출처는 계약이 **검증 분모에서 빼는** 것이어야 한다', () => {
    expect(NON_VERIFYING_ORIGINS).toContain(DRAFT_ORIGIN);
  });

  it('초안 표를 그대로 돌리면 「못 쟀다」(3)가 나온다 — 분모가 0이다', () => {
    const rows = toFormRows([
      { unit: { anchor: 'p.md#L1', title: 't', body: 'b' }, draft: { title: '잠긴다', quote: '5회' } },
    ]);
    const read = readCaseRows(rows);
    expect(read.problems).toEqual([]);
    const report = buildRunReport({ preconditions: [{ id: 'p', ok: true }], cases: read.rows });
    expect(report.verification.denominator).toBe(0);
    expect(evaluateDone(report).exitCode).toBe(3);
  });

  it('내보낸 표는 **양식과 같은 표**다 — 그대로 다시 읽힌다(고리가 닫힌다)', () => {
    const rows = toFormRows([
      { unit: { anchor: 'p.md#L9', title: 't', body: 'b' }, draft: { title: '제목', quote: '인용' } },
    ]);
    const read = readCaseRows(rows);
    expect(read.dataRows).toBe(1);
    expect(read.rows[0]?.originRef).toContain('p.md#L9');
    expect(read.rows[0]?.originRef).toContain('인용');
  });

  it('표 위의 설명이 **아직 검증이 아니라는 것**을 말한다', () => {
    const notice = draftNotice('정책.md').join('\n');
    expect(notice).toContain(DRAFT_ORIGIN);
    expect(notice).toMatch(/사람이 확인하기 전/);
  });
});

describe('정책서 자르기 — 한 조각이 모델 한 번이다(수가 곧 돈이다)', () => {
  it('제목이 있으면 제목마다 자르고 줄 번호를 남긴다', () => {
    const { units } = splitPolicy('# 하나\n본문이 충분히 길다\n\n## 둘\n또 다른 본문이다\n', '정책.md');
    expect(units.map((u) => u.anchor)).toEqual(['정책.md#L1', '정책.md#L4']);
  });

  it('제목이 없으면 빈 줄로 나눈 문단마다 자른다', () => {
    const { units } = splitPolicy('첫 문단은 충분히 길다\n\n둘째 문단도 충분히 길다\n', '정책.md');
    expect(units).toHaveLength(2);
  });

  it('⛔ 본문이 빈 조각만 빼고 **세어서 말한다** — 조용히 빼지 않는다(§8)', () => {
    const { units, dropped } = splitPolicy('# 제목만 있는 절\n\n# 진짜\n확인할 수 있는 규칙이 여기 있다\n', '정책.md');
    expect(units).toHaveLength(1);
    expect(dropped).toBe(1);
  });

  it('⛔ **짧다고 빼지 않는다** — 한 줄짜리 진짜 요구가 조용히 사라지는 자리다', () => {
    const { units, dropped } = splitPolicy('# 잠금\n5회 실패 시 잠근다\n', '정책.md');
    expect(units).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it('CRLF 정책서도 같은 수로 잘린다', () => {
    const lf = splitPolicy('# 하나\n본문이 충분히 길다\n', 'p.md').units.length;
    const crlf = splitPolicy('# 하나\r\n본문이 충분히 길다\r\n', 'p.md').units.length;
    expect(crlf).toBe(lf);
  });

  it('프롬프트에 **자리와 원문**이 같이 들어간다 — 사람이 대조할 수 있게', () => {
    const prompt = buildPrompt({ anchor: 'p.md#L3', title: '잠금', body: '5회 실패 시 잠근다' });
    expect(prompt).toContain('p.md#L3');
    expect(prompt).toContain('5회 실패 시 잠근다');
  });
});

describe('모델의 답 읽기 — 못 읽으면 **지어내지 않는다**', () => {
  it('JSON 배열을 읽는다', () => {
    const parsed = parseDraftReply('[{"title":"a","quote":"b"}]', 'p#L1');
    expect(parsed.cases).toEqual([{ title: 'a', quote: 'b' }]);
    expect(parsed.problems).toEqual([]);
  });
  it('```json 울타리를 벗긴다', () => {
    const parsed = parseDraftReply('```json\n[{"title":"a","quote":"b"}]\n```', 'p#L1');
    expect(parsed.cases).toHaveLength(1);
  });
  it('빈 배열은 문제가 아니다 — 「확인할 것이 없다」는 정직한 답이다', () => {
    const parsed = parseDraftReply('[]', 'p#L1');
    expect(parsed.cases).toEqual([]);
    expect(parsed.problems).toEqual([]);
  });
  it('JSON 이 아니면 0건 + 사유다 — 대충 건지지 않는다', () => {
    const parsed = parseDraftReply('음… 이런 TC 가 좋겠습니다', 'p#L1');
    expect(parsed.cases).toEqual([]);
    expect(parsed.problems[0]).toMatch(/JSON/);
  });
  it('title 이 없는 줄은 버리고 **버렸다고 말한다**', () => {
    const parsed = parseDraftReply('[{"quote":"b"}]', 'p#L1');
    expect(parsed.cases).toEqual([]);
    expect(parsed.problems[0]).toMatch(/title 이 없다/);
  });
  it('빈 답을 성공으로 세지 않는다', () => {
    expect(parseDraftReply('', 'p#L1').problems[0]).toMatch(/빈 답/);
  });
});
