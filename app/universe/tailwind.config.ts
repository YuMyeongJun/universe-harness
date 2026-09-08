import type { Config } from 'tailwindcss';

/**
 * 우주 콘솔의 tailwind 설정.
 *
 * ── 이 파일이 하는 일 ────────────────────────────────────
 * `web/src/styles/tokens/` 의 **시맨틱 이름만** tailwind 유틸리티로 노출한다.
 * 팔레트(`--rgb-slate-900` 등)는 여기 나오지 않는다 — 화면이 원색을 직접 부르기
 * 시작하면 층을 나눈 의미가 없어진다.
 *
 * ── 값을 여기 적지 않는 이유 ─────────────────────────────
 * 색·반경·글자 크기는 전부 `var(--…)` 참조다. **값이 두 곳에 적히면 반드시 어긋난다.**
 * 예외는 아래 `spacing` 의 늘린 칸들뿐이고, 왜 예외인지는 그 자리에 적어 뒀다.
 */

/**
 * 여백 램프에서 tailwind 기본 스케일에 **없는 칸**들.
 *
 * 이 콘솔이 원래 쓰던 값이다(9px 버튼 패딩·11px 세그먼트·18px 배너 아래…).
 * ⛔ **4px 격자로 반올림하지 않았다** — 이건 이식이지 재디자인이 아니고,
 * 9px 를 8px 로 바꾸는 순간 「안 바꿨다」가 거짓말이 된다.
 *
 * 왜 `_metrics.css` 변수가 아니라 리터럴인가: 이 칸들을 바꾸는 주체(밀도 설정)가
 * **아직 없다.** 아무도 돌리지 않는 손잡이는 손잡이가 아니다. 밀도가 생기는 날 옮긴다.
 */
const extraSpacing = {
  '0.75': '3px',
  '1.25': '5px',
  '1.75': '7px',
  '2.25': '9px',
  '2.75': '11px',
  '3.75': '15px',
  '4.5': '18px',
  '5.5': '22px',
  '8.5': '34px',
} as const;

/** 시맨틱 채널 하나를 tailwind 색으로 — 투명도 수식(`/30`)이 먹게 `<alpha-value>` 를 남긴다. */
const channel = (name: string): string => `rgb(var(--rgb-${name}) / <alpha-value>)`;

export default {
  /**
   * ⭐ `relative: true` 가 **반드시** 있어야 한다. 없으면 글롭이 `process.cwd()` 기준으로
   * 풀려서, `app/universe` 밖에서 명령을 부르는 순간(예: 저장소 뿌리에서 도는 관문)
   * **아무 파일도 안 걸리고 스타일 없는 화면**이 나온다. 켜 두면 이 설정 파일 위치가 기준이다.
   */
  content: {
    relative: true,
    files: ['./index.html', './web/src/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      /**
       * ⚠️ 원래 CSS 는 `@media (max-width: 760px)` 였다. `min-width: 761px` 로 뒤집으면
       * 760~761px 사이 소수 폭에서 결과가 달라진다. **max 폭 그대로** 이름을 준다.
       *
       * ⚠️ `theme.screens` 가 아니라 **`extend.screens`** 여야 한다 — 통째로 갈아치우면
       * tailwind 기본 `sm:`~`2xl:` 이 **사라진다.** shadcn 이 떨구는 컴포넌트들이
       * `sm:max-w-lg` 같은 클래스를 쓰는데, 그 이름이 없으면 CSS 가 생성되지 않아
       * **조용히 아무 일도 안 일어난다.**
       */
      screens: {
        narrow: { max: '760px' },
      },
      spacing: extraSpacing,
      /** tailwind 기본 `minWidth` 는 여백 스케일을 안 먹는다(0·full·min·max·fit뿐). */
      minWidth: ({ theme }) => ({ ...theme('spacing') }),
      colors: {
        /** 콘솔의 면·글자·강조. 테마가 생기면 이 이름들이 교체된다. */
        ui: {
          bg: channel('ui-bg'),
          surface: channel('ui-surface'),
          'surface-raised': channel('ui-surface-raised'),
          'surface-sunken': channel('ui-surface-sunken'),
          line: channel('ui-line'),
          ink: channel('ui-ink'),
          'ink-dim': channel('ui-ink-dim'),
          'ink-faint': channel('ui-ink-faint'),
          accent: channel('ui-accent'),
          'on-solid': channel('ui-on-solid'),
          ok: channel('ui-ok'),
          warn: channel('ui-warn'),
          bad: channel('ui-bad'),
          shade: channel('ui-shade'),
          /**
           * ── 우주의 장식 ── ⛔ **판정을 나르지 않는다**(`_semantic.css`).
           * ⚠️ 글자색으로 쓰지 마라 — 대비를 재지 않은 색이다. 선 전용이다.
           *
           * ⚠️ 여기 나온 장식 토큰은 `orbit` **하나뿐**이다. `star`·`nebula-*` 는
           * `_space.css` 안에서만 쓰이므로 tailwind 에 안 연다 —
           * **쓰는 데가 없는 이름은 다음 사람에게 「이걸 써도 되나」를 묻게 만드는 빚이다**
           * (`_semantic.css` 가 완성색 별칭을 안 만든 것과 같은 기준).
           */
          orbit: channel('ui-orbit'),
        },
        /** 신호 한 벌 — face(면)·line(테두리)·ink(그 면 위 글자)는 셋이 한 몸이다. */
        tone: {
          'ok-face': channel('tone-ok-face'),
          'ok-line': channel('tone-ok-line'),
          'ok-ink': channel('tone-ok-ink'),
          'warn-face': channel('tone-warn-face'),
          'warn-line': channel('tone-warn-line'),
          'warn-ink': channel('tone-warn-ink'),
          'bad-face': channel('tone-bad-face'),
          'bad-line': channel('tone-bad-line'),
          'bad-ink': channel('tone-bad-ink'),
          /** ⚪ 못 쟀다 — 초록도 빨강도 아니다. 판정 어휘가 셋이라 신호도 넷이다. */
          'unknown-face': channel('tone-unknown-face'),
          'unknown-line': channel('tone-unknown-line'),
          'unknown-ink': channel('tone-unknown-ink'),
        },
      },
      /**
       * ⚠️ **값이 문자열이면 tailwind 는 `font-size` 만 낸다.** 배열로 적으면 줄간격이
       * 딸려 나와서, 1.6 을 상속받던 작은 글자들이 이관하는 순간 전부 좁아진다.
       * `xs`·`xl` 은 기본 칸을 **일부러 덮어쓴 것**이다(기본값에는 줄간격이 붙어 있다).
       */
      fontSize: {
        xs: 'var(--ui-text-xs)',
        meta: 'var(--ui-text-meta)',
        label: 'var(--ui-text-label)',
        xl: 'var(--ui-text-xl)',
        title: 'var(--ui-text-title)',
      },
      lineHeight: {
        body: 'var(--ui-leading-body)',
        code: 'var(--ui-leading-code)',
      },
      letterSpacing: {
        eyebrow: 'var(--ui-tracking-eyebrow)',
      },
      /** preflight 가 `html`·`code`·`pre` 에 먹이는 값이다 — 여기를 바꾸면 글꼴이 바뀐다. */
      fontFamily: {
        sans: 'var(--ui-font-sans)',
        mono: 'var(--ui-font-mono)',
      },
      borderRadius: {
        chip: 'var(--ui-radius-chip)',
        control: 'var(--ui-radius-control)',
        card: 'var(--ui-radius-card)',
        pill: 'var(--ui-radius-pill)',
      },
      /** ⚠️ 0.45 는 tailwind 3.3 이하 기본 스케일에 없다. 버전에 안 기대고 못 박는다. */
      opacity: {
        45: '0.45',
      },
      /**
       * ── 궤도 ── 화면을 가르는 선. 가운데가 밝고 양 끝이 바탕으로 사라진다.
       *
       * 왜 `border-t` 가 아닌가: 평평한 1px 선은 이 화면에 이미 잔뜩 있다(카드 테두리·표
       * 밑선). 구획을 나누는 선까지 같은 모양이면 **위계가 안 선다** — 「이건 다른 종류의
       * 경계다」를 말하는 채널이 필요했다. 양 끝이 사라지는 호는 우주 은유이면서
       * 동시에 **구획선임을 모양으로 말한다.**
       *
       * ⚠️ 이름이 `bg-orbit` 인데 **선**인 이유: CSS 에서 그라디언트는 배경이지 테두리가
       * 아니다. `border-image` 로도 되지만 반경·색을 따로 다시 적어야 한다.
       * 쓰는 법은 높이 1px 짜리 빈 칸이다 — `<div className="h-px bg-orbit" />`.
       * ⛔ 이 위에 글자를 얹지 마라(대비를 안 쟀다).
       */
      backgroundImage: {
        orbit:
          'linear-gradient(90deg,' +
          ' rgb(var(--rgb-ui-orbit) / 0) 0%,' +
          ' rgb(var(--rgb-ui-orbit)) 18%,' +
          ' rgb(var(--rgb-ui-accent) / 0.55) 50%,' +
          ' rgb(var(--rgb-ui-orbit)) 82%,' +
          ' rgb(var(--rgb-ui-orbit) / 0) 100%)',
      },
      maxWidth: { shell: 'var(--ui-shell-max)' },
      maxHeight: { code: 'var(--ui-code-max-h)' },
      minHeight: { textarea: 'var(--ui-textarea-min-h)' },
      /**
       * ⛔ **폭을 여기 리터럴로 적지 마라.** 네 칸의 폭은 `_metrics.css` 한 자리에 있고
       * 여기는 그 이름을 tailwind 에 노출할 뿐이다. 두 곳에 적히면 반드시 어긋난다.
       */
      gridTemplateColumns: {
        entry: 'var(--ui-grid-entry)',
        console: 'var(--ui-grid-console)',
        'console-bare': 'var(--ui-grid-console-bare)',
        inbox: 'var(--ui-grid-inbox)',
      },
    },
  },
  plugins: [],
} satisfies Config;
