/**
 * **수 한 칸** — ⛔⛔ 이 조각 하나가 이 화면이 존재하는 이유다.
 *
 * ── 왜 `0` 을 그냥 찍으면 안 되는가 ──────────────────────
 * 목록 옆에 수를 다는 화면은 보통 **없으면 `0`** 을 찍는다. 이 도메인에서 그건 **거짓말**이다.
 * 이 저장소의 제1 규율이 「**못 쟀다**와 **위반 없음**은 다른 사실」이기 때문이다:
 *
 *   · `0`  — **쟀다. 그리고 없었다.** 훑개가 파일을 읽었고 위반이 안 나왔다.
 *   · `⚪` — **안 봤다.** 은하가 이 기계에 없거나 · 좌표가 빈 곳을 가리키거나 ·
 *            도구가 안 돌았다. 여기 몇 건인지는 **아무도 모른다.**
 *
 * ⚠️ 이 저장소의 실측(R162): 콘솔 은하의 `appDir` 이 소스 없는 곳을 가리켜 훑개가
 * **파일 0개**를 보았고, 모든 법칙이 「0건」으로 기준선에 심겼다 — 그 은하는 **영원히 초록**이었다.
 * 고치고 나니 같은 은하에서 `a11y/input-label` **12건**이 나왔다. **0건이 아니었다.**
 * ⇒ 그때 화면이 `0` 대신 `⚪` 를 찍었다면 아무도 안 속았다. 이 조각이 그 자리다.
 *
 * ── 두 상태를 **세 채널**로 가른다 ──────────────────────
 * 색 하나에 안 맡긴다(`ui.tsx` 의 신호와 같은 기준):
 *   ① 글자 — 숫자냐 `⚪` 냐. **읽으면 바로 다르다.**
 *   ② 모양 — 잰 것은 실선, 못 잰 것은 **점선.** 이 콘솔에서 점선은 한 가지 뜻이다:
 *            「여기 있어야 할 것이 없다」(`Empty`·⚪ 배지와 같은 어휘).
 *   ③ 색   — 잰 것은 중립 면, 못 잰 것은 ⚪ 전용 면(`tone-unknown-*`).
 *
 * ⛔ **`0` 을 초록으로 칠하지 않는다.** 「위반 0」은 좋은 소식일 수 있지만
 *    「은하 0개」·「케이스 0건」은 아니다. 이 조각은 **그 수가 무엇인지 모른다** —
 *    모르는 것에 좋다/나쁘다를 칠하면 그게 거짓말이다. 신호가 필요하면 `Pill` 을 써라.
 */

const SHAPE = 'inline-flex min-w-6 items-center justify-center rounded-pill border px-1.75 py-px text-xs tabular-nums';

/** 쟀다 — 수가 사실이다. */
const MEASURED = 'border-solid border-ui-line bg-ui-surface-raised font-semibold text-ui-ink-dim';

/** ⚪ 못 쟀다 — 수가 **없다.** 0 이 아니다. */
const UNMEASURED = 'border-dashed border-tone-unknown-line bg-tone-unknown-face text-tone-unknown-ink';

export interface ICountBadgeProps {
  /**
   * ⛔ **`null` 은 「0」이 아니라 「모른다」다.** 호출부에서 `?? 0` 으로 접지 마라 —
   * 그 한 글자가 이 조각을 통째로 무의미하게 만든다.
   */
  count: number | null;
  /**
   * 왜 못 쟀는지. `count === null` 일 때만 쓰인다.
   * ⛔ 없으면 「모른다」고 적는다 — 빈 툴팁은 「별일 없다」로 읽힌다.
   */
  why?: string | null;
}

export function CountBadge({ count, why }: ICountBadgeProps) {
  if (count === null) {
    /**
     * ⚠️ `title` 은 **보조 수단**이다 — 마우스를 올려야 보이고 키보드에는 안 온다.
     * 그래서 뜻은 눈에 보이는 `⚪` 와 점선이 지고, `title` 은 이유를 덧붙일 뿐이다.
     * ⚠️ 스크린리더에 `⚪` 는 「흰 원」으로 읽힌다 — 그건 뜻이 아니다. 글자를 숨겨 붙인다.
     */
    return (
      <span className={`${SHAPE} ${UNMEASURED}`} title={why ?? '못 쟀다 — 이유가 안 왔다.'}>
        <span aria-hidden="true">⚪</span>
        <span className="sr-only">못 쟀다 (0 이 아니다)</span>
      </span>
    );
  }

  return <span className={`${SHAPE} ${MEASURED}`}>{count}</span>;
}
