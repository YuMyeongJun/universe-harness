import type { ReactNode } from 'react';

/**
 * ④ **오른쪽 본문** — 고른 것의 증거와, 사람이 판정을 붙이는 자리.
 *
 * ⛔⛔ **아무것도 안 골랐을 때 여기를 비워 두지 않는다.** 빈 칸은 이 콘솔에서
 * 언제나 「괜찮다」로 읽힌다 — 이 저장소가 여러 번 데인 자리다. 「왼쪽에서 고르세요」를
 * **글자로** 적는다(`DetailEmpty`).
 *
 * ⚠️ 머리줄이 **붙어 있다(`sticky`)**. 본문이 길어져도 「지금 어느 케이스를 보고 있나」가
 * 화면에서 안 사라져야 한다 — 스크롤하다 판정을 엉뚱한 케이스에 붙이는 것이
 * 이 화면에서 제일 비싼 실수다.
 */

const HEAD = 'sticky top-0 z-10 border-b border-ui-line bg-ui-bg px-4.5 py-3';
const BODY = 'px-4.5 py-4';

export function DetailPane({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className={HEAD}>{head}</div>
      <div className={BODY}>{children}</div>
    </div>
  );
}

/**
 * 아무것도 안 고른 자리.
 *
 * ⚠️ 테두리가 **점선**인 것은 우연이 아니다 — 이 콘솔에서 점선의 뜻은 하나다:
 * 「여기 있어야 할 것이 없다」. ⚪ 못 쟀다 배지·`Empty`·`CountBadge` 가 전부 같은 어휘를 쓴다.
 *
 * ⛔ **여기서 「전부 보기」 같은 버튼을 권하지 않는다.** 고르지 않고 지나갈 길을 열면
 * 사람은 그 길로 간다 — 이 화면의 일은 **한 건씩 고르고 한 건씩 판단하는 것**이다.
 */
export function DetailEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-8.5">
      <div className="max-w-shell rounded-card border border-dashed border-ui-line p-8.5 text-center text-ui-ink-dim">
        {/**
          * ⚠️ 이모지가 아니라 인라인 SVG 다 — 레일과 **같은 이유**(`NavRail`):
          * 이모지는 기계마다 다른 그림체로 그려져서 화면마다 화풍이 달라진다.
          * ⛔ 뜻은 아래 글자가 진다. 이 그림은 **장식**이라 `aria-hidden` 이다.
          */}
        <svg
          aria-hidden="true"
          className="mx-auto mb-2.5 text-ui-ink-faint"
          fill="none"
          height="28"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          width="28"
        >
          <circle cx="12" cy="12" r="2.5" />
          <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-24 12 12)" />
        </svg>
        {children}
      </div>
    </div>
  );
}
