import { useState } from 'react';

import { postVerdict } from '@api/client';
import type { CaseStatus, ICaseVerdict, IJudgedRun, VerdictKind } from '@api/types';
import { judgeVerdictKind } from '@lib/run-judge';

import { Banner } from '@components/ui';

/**
 * **사람이 판정을 붙이는 자리** — ④ 본문의 끝.
 *
 * ⛔⛔ **전에는 이 자리가 화면에 없었다.** 서버에는 `POST /api/runs/:id/verdict` 가 있고
 * 계약 도구도 판정을 읽을 줄 아는데, **화면에서 그 길로 가는 문이 하나도 없었다** —
 * `web/src/api/client.ts` 에 그 함수 자체가 없었다(실측). 그래서 화면은 「판단하지 않은
 * fail 3건」이라고 말만 하고, 사람이 그 3건을 **화면 안에서 0으로 만들 방법이 없었다.**
 * ⛔ 종료 조건이 있는데 그 조건에 닿을 길이 없는 상태였다. 이 조각이 그 문이다.
 *
 * ── ⛔ 이 자리가 절대 하지 않는 것 ──────────────────────
 *  1. **판단은 셋뿐이다** — 고쳤다 · 테스트가 틀렸다 · 받아들인다.
 *     ⛔ 「무시한다」·「이번만 통과」는 **없다.** 넘길 수 있는 관문은 넘겨진다.
 *  2. **일괄 갈래가 없다.** 한 번에 한 건이다(서버도 배열을 거절한다).
 *  3. **짧은 사유를 화면이 미리 막지 않는다.** 「사유 30자」는 **계약이 재는 것**이고,
 *     화면이 그 규칙을 베끼면 두 자리가 갈린다 — 계약이 32자로 바뀌는 날 화면만 30자로 남는다.
 *     ⇒ 짧아도 **보낸다.** 그리고 도구가 「아직 판단하지 않은 것」으로 돌려주면 화면은
 *       그 답을 그대로 그린다. ⚠️ 대신 **보내기 전에 귀띔은 한다**(막지는 않는다).
 *  4. **답을 화면이 다시 세지 않는다.** 서버가 판정을 붙여 **도구를 다시 부른** 결과를
 *     통째로 돌려주므로, 그것을 그대로 갈아 끼운다.
 */

const FORM = 'mt-4.5 rounded-card border border-ui-line bg-ui-surface p-4';
const HEAD = 'mb-2.5 text-label font-semibold';
const KINDS = 'flex flex-wrap gap-2';
const KIND = 'rounded-control border px-3 py-1.75 text-meta';
const KIND_OFF = 'border-solid border-ui-line bg-ui-surface-raised text-ui-ink-dim hover:text-ui-ink';
const KIND_ON = 'border-solid border-ui-accent bg-ui-accent font-semibold text-ui-on-solid';
const WHY_LABEL = 'mb-1.25 mt-3.5 block text-label font-semibold';
const HINT = 'mt-1 block text-xs text-ui-ink-faint';
const ACTIONS = 'mt-3.5 flex flex-wrap items-center gap-2.5';
const SEND = 'rounded-control border border-solid border-ui-accent bg-ui-accent px-3.75 py-2.25 font-semibold text-ui-on-solid';
const CLEAR = 'rounded-control border border-solid border-ui-line bg-transparent px-3 py-2.25 text-meta text-ui-ink-dim';

/** ⛔ 셋뿐이다. 늘리려면 계약(`qa/src/run`)이 먼저 알아야 한다 — 화면이 정하는 것이 아니다. */
const KIND_ORDER: VerdictKind[] = ['fixed', 'test-wrong', 'accepted'];

/**
 * ⚠️ **길이를 여기서 판정에 쓰지 않는다** — 귀띔에만 쓴다.
 * 값이 계약(`qa/src/run/contract.ts`)의 최소 길이와 **같아야 할 이유가 없다.**
 * 계약이 바뀌어도 이 귀띔은 틀린 말이 안 된다: 「짧으면 도구가 안 세어 줄 수 있다」는
 * 어느 길이에서나 참이다.
 */
const SHORT_REASON_HINT = 30;

export interface IVerdictFormProps {
  caseId: string;
  /** 지금 붙어 있는 판정. `null` 이면 아직 안 붙였다. */
  current: ICaseVerdict | null;
  /**
   * 그 케이스의 상태. ⛔⛔ **fail 이 아니면 판정을 못 붙인다** — 실측으로 데였다:
   * 이 칸이 상태를 안 봐서 **통과한 케이스에 「테스트가 틀렸다」가 붙었다**(사유 「2222」).
   * 화면은 초록 케이스 옆에 「🧪 판단」을 그렸고, 읽는 사람은 **통과한 시험이 틀렸다**로 읽는다.
   * ⚠️ 서버도 막는다(409 `not-a-fail`) — 여기만 막으면 다른 부름이 그대로 지나간다.
   *    ⛔ 그렇다고 화면을 안 막으면 사람은 **적고 눌러 본 뒤에** 거절당한다.
   */
  status: CaseStatus;
  /**
   * ⛔ `null` 이면 **이 주행에는 판정을 붙일 자리가 없다.** 그때 칸을 그려 두면
   * 사람이 적고 눌렀는데 아무 데도 안 간다 — 왜 못 붙이는지를 대신 적는다.
   */
  runId: string | null;
  /** 서버가 **다시 잰** 주행을 통째로 돌려준다. ⛔ 호출부가 다시 세지 않는다. */
  onJudged: (run: IJudgedRun) => void;
}

export function VerdictForm({ caseId, current, runId, status, onJudged }: IVerdictFormProps) {
  const [kind, setKind] = useState<VerdictKind | null>(current?.kind ?? null);
  const [why, setWhy] = useState(current?.why ?? '');
  const [busy, setBusy] = useState(false);
  /** ⛔ 실패를 삼키지 않는다 — 삼키면 「적혔다」로 보인다. */
  const [refused, setRefused] = useState<string | null>(null);

  /**
   * ⛔ fail 이 아니면 **칸을 그리지 않는다.** 그릴 수 없는 칸을 그려 두면 사람이
   * 적고 눌러 본 뒤에야 거절당한다 — 「없는 손잡이를 만들지 않는다」와 같은 규율이다.
   * ⚠️ 이미 붙어 있는 판정이 있으면 **지우는 길은 남긴다**(잘못 붙은 것을 못 지우면 사람이 갇힌다).
   */
  if (status !== 'failed' && current === null) {
    return (
      <Banner tone="unknown">
        <strong>⚪ 이 케이스에는 판정을 붙이지 않는다 — fail 이 아니다({status}).</strong>
        <div className="mt-1.5">
          판정 셋(<strong>고쳤다 · 테스트가 틀렸다 · 받아들인다</strong>)은 전부{' '}
          <strong>「이 fail 을 어떻게 할 것인가」</strong>의 답입니다.
        </div>
        <div className="mt-1.5">
          ⛔ 통과한 것에 붙이면 화면이 <strong>「통과한 시험이 틀렸다」</strong>로 읽히고,
          ⚪ 에 붙이면 <strong>안 잰 것이 판단된 것</strong>이 됩니다.
        </div>
      </Banner>
    );
  }

  if (runId === null) {
    return (
      <Banner tone="unknown">
        <strong>⚪ 이 주행에는 판정을 붙일 자리가 없다.</strong>
        <div className="mt-1.5">
          서버가 주행을 남기지 못했거나, 화면이 도구의 JSON 을 <strong>직접</strong> 그리고 있다
          (그 길에는 주소가 없다). ⛔ 이것은 <strong>「판단할 것이 없다」가 아니다</strong> —
          판정을 적을 <strong>수단</strong>이 없는 것이다.
        </div>
        <div className="mt-1.5">
          서버에 물려서(<code>서버에 물려 판정 받기</code>) 다시 열면 이 자리가 생긴다.
        </div>
      </Banner>
    );
  }

  const send = (next: ICaseVerdict | null): void => {
    setBusy(true);
    setRefused(null);
    void postVerdict(runId, caseId, next).then(
      (run) => {
        setBusy(false);
        onJudged(run);
      },
      (failed: Error) => {
        setBusy(false);
        setRefused(failed.message);
      },
    );
  };

  const tooShort = kind === 'accepted' && why.trim().length < SHORT_REASON_HINT;

  return (
    <div className={FORM}>
      <p className={HEAD}>판단을 붙인다 — {caseId}</p>

      <div className={KINDS}>
        {KIND_ORDER.map((option) => {
          const mark = judgeVerdictKind(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              className={`${KIND} ${kind === option ? KIND_ON : KIND_OFF}`}
              onClick={() => setKind(option)}
            >
              {mark.mark} {mark.label}
            </button>
          );
        })}
      </div>
      {kind !== null && <span className={HINT}>{judgeVerdictKind(kind).why}</span>}

      <label className={WHY_LABEL} htmlFor="verdict-why">
        사유 — <strong>무엇을 근거로 그렇게 판단했나</strong>
      </label>
      <textarea
        id="verdict-why"
        placeholder="예: 셀렉터가 아니라 서버가 400 을 주고 있었다. api/order.ts 의 검증 순서를 고쳤고 재현이 사라졌다."
        value={why}
        onChange={(typed) => setWhy(typed.target.value)}
      />
      {tooShort && (
        <span className={HINT}>
          ⚠️ 사유가 짧다({why.trim().length}자). <strong>막지는 않는다</strong> — 보내면 저장된다.
          다만 도구가 <strong>「아직 판단하지 않은 것」으로 셀 수 있다</strong>. 사유 없는
          「받아들인다」는 판단이 아니라 <strong>치운 것</strong>이기 때문이다.
        </span>
      )}

      {refused !== null && (
        <Banner tone="unknown">
          <strong>⚪ 못 적었다 — 서버가 한 말 그대로입니다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{refused}</div>
          <div className="mt-1.5">
            ⛔ 화면은 <strong>적힌 것처럼 그리지 않는다.</strong> 지금 이 판정은 어디에도 없다.
          </div>
        </Banner>
      )}

      <div className={ACTIONS}>
        <button
          type="button"
          className={SEND}
          disabled={busy || kind === null || why.trim() === ''}
          onClick={() => kind !== null && send({ kind, why })}
        >
          {busy ? '적는 중…' : '이 판단을 적는다'}
        </button>

        {/* ⛔ 「지운다」는 **판단 안 함으로 되돌리는 것**이지 없던 일로 하는 것이 아니다. */}
        {current !== null && (
          <button type="button" className={CLEAR} disabled={busy} onClick={() => send(null)}>
            판단을 지운다 — 장부에는 남는다
          </button>
        )}

        <span className={HINT}>
          ⛔ 「무시한다」는 없다. 판단은 셋뿐이고, 적으면 <strong>도구가 다시 재서</strong> 답한다.
        </span>
      </div>
    </div>
  );
}
