import { CountBadge } from '@components/data-display/CountBadge';

/**
 * ② **사이드바** — 그룹 머리 + 항목, 그리고 항목마다 **수.**
 *
 * ⛔⛔ **수가 없는 자리에 `0` 을 찍지 않는다.** 참고로 삼은 화면은 모든 줄에 `0` 을
 * 찍는데, 이 도메인에서 그건 거짓말이다 — 자세한 이유와 실측은 `CountBadge` 머리말에 있다.
 * 이 조각은 `count: number | null` 을 **그대로 나르기만** 한다. ⛔ 여기서 `?? 0` 하지 마라.
 *
 * ⛔ **그룹을 접는 손잡이를 안 만들었다.** 접히는 그룹은 접힌 채로 잊히고, 이 사이드바가
 * 숨기면 안 되는 것이 바로 「어느 법칙이 몇 건인가」다. 목록이 길면 스크롤한다.
 *
 * ⚠️ 그룹 머리는 **누를 수 없다** — `<h2>` 다. 눌리게 생긴 것이 안 눌리면 사람은
 * 두 번 시도하고 화면을 못 믿게 된다.
 */

/* ⚠️ 위 여백이 0 인 것은 그룹 머리의 `mt-4.5` 가 그것을 지기 때문이다 —
   같은 속성을 두 자리에서 주면 첫 그룹만 두 배로 벌어진다. */
const NAV = 'pb-3 pt-0';
const GROUP = 'mb-1.5 mt-4.5 px-3 text-xs font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
/**
 * ⚠️ **왼쪽 여백과 테두리를 껍질(`ITEM_OFF`/`ITEM_ON`) 쪽에 뒀다.** 여기 `px-3` 를 두고
 * 껍질에서 `pl-2.5` 로 덮으면 tailwind 는 **클래스 순서가 아니라 CSS 출력 순서**로 이겨서,
 * 어느 쪽이 이길지 호출부만 봐서는 알 수 없다. 두 껍질이 **같은 속성을 똑같이** 적어
 * 고른 줄과 안 고른 줄의 글자가 좌우로 안 흔들리게 한다.
 */
const ITEM = 'flex w-full items-center gap-2 py-1.75 pr-3 text-left text-label';
const ITEM_OFF = 'border-l-2 border-solid border-transparent bg-transparent pl-2.5 text-ui-ink-dim hover:bg-ui-surface hover:text-ui-ink';
/**
 * ⛔ 고른 줄을 **색만으로** 말하지 않는다 — 왼쪽에 기둥이 서고 글자가 굵어진다.
 * (`ui.tsx` 의 신호가 쓰는 것과 같은 수법: 색 하나가 죽어도 채널이 남는다.)
 */
const ITEM_ON = 'border-l-2 border-solid border-ui-accent bg-ui-surface-raised pl-2.5 font-semibold text-ui-ink';
const NAME = 'min-w-0 flex-1 truncate';
/** ⚪ 그룹 통째로 못 쟀을 때 — 항목이 아니라 **그룹이** 못 잰 것이다. */
const GROUP_UNMEASURED = 'mx-3 mb-1.5 rounded-control border border-dashed border-tone-unknown-line bg-tone-unknown-face px-2.5 py-1.75 text-xs text-tone-unknown-ink';

export interface ISidebarItem {
  /** 고른 것을 알아보는 값. ⛔ 화면에 보이는 이름과 **다를 수 있다** — 이름은 안 유일하다. */
  id: string;
  label: string;
  /**
   * ⛔⛔ **세 갈래다. 둘로 접지 마라.**
   *   · `숫자`      — **쟀다.** 그 수가 사실이다.
   *   · `null`      — **못 쟀다**(⚪). 몇인지 아무도 모른다. ⛔ 「0」이 아니다.
   *   · `undefined` — **셀 것이 없다.** 이 항목은 애초에 수를 갖는 것이 아니다
   *                   (예: 실측의 「단계」 — 단계는 측정이 아니다). 배지를 아예 안 그린다.
   *
   * ⚠️ 마지막 갈래를 `null` 로 뭉치고 싶어진다 — **뭉치지 마라.** ⚪ 는 이 콘솔에서
   * 「재려고 했는데 못 쟀다」는 **무거운 말**이다. 셀 것이 없는 자리에까지 ⚪ 를 뿌리면
   * 그 표가 흔해지고, 흔해지면 진짜 ⚪ 를 아무도 안 본다. 표는 아껴야 표다.
   */
  count?: number | null;
  /** 못 쟀으면 왜. `count === null` 일 때만 쓰인다. */
  why?: string | null;
}

export interface ISidebarGroup {
  title: string;
  items: ISidebarItem[];
  /**
   * ⚪ **그룹 전체를 못 쟀다.** 항목마다 ⚪ 를 찍는 것과 **다른 말**이다 —
   * 이건 「이 그룹에 뭐가 있는지조차 모른다」이다. ⛔ 빈 그룹으로 그리지 않는다.
   */
  unmeasured?: string | null;
}

export interface ISidebarNavProps {
  label: string;
  groups: ISidebarGroup[];
  /** 지금 고른 항목의 `id`. 아무것도 안 골랐으면 `null`. */
  selected: string | null;
  onSelect: (id: string) => void;
}

export function SidebarNav({ label, groups, selected, onSelect }: ISidebarNavProps) {
  return (
    <nav aria-label={label} className={NAV}>
      {groups.map((group) => (
        <div key={group.title}>
          <h2 className={GROUP}>{group.title}</h2>

          {/* ⛔ 못 잰 그룹을 **빈 목록으로 그리지 않는다** — 빈 목록은 「아무것도 없다」로 읽힌다. */}
          {group.unmeasured !== undefined && group.unmeasured !== null && (
            <p className={GROUP_UNMEASURED}>⚪ 못 쟀다 — {group.unmeasured}</p>
          )}

          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={selected === item.id ? 'true' : undefined}
              className={`${ITEM} ${selected === item.id ? ITEM_ON : ITEM_OFF}`}
              onClick={() => onSelect(item.id)}
            >
              <span className={NAME}>{item.label}</span>
              {/* ⛔ `undefined` 면 배지 자체를 안 그린다 — ⚪ 로 채우지 않는다(위 주석). */}
              {item.count !== undefined && <CountBadge count={item.count} why={item.why} />}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
