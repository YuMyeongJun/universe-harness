/**
 * TC 티켓 정적 관문 — **"내용이 옳은가"는 재지 않는다. "형식이 재고 있는가"만 잰다.**
 *
 * ⛔ 못 잡는 것: 필드가 다 채워졌지만 **얕은 TC**.
 *    이 방법으로는 잡히지 않는다. 못 잡는다고 여기 적어 두는 것이 지금 할 수 있는 최선이다.
 */
import { err, isBlank, isDeclaredUnmeasured, unmeasured, type IFinding, type IRule } from './core.js';
import type { IParsedTicket } from './parse.js';

export type { IFinding, IRule, Severity } from './core.js';

/** 라벨을 느슨하게 찾는다 — 이모지·공백·조사 차이를 흡수한다 */
const find = (map: Map<string, string>, ...keywords: string[]): string | undefined => {
  for (const [label, value] of map) {
    if (keywords.every((k) => label.includes(k))) return value;
  }
  return undefined;
};

const REQUIRED_PRECONDITIONS: Array<{ id: string; keywords: string[]; label: string }> = [
  { id: 'entry-screen', keywords: ['진입', '화면'], label: '진입 화면' },
  { id: 'auth-context', keywords: ['인증'], label: '인증 컨텍스트' },
  { id: 'landing-url', keywords: ['착지', 'URL'], label: '기대 착지 URL' },
  { id: 'landing-evidence', keywords: ['착지', '증거'], label: '착지 증거 요소' },
  { id: 'prior-state', keywords: ['선행', '상태'], label: '선행 상태와 그 위치' },
  { id: 'branch', keywords: ['분기'], label: '분기 조건' },
];

export const rules: Array<IRule<IParsedTicket>> = [
  {
    id: 'precondition-field-missing',
    check: (t) => {
      const out: IFinding[] = [];
      for (const field of REQUIRED_PRECONDITIONS) {
        const value = find(t.preconditions, ...field.keywords);
        if (value === undefined) {
          out.push(
            err(
              'precondition-field-missing',
              `사전조건에 [${field.label}] 항목이 없다`,
              '빈 칸은 "무관"으로 읽힌다. 모르면 "미확인"이라 적어 ⚪ 로 남겨야 한다',
            ),
          );
        } else if (isBlank(value)) {
          out.push(
            err(
              'precondition-field-missing',
              `사전조건 [${field.label}] 이 비어 있다`,
              '빈 칸은 "무관"으로 읽힌다. 모르면 "미확인"이라 적어라',
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'landing-evidence-missing',
    check: (t) => {
      const value = find(t.preconditions, '착지', '증거');
      if (value === undefined || isBlank(value)) return []; // 위 규칙이 이미 잡는다
      if (isDeclaredUnmeasured(value)) {
        return [
          unmeasured(
            'landing-evidence-missing',
            '착지 증거 요소가 미확인이다 — 도달 검증은 안 잰 것으로 집계한다',
            'URL 만으로는 404·에러 페이지도 통과한다. 그 화면에만 있는 요소가 필요하다',
          ),
        ];
      }
      return [];
    },
  },
  {
    id: 'no-negative-check',
    check: (t) =>
      t.negatives.length === 0
        ? [
            err(
              'no-negative-check',
              '부정 검증(Must Not Happen)이 0줄이다',
              '"일어나면 안 되는 것"이 없는 TC 는 자동화하면 항상 통과하는 스크립트가 된다',
            ),
          ]
        : [],
  },
  {
    id: 'weak-negative-check',
    check: (t) => {
      const out: IFinding[] = [];
      for (const line of t.negatives) {
        // "행동을 했는데도 일어나지 않았다" 형태인가.
        // [행동] 마커가 있거나, 양보 어미(-해도/-한 뒤에도/-했는데도)가 있어야 한다.
        const hasActionMarker = /\[행동\]/.test(line);
        const hasConcessive = /(해도|하여도|한 뒤에도|했는데도|하더라도|누르(?:고|면)도|클릭해도|입력해도|제출해도)/.test(
          line,
        );
        if (!hasActionMarker && !hasConcessive) {
          out.push(
            err(
              'weak-negative-check',
              `약한 부정이다: "${line.slice(0, 60)}"`,
              '"에러가 안 뜬다"는 아무 일도 안 일어나도 통과한다. "행동을 했는데도 일어나지 않았다" 형태여야 한다',
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'action-expected-mismatch',
    check: (t) => {
      const out: IFinding[] = [];
      if (t.actionNumbers.length === 0) {
        return [
          err(
            'action-expected-mismatch',
            '[Action] 이 하나도 없다',
            '테스트 항목이 없는 티켓은 스크립트로 옮길 것이 없다',
          ),
        ];
      }
      // 번호가 1부터 연속인가
      const expectedSeq = t.actionNumbers.map((_, i) => i + 1);
      if (t.actionNumbers.join(',') !== expectedSeq.join(',')) {
        out.push(
          err(
            'action-expected-mismatch',
            `[Action] 번호가 1부터 연속이 아니다: ${t.actionNumbers.join(', ')}`,
            'Action ↔ Expected 를 번호로 1:1 대응시키지 않으면 변환 때 사람이 다시 읽어야 한다',
          ),
        );
      }
      for (const n of t.actionNumbers) {
        if ((t.expectedByAction.get(n) ?? 0) === 0) {
          out.push(
            err(
              'action-expected-mismatch',
              `[Action] ${n} 에 대응하는 [Expected] 가 없다`,
              'Action 하나마다 Expected 가 최소 하나 있어야 1:1 대응이 성립한다',
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'requirement-id-unmapped',
    check: (t) => {
      const value = find(t.metadata, '요구사항');
      if (value === undefined || isBlank(value)) {
        return [
          err(
            'requirement-id-unmapped',
            '요구사항 ID 가 없다',
            '모든 요구사항 ID 가 최소 1건 매핑되는 것이 커버리지 완료 조건이다. 없으면 역매핑이 안 된다',
          ),
        ];
      }
      return [];
    },
  },
  {
    id: 'selector-without-contrast',
    check: (t) => {
      const out: IFinding[] = [];
      for (const row of t.selectorRows) {
        if (isBlank(row.target)) continue;
        const aBlank = isBlank(row.whenA);
        const bBlank = isBlank(row.whenB);
        if (aBlank || bBlank) {
          out.push(
            err(
              'selector-without-contrast',
              `셀렉터 [${row.target}] 에 조건 대비가 없다`,
              '요소가 항상 존재하면 셀렉터가 정확해도 아무것도 재지 않는다. 조건이 바뀌면 무엇이 달라지는지가 있어야 한다',
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'auth-unmeasured',
    check: (t) => {
      const value = find(t.preconditions, '인증');
      if (value === undefined || isBlank(value)) return [];
      if (/무관/.test(value)) {
        return [
          unmeasured(
            'auth-unmeasured',
            '인증 컨텍스트가 "무관"이다 — 이 축은 안 쟀다',
            '"무관"은 편한 값이 아니라 안 잰다는 뜻이다. 통과 쪽에 섞으면 인증 분기는 영영 안 재진다',
          ),
        ];
      }
      return [];
    },
  },
  {
    id: 'expected-result-unconfirmed',
    check: (t) => {
      const value = find(t.metadata, '기대결과', '확정');
      if (value !== undefined && /미확정/.test(value)) {
        return [
          unmeasured(
            'expected-result-unconfirmed',
            '기대결과가 미확정이다 — 판정 결과를 통과로 세지 않는다',
            '기획 의도와 현재 구현이 갈린 상태에서 못 박으면 나중에 전부 다시 고쳐야 한다',
          ),
        ];
      }
      return [];
    },
  },
];

export const lintTicket = (ticket: IParsedTicket): IFinding[] =>
  rules.flatMap((rule) => rule.check(ticket));
