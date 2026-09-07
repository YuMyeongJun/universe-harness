/**
 * 변이 시험 — **검사가 실제로 무는지** 확인한다.
 *
 * 넣은 검사는 반드시 일부러 깨서 무는지 보라. 다른 검사에 먼저 걸리면 조준이 틀린 것이다.
 * 초록불을 증거로 삼지 않는다.
 *
 * 각 케이스는 두 가지를 함께 본다:
 *   1. 정상 티켓에서는 그 규칙이 **안** 문다
 *   2. 변이 티켓에서는 그 규칙이 **문다** (다른 규칙이 아니라 **바로 그 규칙**이)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseTicket } from '../src/lint/parse.js';
import { lintTicket, rules, type Severity } from '../src/lint/rules.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const lint = (name: string) =>
  lintTicket(parseTicket(name, readFileSync(join(FIXTURES, name), 'utf8')));
const ruleIds = (name: string) => lint(name).map((f) => f.rule);

const MUTATIONS: Array<{ fixture: string; rule: string; severity: Severity }> = [
  { fixture: 'missing-landing-evidence.md', rule: 'precondition-field-missing', severity: 'error' },
  { fixture: 'no-negative.md', rule: 'no-negative-check', severity: 'error' },
  { fixture: 'weak-negative.md', rule: 'weak-negative-check', severity: 'error' },
  { fixture: 'action-expected-mismatch.md', rule: 'action-expected-mismatch', severity: 'error' },
  { fixture: 'no-requirement-id.md', rule: 'requirement-id-unmapped', severity: 'error' },
  { fixture: 'selector-no-contrast.md', rule: 'selector-without-contrast', severity: 'error' },
  { fixture: 'auth-any.md', rule: 'auth-unmeasured', severity: 'unmeasured' },
];

describe('정상 티켓', () => {
  it('위반이 0건이다', () => {
    expect(lint('good.md')).toEqual([]);
  });
});

describe('변이 시험 — 각 규칙이 무는가', () => {
  for (const { fixture, rule, severity } of MUTATIONS) {
    it(`${fixture} → ${rule} 이 문다`, () => {
      const findings = lint(fixture);
      const hit = findings.filter((f) => f.rule === rule);
      expect(hit.length, `${rule} 이 물지 않았다. 실제로 문 규칙: ${findings.map((f) => f.rule).join(', ') || '없음'}`).toBeGreaterThan(0);
      expect(hit[0]?.severity).toBe(severity);
    });

    it(`${fixture} → 정상 티켓에서는 ${rule} 이 물지 않는다`, () => {
      expect(ruleIds('good.md')).not.toContain(rule);
    });
  }
});

describe('관문 자체의 배선', () => {
  it('모든 규칙이 변이 시험으로 조준되어 있다', () => {
    // 변이 케이스 없는 규칙을 늘리지 못하게 막는다.
    // "검사를 만들었는데 무는지 확인 안 함"이 구조적으로 불가능해야 한다.
    const covered = new Set(MUTATIONS.map((m) => m.rule));
    // 아래 둘은 다른 규칙에 흡수되거나 선택적으로만 뜨는 것 — 사유를 적고 면제한다.
    const exempt = new Set([
      'landing-evidence-missing', // 값이 "미확인"일 때만 ⚪. precondition-field-missing 이 빈 칸을 잡는다
      'expected-result-unconfirmed', // 메타 필드가 "미확정"일 때만 ⚪
    ]);
    const uncovered = rules.map((r) => r.id).filter((id) => !covered.has(id) && !exempt.has(id));
    expect(uncovered, `변이 케이스 없는 규칙: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('규칙이 최소 하나는 있다 — 규칙 0개는 "위반 없음"이 아니다', () => {
    expect(rules.length).toBeGreaterThan(0);
  });
});
