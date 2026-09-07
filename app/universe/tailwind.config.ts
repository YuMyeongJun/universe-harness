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
      maxWidth: { shell: 'var(--ui-shell-max)' },
      maxHeight: { code: 'var(--ui-code-max-h)' },
      minHeight: { textarea: 'var(--ui-textarea-min-h)' },
      gridTemplateColumns: { entry: 'var(--ui-grid-entry)' },
    },
  },
  plugins: [],
} satisfies Config;
