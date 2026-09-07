/**
 * 묶음: `house-style` — **팀이 합의한 코딩 컨벤션**. 기본으로 켜지지 않는다(opt-in).
 *
 * 여기 있는 것은 보편 규칙이 아니라 한 조직의 결정이다(화살표 함수만 · 클래스 금지 ·
 * `I` 접두사 인터페이스). 합의한 저장소에서는 `contract.presets` 에 `"house-style"` 을 넣고,
 * 아니면 빼라 — 합의 없는 규칙으로 막으면 관문이 헛돌고, 헛도는 관문은 무시당한다.
 *
 * 켜면 LLM 판정을 거치지 않고 결정론으로 건다 — 같은 코드가 스텝마다 다른 판정을 받으면
 * 궤적이 학습 자료로 죽는다.
 */
import type { IStaticRule } from '@core/fe-agent-harness';

import { isSource, patternRule } from './helpers.ts';

export const HOUSE_STYLE_RULES: IStaticRule[] = [
  patternRule({
    id: 'repo/no-class',
    lane: 'quality',
    applies: isSource,
    pattern: /^\s*(export\s+)?(abstract\s+)?class\s+\w+/m,
    fix: '클래스 금지 — 팩토리 함수나 훅으로 바꿔라.',
  }),
  patternRule({
    id: 'repo/no-enum',
    lane: 'typeSafety',
    applies: isSource,
    pattern: /^\s*(export\s+)?(const\s+)?enum\s+\w+/m,
    fix: '`enum` 금지 → `as const` 객체 + 유니온 타입.',
  }),
  patternRule({
    id: 'repo/arrow-only',
    lane: 'quality',
    applies: isSource,
    pattern: /^\s*(export\s+)?function\s+\w+/m,
    fix: '`function go() {}` → `const go = () => {}` 로 바꿔라. 선언은 호이스팅돼 정의 전에도 불리므로 순서가 거짓말을 한다.',
  }),
  patternRule({
    id: 'repo/interface-prefix',
    lane: 'quality',
    applies: isSource,
    pattern: /\binterface\s+([A-Z]\w*)/,
    fix: '`interface UserProps` → `interface IUserProps` 로 바꿔라. 접두사가 있어야 타입 별칭·컴포넌트 이름과 한눈에 갈린다.',
    guard: (match) => !/^I[A-Z]/.test(match[1]),
  }),
  patternRule({
    id: 'repo/braces-required',
    lane: 'quality',
    applies: isSource,
    pattern: /\bif\s*\([^)]*\)\s*(?!\{)[A-Za-z_$]/,
    fix: '`if (x) return;` → `if (x) { return; }` 로 감싸라. 중괄호 없는 한 줄에 두 번째 줄을 덧붙이면 조건 밖으로 새어 나간다.',
  }),
  patternRule({
    id: 'ts/no-any',
    lane: 'typeSafety',
    applies: isSource,
    pattern: /:\s*any\b|<any>|as\s+any\b/,
    fix: '`any` 금지 — 실제 타입이나 `unknown` + 좁히기.',
  }),
];
