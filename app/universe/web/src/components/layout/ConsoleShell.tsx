import type { ReactNode } from 'react';

import { NavRail } from '@components/layout/NavRail';

/**
 * **콘솔의 뼈대** — ① 레일 · ② 사이드바 · (그 안에 ③ 리스트 · ④ 본문).
 *
 * ── 왜 한 장 스크롤을 버렸나 ────────────────────────────
 * 전에는 화면 하나가 **위에서 아래로 이어진 긴 한 장**이었다. 은하 목록이 실측
 * **10,948px** 였다(스크린샷 높이 그대로) — 카드 일곱 장을 보려면 화면 열두 번을 넘겨야 했고,
 * ⛔ 맨 위에 있던 「어긋난 자리 1건」 배너는 **세 번째 카드부터 이미 화면 밖**이었다.
 * 사람이 판정을 붙이려면 **증거와 판정하는 자리가 같은 화면에** 있어야 하는데,
 * 한 장 스크롤에서는 그 둘이 언제나 서로 다른 화면에 있었다.
 * ⇒ 칸마다 **따로 구른다.** 왼쪽에서 고르고 오른쪽에서 판단한다 — 스크롤이 서로를 안 민다.
 *
 * ── ⛔ 이 뼈대가 하지 않는 것 ───────────────────────────
 *  1. **칸을 접었다 폈다 하는 손잡이를 안 만들었다.** 접을 수 있는 칸은 접힌 채로 잊히고,
 *     ② 가 접히면 「어느 법칙이 몇 건인지」가 화면에서 사라진다. 그건 이 콘솔이
 *     제일 숨기면 안 되는 수다.
 *  2. ⛔ **「전부 통과 처리」·「무시하고 계속」 같은 일괄 갈래를 어디에도 안 둔다.**
 *     넘길 수 있는 관문은 넘겨진다.
 *
 * ⚠️ 좁은 화면(≤760px)에서는 4단이 성립하지 않는다 — 한 칸이 90px 가 된다.
 *    그때는 **세로로 쌓고** 각 칸의 높이 제한을 푼다(아래 `narrow:` 참고).
 *    ⛔ 「모바일은 나중에」로 두지 않았다: 안 쌓으면 좁은 화면에서 **글자가 겹쳐** 못 읽는다.
 */

/** 화면 전체를 채우고, **바깥은 안 구른다** — 구르는 것은 칸 안쪽뿐이다. */
const FRAME = 'grid h-full overflow-hidden narrow:h-auto narrow:grid-cols-1 narrow:overflow-visible';

/** 칸 하나 — 자기 안에서만 구른다. ⚠️ `min-h-0` 이 없으면 grid 칸이 안 줄어 스크롤이 안 생긴다. */
const COLUMN = 'min-h-0 overflow-y-auto narrow:overflow-visible';

export interface IConsoleShellProps {
  /**
   * ② 사이드바. **없어도 된다** — 「고르는 화면」(은하·도메인)은 사이드바 없이
   * 본문만 넓게 쓴다. ⛔ 빈 사이드바를 그리지 않는다: 빈 칸은 「여기 뭔가 있어야 하는데
   * 없다」로 읽힌다.
   */
  sidebar?: ReactNode;
  /** ③④(또는 한 장짜리 본문). */
  children: ReactNode;
}

export function ConsoleShell({ sidebar, children }: IConsoleShellProps) {
  return (
    <div className={`${FRAME} ${sidebar === undefined ? 'grid-cols-console-bare' : 'grid-cols-console'}`}>
      {/* ① 레일은 안 구른다 — 네 칸뿐이라 언제나 다 보인다. */}
      <div className="min-h-0 narrow:hidden">
        <NavRail />
      </div>

      {sidebar !== undefined && (
        <div className={`${COLUMN} border-r border-ui-line bg-ui-surface-sunken`}>{sidebar}</div>
      )}

      <div className="grid min-h-0 grid-rows-1">{children}</div>
    </div>
  );
}

/**
 * ③④ 를 나란히 세우는 **안쪽 격자.**
 *
 * ⚠️ 바깥 격자에 네 칸을 한 번에 안 적은 이유: 사이드바가 없는 화면(은하·도메인)은
 * ③④ 도 없어서, 한 격자로 적으면 「지금 몇 칸짜리인가」를 정하는 조건이 네 갈래가 된다.
 * 두 격자로 나누면 각각 **두 갈래**뿐이다.
 */
export function InboxPanes({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return (
    <div className="grid min-h-0 grid-cols-inbox overflow-hidden narrow:grid-cols-1 narrow:overflow-visible">
      <div className={`${COLUMN} border-r border-ui-line`}>{list}</div>
      <div className={COLUMN}>{detail}</div>
    </div>
  );
}
