/**
 * **채워 온 양식을 읽는 자리** — 모르는 것을 조용히 넘기면 초록이 느는 축을 전부 밟는다.
 *
 * ⛔ 각 시험은 「거부하는가」만 보지 않는다. **거부를 껐을 때 무엇이 늘어나는지**를 같이 잰다
 * (예: 오타 난 origin 을 흘리면 **검증 분모가 는다**). 그래야 이 거부가 장식이 아님을 보인다.
 */
import { describe, expect, it } from 'vitest';

import { buildRunReport, evaluateDone } from '../src/run/report.js';
import { readCaseRows, readPreconditionRows, rowsOf } from '../src/tc/form.js';
import { mergeFormWithRun } from '../src/tc/merge.js';
import { fromPlaywrightJson } from '../src/run/playwright.js';

const TAB = '\t';
const table = (text: string): string[][] => rowsOf(text, TAB);

const CASE_HEAD = `id${TAB}origin${TAB}status${TAB}attribution`;

describe('머리 줄', () => {
  it('칸 **순서가 달라도** 이름으로 짝짓는다', () => {
    const read = readCaseRows(table(`attribution${TAB}status${TAB}origin${TAB}id\nstar${TAB}passed${TAB}policy${TAB}TC-1\n`));
    expect(read.problems).toEqual([]);
    expect(read.rows[0]?.id).toBe('TC-1');
  });

  it('⛔ 모르는 칸 이름은 **거부한다** — 안 읽힌 칸은 「안 적은 것」과 구별이 안 된다', () => {
    const read = readCaseRows(table(`${CASE_HEAD}${TAB}attr\nTC-1${TAB}policy${TAB}passed${TAB}star${TAB}star\n`));
    expect(read.problems.map((p) => p.message).join()).toMatch(/모르는 칸/);
  });

  it('⛔ 필수 칸이 없으면 거부한다', () => {
    const read = readCaseRows(table(`id${TAB}origin${TAB}status\nTC-1${TAB}policy${TAB}passed\n`));
    expect(read.problems.map((p) => p.message).join()).toMatch(/필수 칸이 없다: "attribution"/);
  });

  it('⛔ 같은 칸 이름이 두 번 나오면 거부한다 — 어느 쪽을 읽을지 모른다', () => {
    const read = readCaseRows(table(`${CASE_HEAD}${TAB}status\nTC-1${TAB}policy${TAB}passed${TAB}star${TAB}failed\n`));
    expect(read.problems.map((p) => p.message).join()).toMatch(/두 번 나온다/);
  });
});

describe('⛔ 모르는 값 — 오타 하나가 「검증했다」를 늘린다', () => {
  it('origin 오타를 거부한다', () => {
    const read = readCaseRows(table(`${CASE_HEAD}\nTC-1${TAB}polciy${TAB}passed${TAB}star\n`));
    expect(read.rows).toHaveLength(0);
    expect(read.problems.map((p) => p.message).join()).toMatch(/origin 값이 "polciy"/);
  });

  it('⚠️ 대조 — 그 오타를 그냥 흘렸다면 계약은 그것을 **검증 분모에 넣는다**', () => {
    const leaked = buildRunReport({
      preconditions: [{ id: 'p', ok: true }],
      // 계약이 모르는 출처를 억지로 밀어 넣은 판 — 파서가 막지 않으면 이 모양이 된다.
      cases: [{ id: 'TC-1', origin: 'polciy' as never, status: 'passed', attribution: 'star', verdict: null }],
    });
    expect(leaked.verification.denominator).toBe(1);
    expect(leaked.verification.excluded.unknownOrigin).toBe(0);
  });

  it('status·attribution·verdict.kind 오타도 거부한다', () => {
    const bad = readCaseRows(table(`${CASE_HEAD}${TAB}verdict.kind\nTC-1${TAB}policy${TAB}pass${TAB}sta${TAB}fixt\n`));
    const joined = bad.problems.map((p) => p.message).join(' ');
    expect(joined).toMatch(/status 값이/);
    expect(joined).toMatch(/attribution 값이/);
    expect(joined).toMatch(/verdict.kind 값이/);
  });

  it('evidence.httpStatus 가 숫자가 아니면 거부한다', () => {
    const read = readCaseRows(table(`${CASE_HEAD}${TAB}evidence.httpStatus\nTC-1${TAB}policy${TAB}passed${TAB}star${TAB}이백\n`));
    expect(read.problems.map((p) => p.message).join()).toMatch(/숫자가 아니다/);
  });
});

describe('⛔ 두 믿음이 갈리는 자리', () => {
  it('사유만 적고 종류를 비우면 거부한다 — 계약은 그것을 「판단 안 함」으로 읽는다', () => {
    const read = readCaseRows(
      table(`${CASE_HEAD}${TAB}verdict.kind${TAB}verdict.why\nTC-1${TAB}policy${TAB}failed${TAB}star${TAB}${TAB}고쳤다\n`),
    );
    expect(read.problems.map((p) => p.message).join()).toMatch(/verdict.kind 가 비었다/);
  });

  it('id 가 두 번 나오면 거부한다 — 어느 줄이 이겼는지 화면에 안 나온다', () => {
    const read = readCaseRows(table(`${CASE_HEAD}\nTC-1${TAB}policy${TAB}passed${TAB}star\nTC-1${TAB}policy${TAB}failed${TAB}star\n`));
    expect(read.problems.map((p) => p.message).join()).toMatch(/id 가 두 번/);
  });

  it('칸이 머리 줄보다 많으면 거부한다 — 안 감싼 구분자가 칸을 쪼갠 자리다', () => {
    const read = readCaseRows(table(`${CASE_HEAD}\nTC-1${TAB}policy${TAB}passed${TAB}star${TAB}남는칸\n`));
    expect(read.problems.map((p) => p.message).join()).toMatch(/칸이 머리 줄보다 많다/);
  });
});

describe('전제 — `ok` 는 3상태다', () => {
  it('yes·no·unknown 을 true·false·null 로 옮긴다', () => {
    const read = readPreconditionRows(table(`id${TAB}ok\na${TAB}yes\nb${TAB}no\nc${TAB}unknown\n`));
    expect(read.problems).toEqual([]);
    expect(read.rows.map((p) => p.ok)).toEqual([true, false, null]);
  });

  it('⛔ `unknown`(확인 못 했다)은 「섰다」가 아니다 — 계약이 케이스를 전부 ⚪ 로 접는다', () => {
    const pre = readPreconditionRows(table(`id${TAB}ok\n세션${TAB}unknown\n`));
    const cases = readCaseRows(table(`${CASE_HEAD}\nTC-1${TAB}policy${TAB}failed${TAB}star\n`));
    const report = buildRunReport({ preconditions: pre.rows, cases: cases.rows });
    expect(report.measurable).toBe(false);
    expect(report.stats.skipped).toBe(1);
    expect(evaluateDone(report).exitCode).toBe(3);
  });

  it('빈칸은 거부한다 — 빈칸을 「모른다」로 조용히 접지 않는다', () => {
    const read = readPreconditionRows(table(`id${TAB}ok\na${TAB}\n`));
    expect(read.problems.map((p) => p.message).join()).toMatch(/ok 이 비었다/);
  });
});

describe('⛔ 0줄은 「없다」가 아니라 못 쟀다 — 분모를 같이 낸다', () => {
  it('머리 줄만 있으면 dataRows 0 이다', () => {
    const read = readCaseRows(table(`${CASE_HEAD}\n`));
    expect(read.rows).toHaveLength(0);
    expect(read.dataRows).toBe(0);
  });
});

describe('양식 + 주행 합치기 — 누가 무엇을 아는가', () => {
  const pw = {
    errors: [],
    suites: [
      {
        file: 'e2e/a.spec.ts',
        specs: [
          { title: 'TC-1 지나간다', file: 'e2e/a.spec.ts', tests: [{ status: 'expected' }] },
          { title: 'TC-2 깨진다', file: 'e2e/a.spec.ts', tests: [{ status: 'unexpected' }] },
        ],
      },
    ],
  };
  const form = readCaseRows(
    table(
      `${CASE_HEAD}${TAB}verdict.kind${TAB}verdict.why\n` +
        `TC-1${TAB}policy${TAB}unmeasured${TAB}star${TAB}${TAB}\n` +
        `TC-2${TAB}policy${TAB}unmeasured${TAB}galaxy${TAB}fixed${TAB}셀렉터를 고쳤다\n` +
        `TC-9${TAB}policy${TAB}passed${TAB}star${TAB}${TAB}\n`,
    ),
  );

  const merged = mergeFormWithRun(
    { cases: form.rows, preconditions: [{ id: 'p', ok: true }] },
    fromPlaywrightJson(pw),
  );

  it('상태는 **기계**가, 출처·탓·판단은 **사람**이 준다', () => {
    const tc2 = merged.input.cases.find((c) => c.id === 'TC-2');
    expect(tc2?.status).toBe('failed');
    expect(tc2?.attribution).toBe('galaxy');
    expect(tc2?.verdict?.kind).toBe('fixed');
  });

  it('양식에 있는데 주행에 없는 TC 는 ⚪ 이고 **이름을 부른다** — spec 이 없는 TC 다', () => {
    expect(merged.notRun).toEqual(['TC-9']);
    expect(merged.input.cases.find((c) => c.id === 'TC-9')?.status).toBe('unmeasured');
  });

  it('양식이 적어 온 상태와 주행이 갈리면 **갈렸다고 말한다**', () => {
    expect(merged.disagreed.map((d) => d.id).sort()).toEqual(['TC-1', 'TC-2']);
  });

  it('합친 결과를 계약이 판정한다 — 판단 붙은 fail 1건이면 끝났다', () => {
    const done = evaluateDone(buildRunReport(merged.input));
    expect(done.done).toBe(true);
    expect(done.exitCode).toBe(0);
  });
});
