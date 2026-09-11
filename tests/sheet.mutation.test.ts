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
  { fixture: 'g3-abbrev-mixed.json', rule: 'G3-abbrev-consistency' },
  { fixture: 'g4-precondition-action.json', rule: 'G4-precondition-form' },
  { fixture: 'g4-precondition-obvious.json', rule: 'G4-precondition-form' },
  { fixture: 'g5-category-length.json', rule: 'G5-category-form' },
  { fixture: 'g5-category-consistency.json', rule: 'G5-category-consistency' },
  { fixture: 'g0-three-results.json', rule: 'G0-single-point' },
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

describe('사전 조건 공란', () => {
  it('사전 조건이 비어 있는 것은 위반이 아니다', () => {
    // 실측: 전체 행의 10% 만 사전조건을 채운다. 해당 TC 의 기대결과를 바꾸는 조건만 적는다.
    const spec = JSON.parse(readFileSync(join(FIXTURES, 'good.json'), 'utf8'));
    for (const row of spec.components[0].rows) row.precondition = '';
    const findings = lintSheet(parseSheetSpec('x', JSON.stringify(spec)));
    expect(findings.filter((f) => f.severity === 'error').map((f) => f.rule)).toEqual([]);
  });
});

describe('대분류 사전 (--features-dir)', () => {
  it('폴더 목록이 없으면 ⚪ 로 남는다', () => {
    const finding = lint('good.json').find((f) => f.rule === 'G5-major-dictionary');
    expect(finding?.severity).toBe('unmeasured');
  });

  it('폴더 목록이 있으면 잰다 — 목록 밖 대분류는 위반', () => {
    const sheet = parseSheetSpec('x', readFileSync(join(FIXTURES, 'good.json'), 'utf8'));
    const findings = lintSheet(sheet, { majorDictionary: ['회원', '결제'] });
    expect(findings.filter((f) => f.rule === 'G5-major-dictionary' && f.severity === 'error').length)
      .toBeGreaterThan(0);
  });

  it('언더스코어 접두 폴더는 대분류가 아니고 `공통` 이 허용된다', () => {
    const spec = JSON.parse(readFileSync(join(FIXTURES, 'good.json'), 'utf8'));
    for (const row of spec.components[0].rows) row.major = '공통';
    const findings = lintSheet(parseSheetSpec('x', JSON.stringify(spec)), {
      majorDictionary: ['_common', '회원'],
    });
    expect(findings.filter((f) => f.rule === 'G5-major-dictionary' && f.severity === 'error')).toEqual([]);
  });
});

describe('부분 스펙 (append-rows 흐름)', () => {
  it('행 배열(append-rows)의 **첫** 그룹이 1이 아닌 것은 ⚪ 다', () => {
    // 선행 행은 시트에 있고 페이로드에 없다. 스펙만 봐서는 못 잰다.
    expect(ruleIds('g1-partial-spec.json')).not.toContain('G1-restart');
    const finding = lint('g1-partial-spec.json').find((f) => f.rule === 'G1-restart');
    expect(finding?.severity).toBe('unmeasured');
  });

  it('행 배열이어도 **두 번째** 그룹부터는 잰다', () => {
    // 소분류가 바뀌면 번호는 1. 로 돌아와야 한다 — 페이로드 안에서 확인 가능하다.
    expect(ruleIds('g1-partial-second-group.json')).toContain('G1-restart');
  });

  it('객체 스펙(create-from-template)은 첫 그룹도 1이어야 한다', () => {
    // create-from-template 은 항상 새 시트를 만든다 — 선행 행이 존재할 수 없다.
    expect(ruleIds('g1-full-spec-not-one.json')).toContain('G1-restart');
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

describe('회귀 — 실사용에서 나온 버그', () => {
  it('NFD 폴더 이름을 NFC 스펙 값과 맞춘다 (macOS)', () => {
    // macOS 파일시스템은 한글을 NFD 로 돌려준다. 눈에는 같아 보여도 JS 문자열로는 다른 값이라
    // 정규화 없이는 **정상 대분류가 100% 오탐**이 된다 (실측: 지식 폴더 10개 중 7개가 NFD).
    const nfd = '공지'.normalize('NFD');
    expect(nfd).not.toBe('공지'); // 전제 확인 — 두 형식이 실제로 다르다
    const spec = JSON.parse(readFileSync(join(FIXTURES, 'good.json'), 'utf8'));
    for (const row of spec.components[0].rows) row.major = '공지';
    const findings = lintSheet(parseSheetSpec('x', JSON.stringify(spec)), {
      majorDictionary: [nfd, '설정'.normalize('NFD')],
    });
    expect(findings.filter((f) => f.rule === 'G5-major-dictionary' && f.severity === 'error')).toEqual([]);
  });

  it('NFD 로 적힌 스펙 값도 길이 상한을 정확히 잰다', () => {
    // `목록관리` 는 NFC 4자 / NFD 11자다. 정규화하지 않으면 대분류 상한(10)에 헛걸린다.
    const spec = JSON.parse(readFileSync(join(FIXTURES, 'good.json'), 'utf8'));
    for (const row of spec.components[0].rows) row.major = '목록관리'.normalize('NFD');
    const findings = lintSheet(parseSheetSpec('x', JSON.stringify(spec)));
    expect(findings.filter((f) => f.rule === 'G5-category-form' && f.severity === 'error')).toEqual([]);
  });

  it('연결어미 `며,` 로 이어진 결과 3개를 잡는다', () => {
    // 리터럴 `되며,` 만 세면 "노출 되며, 닫히며, 유지 됨" 을 놓친다.
    // `-며,` 는 아무 용언 어간에나 붙는다.
    expect(ruleIds('g0-three-results.json')).toContain('G0-single-point');
  });

  it('조사 인용이 어절 단위로 나온다', () => {
    const spec = JSON.parse(readFileSync(join(FIXTURES, 'good.json'), 'utf8'));
    for (const row of spec.components[0].rows) row.content = '1. 저장 버튼을 선택';
    const finding = lintSheet(parseSheetSpec('x', JSON.stringify(spec))).find(
      (f) => f.rule === 'G2-no-particle',
    );
    expect(finding?.message).toContain('"버튼을"');
    expect(finding?.message).not.toContain('"튼을"');
  });

  it('행 위치를 기계가 되짚을 수 있게 담는다', () => {
    const finding = lint('g0-empty-action.json').find((f) => f.rule === 'G0-empty-action');
    expect(finding?.tab).toBe('관리자 콘솔');
    expect(finding?.rowIndex).toBe(2); // 스펙 행 순서(1-based)
  });
});
