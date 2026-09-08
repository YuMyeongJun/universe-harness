import type { ReactNode } from 'react';

import { CountBadge } from '@components/data-display/CountBadge';

/**
 * ③ **가운데 리스트** — 탭 · 검색 · 줄 목록.
 *
 * ⛔⛔ **탭의 수도 `0` 과 `⚪` 를 가른다.** 「⚪ 못 쟀다 **0**」과 「⚪ 못 쟀다 **⚪**」는
 * 다른 말이다: 앞은 「접힌 케이스가 없다(쟀다)」이고 뒤는 「접혔는지조차 모른다」이다.
 * 탭 이름에 ⚪ 가 들어간다고 그 **수**까지 ⚪ 인 것이 아니다 — 둘을 헷갈리면 안 된다.
 *
 * ⛔ **「전부 고르기」·「전부 통과 처리」 갈래가 없다.** 목록에 일괄 손잡이를 두는 순간
 * 그것이 제일 빠른 길이 되고, 판정은 한 건씩 붙여야 판정이다.
 *
 * ⚠️ 검색은 **거르기만 한다 — 아무것도 감추지 않는다.** 거른 결과가 0건이면
 * 「없다」가 아니라 **「이 글자로는 안 걸렸다」**고 적고 **분모를 함께** 보여 준다.
 * 그러지 않으면 검색어 하나가 「fail 0건」처럼 보인다.
 */

const HEAD = 'sticky top-0 z-10 border-b border-ui-line bg-ui-surface-sunken px-3 pb-2.5 pt-3';
const TABS = 'flex flex-wrap gap-1.5';
const TAB = 'flex items-center gap-1.5 rounded-control border px-2.5 py-1.25 text-meta';
const TAB_OFF = 'border-solid border-ui-line bg-transparent text-ui-ink-dim hover:text-ui-ink';
const TAB_ON = 'border-solid border-ui-accent bg-ui-surface-raised font-semibold text-ui-ink';
const SEARCH_ROW = 'mt-2.5';
const EMPTY = 'p-6 text-center text-meta text-ui-ink-dim';

export interface IListTab {
  id: string;
  label: string;
  /** ⛔ `null` 은 「0」이 아니라 「못 쟀다」다 — `CountBadge` 머리말 참고. */
  count: number | null;
  why?: string | null;
}

export interface IListPaneProps {
  tabs: IListTab[];
  activeTab: string;
  onTab: (id: string) => void;
  query: string;
  onQuery: (next: string) => void;
  /** ⛔ 입력에 **이름을 반드시 준다** — placeholder 는 이름이 아니다(입력하면 사라진다). */
  searchLabel: string;
  /** 0건일 때 **그 0이 무슨 뜻인지.** ⛔ 빈칸으로 두면 초록으로 읽힌다. */
  whenEmpty: ReactNode;
  children: ReactNode;
  /** 지금 화면에 줄이 하나라도 있는가. */
  hasRows: boolean;
}

export function ListPane({
  tabs,
  activeTab,
  onTab,
  query,
  onQuery,
  searchLabel,
  whenEmpty,
  children,
  hasRows,
}: IListPaneProps) {
  return (
    <div>
      <div className={HEAD}>
        {/**
         * ⚠️ **ARIA 의 `tab` 역할을 쓰지 않았다.** 진짜 탭은 좌우 화살표로 옮겨 다니는 것까지가
         * 계약인데, 역할만 붙이고 키보드를 안 만들면 **보조기기에 「탭이다」라고 약속해 놓고
         * 그 약속을 안 지키는 것**이 된다 — 아무 역할도 없는 것보다 나쁘다.
         * ⇒ 지금 상태를 정직하게 말하는 `aria-pressed` 누름 버튼으로 둔다.
         *    화살표 이동을 만드는 날 역할을 함께 올린다.
         */}
        <div className={TABS}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              className={`${TAB} ${activeTab === tab.id ? TAB_ON : TAB_OFF}`}
              onClick={() => onTab(tab.id)}
            >
              <span>{tab.label}</span>
              <CountBadge count={tab.count} why={tab.why} />
            </button>
          ))}
        </div>

        <div className={SEARCH_ROW}>
          {/* ⛔ `aria-label` 이 없으면 이 입력은 이름 없는 칸이다(`a11y/input-label`). */}
          <input
            aria-label={searchLabel}
            className="text-meta"
            placeholder={searchLabel}
            type="search"
            value={query}
            onChange={(typed) => onQuery(typed.target.value)}
          />
        </div>
      </div>

      {hasRows ? children : <div className={EMPTY}>{whenEmpty}</div>}
    </div>
  );
}
