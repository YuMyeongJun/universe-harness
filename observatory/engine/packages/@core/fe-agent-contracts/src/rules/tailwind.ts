/**
 * 레인: tailwind — **디자인 토큰과 스타일 가독성**.
 *
 * 임의 값(`w-[327px]`·`bg-[#3B82F6]`)은 디자인 시스템을 우회하는 가장 흔한 경로다.
 * 토큰 이름은 저장소마다 다르므로 여기서는 **임의 값의 존재**만 본다 — 어떤 토큰을 쓸지는
 * 판정 레인과 프로젝트 문서가 말한다.
 */
import type { IStaticRule } from '@core/fe-agent-harness';

import { isSource, isTsx, patternRule } from './helpers.ts';

export const TAILWIND_RULES: IStaticRule[] = [
  patternRule({
    id: 'tailwind/arbitrary-value',
    lane: 'tailwind',
    applies: isSource,
    /* ⚠️⚠️ **접두사를 열거하다 500건 넘게 눈이 멀어 있었다.**
       남의 저장소에서 우리가 모르는 접두사가 901건 나왔다 —
       `min-w-` · `max-h-` · `flex-` · `leading-` · `grid-cols-` · `translate-y-` …
       Tailwind 는 유틸리티가 계속 는다. **열거는 언제나 뒤처진다.**

       열거 대신 **모양으로** 잡는다 — `무엇이든-[값]`.
       ⚠️ 단, `data-[state=open]:bg-x` 같은 **변이 선택자**는 값이 아니라 조건이다.
       변이는 뒤에 `:` 가 붙는다는 것으로 가른다(401건이 그것이었다). */
    pattern: /(?<![\w-])[a-z][\w-]*-\[[^\]]+\](?!:)/,
    fix: '임의 값 금지 → 디자인 토큰 클래스(`bg-background`·`text-muted-foreground`·`space-y-4`).',
    /* ⚠️ `bg-[var(--ui-primary-light)]` 는 **토큰을 쓰고 있는** 코드다. 임의 값 문법이긴 해도
       하드코딩이 아니므로 위반이 아니다 — 이걸 막으면 관문이 토큰 사용을 벌하는 꼴이 된다.
       (실측: 표본 400건 중 47건이 이 형태였다.)

       ⚠️⚠️ **같은 오탐이 새 문법으로 남아 있었다.** 남의 저장소에 걸어 보니
       `bg-[--color-bg]` · `w-[--sidebar-width]` 가 23건 나왔다 —
       **Tailwind 4 의 CSS 변수 축약형**(`var()` 를 안 쓴다)이다.
       「고쳤다」고 믿은 오탐이 **문법이 늘자 다시 샜다.** 두 형태를 다 뺀다.

       ⚠️ `calc()` 도 뺀다 — `h-[calc(100vh-20rem)]` 은 **토큰으로 표현할 수 없다.**
       처방이 없는 규칙은 「고쳐라」가 아니라 「어쩌라고」가 된다. */
    /* ⚠️ **변이 선택자는 값이 아니라 조건이다.** `(?!:)` 로 대부분 갈리는데,
       `has-[>[data-align=x]:…]` 처럼 **대괄호가 중첩되면** 정규식이 안쪽 `]` 에서 멈춰
       뒤의 `:` 를 못 본다. 그래서 변이 계열 접두사를 따로 뺀다.
       (실측에서 이 한 건이 샜다 — 「모양으로 잡기」가 만능은 아니다.) */
    /* ⚠️⚠️ **세 번째로 같은 오탐이 샜다 — 이번엔 「타입 힌트」다.**
       옆 저장소가 잡아 줬다: `text-[color:var(--ui-label-tertiary)]` **4건이 위반으로 나왔는데
       그건 규칙을 지킨 쪽이다.** 값이 디자인 토큰이고, 그 토큰이 실재하는 것도 확인됐다
       (`_semantic.css` 의 `--rgb-ui-label-tertiary`).
       ⛔ **자기 처방을 이미 따른 코드를 위반으로 냈다** — 처방이 「디자인 토큰 클래스로」인데
          이미 디자인 토큰이다. 그런 규칙은 사람이 도구를 안 믿게 만든다.

       원인: 가드가 `[` **바로 뒤**만 봤다. Tailwind 는 대괄호 안에 **타입 힌트**를 허용한다 —
       `text-[color:…]` · `bg-[length:…]` · `w-[size:…]`. 힌트가 끼면 `var(--` 가 뒤로 밀려 안 걸린다.
       ⇒ **힌트를 건너뛰고 값을 본다.**
       ⚠️ 힌트가 있다고 다 빼면 안 된다 — `border-[color:#333]` 은 **하드코딩이라 걸려야 맞다.**
          빼는 기준은 힌트가 아니라 **값이 토큰 참조인가**다.

       ⚠️ 이 오탐은 이번이 세 번째다: ① `var()` 형 ② Tailwind 4 축약형(`[--x]`) ③ 타입 힌트.
          **문법이 늘 때마다 샌다.** 그래서 접두사가 아니라 **값의 모양**으로 판정한다. */
    guard: (match) => {
      const inside = /\[([^\]]+)\]/.exec(match[0])?.[1] ?? '';
      /* 타입 힌트(`color:` · `length:` …)가 있으면 건너뛴다. `var(...)` 안의 `:` 는 없다. */
      const value = /^[a-z-]+:(?!\/)/.test(inside) ? inside.slice(inside.indexOf(':') + 1) : inside;
      const usesToken = /^(?:var\(--|--)/.test(value) || value.startsWith('calc(');
      return !usesToken
        && !/^(?:group|peer|has|data|aria|supports|not|in|nth)-/.test(match[0]);
    },
  }),
  patternRule({
    id: 'tailwind/theme-hardcoded',
    lane: 'tailwind',
    applies: isSource,
    pattern: /(?:className|class)\s*=\s*[^\n]*#[0-9a-fA-F]{3,8}\b/,
    fix: '`text-[#333]` → `text-foreground` 처럼 토큰 클래스로 바꿔라. className 안 raw hex 는 다크 모드에서 따라오지 않는다.',
  }),
  patternRule({
    id: 'tailwind/class-legibility',
    lane: 'tailwind',
    applies: isTsx,
    pattern: /className\s*=\s*"(?:[^"]{200,})"/,
    fix: 'className 한 줄이 200자를 넘었다 — `cva`(class-variance-authority) 변형이나 하위 컴포넌트로 갈라라.',
  }),
];
