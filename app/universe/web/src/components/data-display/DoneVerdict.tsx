import type { IRunPayload } from '@api/types';
import { judgeDone } from '@lib/run-judge';

import { Banner } from '@components/ui';

/**
 * 화면 맨 위 — **「판단하지 않은 것 N건」.**
 *
 * ⛔⛔ 이 화면의 종료 조건은 **「fail 0」이 아니다.** fail 0 을 목표로 두면 가장 싼 해법이
 * **단언을 무르게 하는 것**이 된다 — 셀렉터를 넓히거나 spec 을 빼면 초록이 된다.
 * 그래서 맨 위에 세는 것은 fail 이 아니라 **판단하지 않은 fail** 이고,
 * 그 수가 0이 아니면 이 화면은 어떤 자리에서도 「끝났다」고 말하지 않는다.
 *
 * ⛔ **개수를 화면이 다시 세지 않는다** — 도구(`tc-run`)가 센 것을 옮긴다. 대신 **대조**는 한다:
 * 도구가 「끝났다」는데 화면에 보이는 fail 에 판단이 없으면 그 어긋남을 맨 위에 적는다.
 */
const LIST_ROW = 'mt-1.5 border-t border-ui-line pt-1.5 first:mt-0 first:border-t-0 first:pt-0';
const CASE_ID = 'font-mono font-semibold';

export interface IDoneVerdictProps {
  payload: IRunPayload;
  /** 화면이 본 어긋남. ⛔ 비어 있지 않으면 어떤 경우에도 초록을 그리지 않는다. */
  conflicts: string[];
}

export function DoneVerdict({ payload, conflicts }: IDoneVerdictProps) {
  const banner = judgeDone(payload, conflicts);
  const waiting = payload.done.unjudged;

  return (
    <Banner tone={banner.tone}>
      <strong>
        {banner.mark} {banner.headline}
      </strong>

      {conflicts.length > 0 && (
        <div className="mt-1.5">
          {conflicts.map((line) => (
            <div key={line} className={LIST_ROW}>
              ⛔ {line}
            </div>
          ))}
        </div>
      )}

      {waiting.length > 0 && (
        <div className="mt-3.5">
          <strong>판단이 필요한 것 — 이름을 부른다</strong>
          {waiting.map((one) => (
            <div key={one.id} className={LIST_ROW}>
              <span className={CASE_ID}>{one.id}</span> — {one.reason}
            </div>
          ))}
        </div>
      )}

      {payload.done.unattributed.length > 0 && (
        <div className="mt-3.5">
          ⚠️ <strong>탓을 못 가른 fail</strong>: {payload.done.unattributed.join(' · ')} — 별 탓인지
          환경 탓인지 모르면 <strong>자동 수정이 못 고치는 것을 고치려 든다.</strong> 사람이 먼저 갈라야 한다.
        </div>
      )}

      <div className="mt-3.5">
        도구가 한 말 그대로: <span className="whitespace-pre-wrap">{banner.toolSaid}</span>
      </div>

      {payload.notMeasured !== undefined && (
        <div className="mt-1.5">
          ⚪ 이 도구가 <strong>안 재는 것</strong>: {payload.notMeasured}
        </div>
      )}
    </Banner>
  );
}
