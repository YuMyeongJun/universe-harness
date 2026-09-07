/**
 * 시트 규격(G0~G7) 변이 시험 — **각 규칙이 실제로 무는지** 확인한다.
 *
 * 각 케이스는 두 가지를 함께 본다:
 *   1. 정상 스펙에서는 그 규칙이 **안** 문다
 *   2. 변이 스펙에서는 **바로 그 규칙**이 문다 (다른 규칙이 먼저 걸리면 조준이 틀린 것)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Severity } from '../src/lint/core.js';
import { parseSheetSpec } from '../src/lint/sheet/parse.js';
import { knowledgeRules, lintSheet, sheetRules } from '../src/lint/sheet/rules.js';

const FIXTURES = join(import.meta.dirname, 'fixtures/sheet');
const lint = (name: string) =>
  lintSheet(parseSheetSpec(name, readFileSync(join(FIXTURES, name), 'utf8')));
const errorsOf = (name: string) => lint(name).filter((f) => f.severity === 'error');
const ruleIds = (name: string) => errorsOf(name).map((f) => f.rule);

const MUTATIONS: Array<{ fixture: string; rule: string }> = [
  { fixture: 'g0-empty-action.json', rule: 'G0-empty-action' },
  { fixture: 'g0-single-point.json', rule: 'G0-single-point' },
  { fixture: 'g1-number-binding.json', rule: 'G1-number-binding' },
  { fixture: 'g1-depth.json', rule: 'G1-depth' },
  { fixture: 'g1-restart.json', rule: 'G1-restart' },
  { fixture: 'g2-terminal-noun.json', rule: 'G2-terminal-noun' },
  { fixture: 'g2-no-particle.json', rule: 'G2-no-particle' },
  { fixture: 'g3-terminal.json', rule: 'G3-terminal' },
  { fixture: 'g6-2-emoji.json', rule: 'G6-2-notation' },
  { fixture: 'g6-2-toggle.json', rule: 'G6-2-notation' },
  { fixture: 'g7-banned.json', rule: 'G7-banned-words' },
  { fixture: 'initial-values.json', rule: 'initial-values' },
  { fixture: 'no-ids-in-spec.json', rule: 'no-ids-in-spec' },
  { fixture: 'tab-placeholder.json', rule: 'tab-placeholder' },
];

describe('정상 스펙', () => {
  it('위반이 0건이다', () => {
    expect(errorsOf('good.json')).toEqual([]);
  });

  it('지식이 없으면 ⚪ 로 이름을 부른다 — 조용히 통과시키지 않는다', () => {
    const unmeasured = lint('good.json').filter((f) => f.severity === 'unmeasured');
    expect(unmeasured.map((f) => f.rule)).toContain('G5-category-dictionary');
    expect(unmeasured.map((f) => f.rule)).toContain('G6-1-name-grounding');
  });
});

describe('변이 시험 — 각 규칙이 무는가', () => {
  for (const { fixture, rule } of MUTATIONS) {
    it(`${fixture} → ${rule} 이 문다`, () => {
      const found = ruleIds(fixture);
      expect(
        found.filter((r) => r === rule).length,
        `${rule} 이 물지 않았다. 실제로 문 규칙: ${found.join(', ') || '없음'}`,
      ).toBeGreaterThan(0);
    });

    it(`정상 스펙에서는 ${rule} 이 물지 않는다`, () => {
      expect(ruleIds('good.json')).not.toContain(rule);
    });
  }
});

describe('부분 스펙 (append-rows 흐름)', () => {
  it('번호가 1이 아닌 것으로 시작하면 위반이 아니라 ⚪ 다', () => {
    // README 의 대량 작성 흐름: 시트를 먼저 만들고 나머지를 append-rows 로 이어 붙인다.
    // 그때 부분 스펙은 정당하게 중간 번호에서 시작한다 — 전체 스펙인지 여기서는 못 잰다.
    expect(ruleIds('g1-partial-spec.json')).not.toContain('G1-restart');
    const finding = lint('g1-partial-spec.json').find((f) => f.rule === 'G1-restart');
    expect(finding?.severity).toBe('unmeasured');
  });

  it('번호를 건너뛰면 부분 스펙이어도 위반이다', () => {
    expect(ruleIds('g1-restart.json')).toContain('G1-restart');
  });
});

describe('인용 구간 예외 (G3-1)', () => {
  it('UI 원문 인용 안의 금지 표현은 물지 않는다', () => {
    // "저장이 정상적으로 완료되었습니다." 는 화면 문구다 — 규격 위반이 아니라 검증 대상이다
    expect(ruleIds('g7-quote-exempt.json')).not.toContain('G7-banned-words');
  });

  it('인용 구간이 있으면 원문 대조를 ⚪ 로 남긴다', () => {
    const findings = lint('g7-quote-exempt.json');
    const quote = findings.find((f) => f.rule === 'G3-1-quote-fidelity');
    expect(quote?.severity).toBe('unmeasured');
  });
});

describe('액션 그룹', () => {
  it('연속한 동일 테스트항목을 한 그룹으로 묶는다', () => {
    const sheet = parseSheetSpec('good.json', readFileSync(join(FIXTURES, 'good.json'), 'utf8'));
    const groups = sheet.components[0]?.groups ?? [];
    // 1. 게시글 목록 영역 확인 ×2 / 2. 저장 버튼 선택 ×1 / 1. 알림 토글 ×1
    expect(groups.map((g) => g.rowIndexes.length)).toEqual([2, 1, 1]);
  });
});

describe('관문 자체의 배선', () => {
  it('모든 규칙이 변이 시험으로 조준되어 있다', () => {
    const covered = new Set(MUTATIONS.map((m) => m.rule));
    const uncovered = sheetRules.map((r) => r.id).filter((id) => !covered.has(id));
    expect(uncovered, `변이 케이스 없는 규칙: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('지식 규칙은 전부 ⚪ 로만 나간다 — 형식 관문이 내용을 쟀다고 말하면 안 된다', () => {
    const sheet = parseSheetSpec('x', readFileSync(join(FIXTURES, 'good.json'), 'utf8'));
    const severities = knowledgeRules.flatMap((r) => r.check(sheet)).map((f) => f.severity);
    expect(new Set<Severity>(severities)).toEqual(new Set<Severity>(['unmeasured']));
  });

  it('규칙이 최소 하나는 있다 — 규칙 0개는 "위반 없음"이 아니다', () => {
    expect(sheetRules.length).toBeGreaterThan(0);
  });
});
