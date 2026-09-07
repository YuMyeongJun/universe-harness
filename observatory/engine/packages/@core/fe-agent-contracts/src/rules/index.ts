/**
 * 규칙 묶음(preset) — **켜고 끄는 단위**다.
 *
 * 왜 나눴나: `toss`·`a11y`·`tailwind` 는 어느 프론트엔드 저장소에나 통하지만,
 * `house-style`(화살표 함수만 · 클래스 금지 · `I` 접두사)은 **팀 합의**다. 합의하지 않은
 * 저장소에 그것을 걸면 관문이 헛돌고, 헛도는 관문은 에이전트가 무시하는 법부터 배우게 한다.
 *
 * 스택에 매인 규칙(배포·번들)은 여기 없다 — 플러그인이 `extraRules` 로 얹는다.
 */
import type { IStaticRule } from '@core/fe-agent-harness';

import { A11Y_RULES } from './a11y.ts';
import { HOUSE_STYLE_RULES } from './repoConventions.ts';
import { TAILWIND_RULES } from './tailwind.ts';
import { TOSS_QUALITY_RULES } from './tossQuality.ts';

export { A11Y_RULES, HOUSE_STYLE_RULES, TAILWIND_RULES, TOSS_QUALITY_RULES };
export * from './helpers.ts';

export const RULE_PRESETS: Record<string, IStaticRule[]> = {
  toss: TOSS_QUALITY_RULES,
  a11y: A11Y_RULES,
  tailwind: TAILWIND_RULES,
  'house-style': HOUSE_STYLE_RULES,
};

/** 설정 파일의 `contract.presets` 를 규칙 배열로. 모르는 이름은 **조용히 넘기지 않는다.** */
export const resolveRulePresets = (names: string[]): IStaticRule[] =>
  names.flatMap((name) => {
    const preset = RULE_PRESETS[name];
    if (!preset) {
      throw new Error(`없는 규칙 묶음: ${name} (가능: ${Object.keys(RULE_PRESETS).join(', ')})`);
    }
    return preset;
  });

/** 기본 한 벌 — 팀 합의가 필요 없는 것만. */
export const COMMON_RULES: IStaticRule[] = [...TOSS_QUALITY_RULES, ...A11Y_RULES, ...TAILWIND_RULES];

/** 사내 컨벤션까지 전부. */
export const ALL_RULES: IStaticRule[] = [...COMMON_RULES, ...HOUSE_STYLE_RULES];

export const ruleIds = (rules: IStaticRule[] = COMMON_RULES): string[] => rules.map((rule) => rule.id);
