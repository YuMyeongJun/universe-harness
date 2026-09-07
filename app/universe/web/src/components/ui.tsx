import type { ReactNode } from 'react';

import type { Fill } from '@api/types';

/**
 * 콘솔의 작은 조각들.
 *
 * ⚠️ **클래스 문자열을 합칠 때는 한 속성을 두 번 적지 마라.** tailwind 는 클래스가 적힌
 * 순서가 아니라 **CSS 출력 순서**로 이긴다. `mt-1` 뒤에 `mt-4.5` 를 붙여도 뭐가 이길지
 * 호출부만 봐서는 알 수 없다. 그래서 아래 상수들은 여백처럼 호출부가 덮고 싶어 하는
 * 속성을 **일부러 빼 두었다**(`SUB` 의 위쪽 여백, `HELP_TEXT` 의 여백).
 */

/** 보조 설명 글자. 위쪽 여백은 호출부가 준다 — 자리마다 다르다. */
export const HELP_TEXT = 'block text-xs text-ui-ink-faint';

/** 제목 아래 설명 문단. 위쪽 여백은 호출부가 준다(`mt-1` 이 기본, 0 인 자리가 있다). */
export const SUB = 'mb-5.5 text-ui-ink-dim';

/** 화면 한 장의 바깥 틀. */
export function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-shell px-6 pb-20 pt-7">{children}</div>;
}

export function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-3">
        <span className="text-xs uppercase tracking-eyebrow text-ui-ink-faint">{eyebrow}</span>
      </div>
      <h1 className="text-title font-bold">{title}</h1>
      {sub && <p className={`mt-1 ${SUB}`}>{sub}</p>}
    </div>
  );
}

export function Field({
  label,
  sub,
  help,
  children,
}: {
  label: string;
  sub?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.25 flex items-baseline gap-2">
        <span className="text-label font-semibold">{label}</span>
        {sub && <span className="text-xs text-ui-ink-faint">{sub}</span>}
      </div>
      {children}
      {help && <span className={`mt-1 ${HELP_TEXT}`}>{help}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-ui-line p-8.5 text-center text-ui-ink-faint">
      {children}
    </div>
  );
}

/** 배너 안의 인라인 `code` 는 바탕을 깐다 — 원래 `.banner code` 셀렉터가 하던 일이다. */
const BANNER_CODE = '[&_code]:rounded-chip [&_code]:bg-ui-shade/30 [&_code]:px-1.25 [&_code]:py-px';

/**
 * ⛔⛔ **판정 어휘는 셋이 아니라 넷이 그려진다** — ✅ · ❌ · ⚠️(경고) · ⚪ **못 쟀다.**
 * `unknown` 을 warn 이나 bad 로 접으면 「못 쟀다」가 「실패했다」로 보이고,
 * ok 로 접으면 「안 봤다」가 「위반이 없다」로 보인다. 둘 다 이 저장소가 데인 자리다.
 */
export type BannerTone = 'ok' | 'warn' | 'bad' | 'unknown';

const BANNER_TONE: Record<BannerTone, string> = {
  ok: 'border-tone-ok-line bg-tone-ok-face text-tone-ok-ink',
  warn: 'border-tone-warn-line bg-tone-warn-face text-tone-warn-ink',
  bad: 'border-tone-bad-line bg-tone-bad-face text-tone-bad-ink',
  unknown: 'border-tone-unknown-line bg-tone-unknown-face text-tone-unknown-ink',
};

export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return (
    <div className={`mb-4.5 rounded-card border px-3.5 py-3 ${BANNER_CODE} ${BANNER_TONE[tone]}`}>
      {children}
    </div>
  );
}

/**
 * 상태 배지.
 *
 * ⚠️ 글자색은 **면(`tone-*-face`)이 아니라 신호 원색(`ui-ok` …)** 이다. 배너와 다른 짝인데,
 * 원래 그렇게 그려져 있었다 — 배지는 작아서 더 밝은 글자가 아니면 안 읽힌다.
 */
/**
 * ⚠️ `auto`(자동수집)와 `unknown`(⚪ 못 쟀다)은 **다른 말**이다 — 색이 비슷해도 합치지 마라.
 * `auto` 는 「기계가 넣었다」이고 `unknown` 은 「아무도 모른다」다.
 */
/**
 * ⚠️ **어휘가 둘이라 이름도 둘이다.** `Fill`(filled·partial·stub)은 「도메인 문서가 얼마나
 * 채워졌나」 전용이고, 판정 신호는 `ok`·`warn`·`bad` 다. 은하 목록에서 「좌표가 없다」를
 * `stub`(=골격만) 이라고 부르면 읽는 사람이 **다른 뜻으로 읽는다.**
 * ⛔ 그렇다고 클래스 문자열을 두 벌 적지 않는다 — 두 자리가 갈리면 색만 고쳐지는 날이 온다.
 *    ⇒ 값은 **아래 한 벌**이고, `Fill` 이름은 그 한 벌을 **가리키기만** 한다.
 */
export type PillTone = Fill | 'ok' | 'warn' | 'bad' | 'auto' | 'unknown';

const PILL_SIGNAL = {
  ok: 'border-tone-ok-line bg-tone-ok-face text-ui-ok',
  warn: 'border-tone-warn-line bg-tone-warn-face text-ui-warn',
  bad: 'border-tone-bad-line bg-tone-bad-face text-ui-bad',
  auto: 'border-ui-line bg-ui-surface-raised text-ui-ink-dim',
  unknown: 'border-tone-unknown-line bg-tone-unknown-face text-tone-unknown-ink',
} as const;

const PILL_TONE: Record<PillTone, string> = {
  ...PILL_SIGNAL,
  filled: PILL_SIGNAL.ok,
  partial: PILL_SIGNAL.warn,
  stub: PILL_SIGNAL.bad,
};

export function Pill({
  tone,
  className = '',
  children,
}: {
  tone: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`whitespace-nowrap rounded-pill border px-2.25 py-0.75 text-xs ${PILL_TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Tile({ v, l }: { v: number | string; l: string }) {
  return (
    <div className="min-w-24 rounded-card border border-ui-line bg-ui-surface px-4 py-2.5">
      <span className="block text-xl font-bold">{v}</span>
      <span className="text-xs text-ui-ink-faint">{l}</span>
    </div>
  );
}
