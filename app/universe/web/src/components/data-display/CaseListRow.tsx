import type { IRunCase } from '@api/types';
import { judgeCaseStatus, type CaseBucket } from '@lib/run-judge';

import { Pill } from '@components/ui';

/**
 * ③ **가운데 리스트의 한 줄** — 고르는 자리.
 *
 * ⚠️ `RunCaseRow`(④ 의 자세한 줄)와 **일부러 다른 조각**이다. 같은 것을 쓰면 리스트 한 줄이
 * 열 줄 높이가 되어 훑을 수가 없다. ⇒ 여기는 **id · 상태 · 판단 유무**만 싣는다.
 *
 * ⛔ **여기서 판정을 못 붙인다.** 리스트에서 바로 판단할 수 있게 만들면 사람은
 * **증거를 안 보고** 판단하게 된다 — 증거는 ④ 에 있다. 고르는 것과 판단하는 것을 갈라 둔다.
 *
 * ⛔ **「판단 안 함」을 빈칸으로 두지 않는다.** 빈칸은 「판단했는데 할 말이 없었다」로 읽힌다.
 */
const ROW = 'flex w-full flex-col gap-1 border-b border-solid border-ui-line py-2.5 pr-3 text-left last:border-b-0';
const ROW_OFF = 'border-l-2 border-transparent bg-transparent pl-2.5 hover:bg-ui-surface';
/** ⛔ 고른 줄을 색만으로 말하지 않는다 — 기둥이 서고 면이 뜬다. */
const ROW_ON = 'border-l-2 border-ui-accent bg-ui-surface-raised pl-2.5';
const HEAD = 'flex items-center gap-2';
const CASE_ID = 'min-w-0 flex-1 truncate font-mono text-label font-semibold';
const TAGS = 'flex flex-wrap items-center gap-1.25';

export interface ICaseListRowProps {
  runCase: IRunCase;
  /** ⛔ 전제가 안 섰으면 상태를 ⚪ 로 접어 그린다 — 케이스 하나만 보고는 알 수 없는 것이다. */
  measurable: boolean;
  /**
   * 이 케이스가 어느 무더기인가 — **`bucketOf` 한 자리가 정한 값을 그대로 받는다.**
   *
   * ⚠️ 전에는 `unjudged: boolean` 이었는데 두 가지가 틀렸다:
   *  1. **부정확했다.** 「판단 안 함」은 `done.unjudged` 에 있거나 **`verdict === null`** 이면
   *     참인데(도구가 빠뜨릴 수 있다 — `lying-tool` 픽스처가 그 자리다), boolean 하나로 받으면
   *     호출부마다 그 두 갈래를 다시 조립하게 된다. 조립이 두 곳에 있으면 언젠가 갈린다.
   *  2. **`quality/cohesion` 이 물었다**(boolean prop 3개 → 겸업). 실제로 그 셋
   *     (`measurable`·`unjudged`·`selected`)은 **데이터 둘 + 표현 하나**가 한 칸에 섞인 것이었다.
   * ⇒ 무더기 이름을 받는다. 규칙을 피하려고 객체로 싸맨 것이 **아니라**, 조립을 한 자리로 옮긴 것이다.
   */
  bucket: CaseBucket;
  selected: boolean;
  onSelect: () => void;
}

export function CaseListRow({ runCase, measurable, bucket, selected, onSelect }: ICaseListRowProps) {
  const status = judgeCaseStatus(runCase, measurable);

  return (
    <button type="button" className={`${ROW} ${selected ? ROW_ON : ROW_OFF}`} onClick={onSelect}>
      <span className={HEAD}>
        <span className={CASE_ID}>
          {status.mark} {runCase.id}
        </span>
        <Pill tone={status.tone}>{status.label}</Pill>
      </span>

      <span className={TAGS}>
        {/* ⛔ 이것이 이 줄에서 제일 중요한 한 조각이다 — 루프의 종료 조건이 이 수다. */}
        {bucket === 'unjudged' && <Pill tone="bad">⛔ 판단 안 함</Pill>}
        {!runCase.countsAsVerification && <Pill tone="unknown">검증 분모 밖</Pill>}
        {runCase.flaky === true && <Pill tone="warn">⚠️ 갈렸다</Pill>}
      </span>
    </button>
  );
}
