/**
 * 레인: a11y — **웹 접근성**.
 *
 * ⚠️ 많은 저장소에 `eslint-plugin-jsx-a11y` 가 **없다**(이 저장소도 실측으로 미설치였다).
 *    그러면 lint 게이트는 접근성을 못 잡고, Contract 가 유일한 자리가 된다. 여기 규칙을 지우지 마라.
 *    반대로 jsx-a11y 를 켠 저장소에서는 이 레인을 꺼서 이중 판정을 피해도 된다.
 */
import type { IStaticRule } from '@core/fe-agent-harness';

import { isTsx, patternRule } from './helpers.ts';

export const A11Y_RULES: IStaticRule[] = [
  patternRule({
    id: 'a11y/semantic-element',
    /* 주석 처리된 `onClick` 은 안 도는 코드다 — 지운 사본에서 찾는다. */
    mask: true,
    lane: 'a11y',
    applies: isTsx,
    pattern: /<(div|span|li|td)\b(?:[^>]|=>)*\bonClick=/,
    fix: '클릭 가능한 것은 `<button type="button">` 이다. 굳이 유지하려면 `role` + `tabIndex={0}` + `onKeyDown`(Enter/Space) 셋을 모두 붙여라.',
    guard: (match) => !/role=/.test(match[0]) || !/tabIndex=/.test(match[0]),
  }),
  patternRule({
    id: 'a11y/img-alt',
    lane: 'a11y',
    applies: isTsx,
    pattern: /<img\b(?!(?:[^>]|=>)*\balt=)(?:[^>]|=>)*>/,
    fix: '`<img>` 에 `alt` 를 반드시 준다(장식이면 `alt=""`).',
  }),
  patternRule({
    id: 'a11y/button-type',
    lane: 'a11y',
    applies: isTsx,
    pattern: /<button\b(?!(?:[^>]|=>)*\btype=)(?:[^>]|=>)*>/,
    fix: '`<button>` 기본 type 은 submit 이다 — 폼 안에서 의도치 않게 제출된다. `type="button"` 을 명시하라.',
  }),
  patternRule({
    id: 'a11y/accessible-name',
    lane: 'a11y',
    applies: isTsx,
    /* ⚠️⚠️ **0 은 무죄가 아니라 고장이었다.** 남의 저장소 3,058 파일에서 이 규칙만
       **한 건도** 안 나왔다. 열어 보니 패턴이 `svg` 와 `Icon*` 라는 **한 가지 작명만**
       알고 있었다 — 실제 코드는 `IcClose` · `Icons.IcCircleExclamation` · `CloseIcon` 을 쓴다.
       작명을 열거하는 대신 **의미로 잡는다**: 버튼 안이 **자기 닫는 요소뿐이고 글자가 없으면**
       접근 가능한 이름이 없다. 아이콘이 무엇으로 불리든 통한다. */
    pattern: /<button\b(?!(?:[^>]|=>)*aria-label)(?:[^>]|=>)*>\s*(?:<[A-Za-z][\w.]*(?:\s(?:[^<>]|=>)*?)?\/>\s*)+<\/button>/,
    /* ⚠️ **안쪽 요소가 이름을 줄 수도 있다.** `<button><img alt="상품 이미지" /></button>` 는
       접근 가능한 이름이 있다 — `alt` 가 그것이다.
       이 오탐을 **커밋 관문이 잡았다**(엔진 계약 규칙 시험). 관문이 없었으면
       「고쳤다」면서 새 오탐을 들여놨을 것이다. */
    guard: (match) => !/\b(?:alt|aria-label|aria-labelledby|title)\s*=/.test(match[0]),
    fix: '아이콘 전용 버튼에 접근 가능한 이름이 없다 — `aria-label` 을 붙여라.',
  }),
  patternRule({
    id: 'a11y/input-label',
    lane: 'a11y',
    applies: isTsx,
    /* ⚠️⚠️ **이 규칙은 입력의 6% 만 보고 있었다.** 남의 저장소 셋을 세어 보니
       소문자 `<input>` 은 **24개**인데 감싼 `<Input>`(shadcn 등)은 **350개**였다.
       작명을 열거하는 대신 **의미로** 잡는다 — `placeholder` 가 있으면 그것은 입력이다.
       무엇으로 불리든, 어느 라이브러리를 쓰든 통한다.
       (`accessible-name` 에서 배운 것과 같은 처방이다.) */
    /* ⚠️ **`label` prop 을 안 봤다.** 남의 저장소 표본에서 `<CardDescriptionField … label={t('…')} />`
       가 잡혔다 — 이름을 **줬는데도** 벌한 것이다. UI 킷 컴포넌트는 `label` 을 받아
       `<label>` 을 그린다. 고칠 수 없는 자리를 벌하면 사람은 관문을 무시하는 법부터 배운다. */
    pattern: /<(?:input\b|[A-Z][\w.]*\b(?=(?:[^<>]|=>)*\bplaceholder\s*=))(?!(?:[^>]|=>)*(?:aria-label|aria-labelledby|id=|label=|label\s*=))(?:[^>]|=>)*>/,
    fix: '입력에 이름이 없다 — `<label htmlFor>` 와 `id` 를 잇거나 `aria-label` 을 줘라.',
  }),
];
