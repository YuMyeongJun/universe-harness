import type { IRunCase } from '@api/types';
import { judgeAttribution, judgeCaseStatus, judgeOrigin, judgeVerdictKind } from '@lib/run-judge';

import { Pill } from '@components/ui';

/**
 * 케이스 한 건 — **자리 · 상태 · 탓 · 판단이 한 몸이다.**
 *
 * ⛔⛔ 이 줄이 절대 하지 않는 것:
 *  1. **판단 없는 fail 을 빈칸으로 두지 않는다.** 빈칸은 「판단했는데 할 말이 없었다」로 읽힌다.
 *     ⇒ 「⛔ 아직 판단하지 않았다」를 **글자로 적고**, 도구가 준 이유를 그대로 붙인다.
 *  2. **출처를 감추지 않는다.** 구현에서 뽑은 TC 는 통과해도 아무것도 검증하지 않는다 —
 *     그 줄에 ⛔ 배지를 달아 **눈에 띄게 가른다.**
 *  3. **전제가 안 선 주행에서 ❌ 를 그리지 않는다.** 전부 ⚪ 다(`judgeCaseStatus`).
 *  4. ⛔ **「이번만 통과 처리」 같은 갈래를 두지 않는다.** 넘길 수 있는 관문은 넘겨진다.
 */
const ROW = 'border-b border-ui-line py-3 last:border-b-0';
const HEAD = 'flex flex-wrap items-baseline gap-2';
const CASE_ID = 'font-mono text-label font-semibold';
const WHY = 'mt-1 block text-meta text-ui-ink-dim';
const EVIDENCE = 'mt-1.5 block font-mono text-xs text-ui-ink-faint';
const VERDICT_BOX = 'mt-1.5 rounded-control border border-ui-line bg-ui-surface-sunken p-2.5 text-meta';
const NO_VERDICT = 'mt-1.5 rounded-control border border-tone-bad-line bg-tone-bad-face p-2.5 text-meta text-tone-bad-ink';

export interface IRunCaseRowProps {
  runCase: IRunCase;
  /** ⛔ 전제가 안 섰으면 상태를 ⚪ 로 접어 그린다 — 케이스 하나만 보고는 알 수 없는 것이다. */
  measurable: boolean;
  /** 도구가 「판단하지 않았다」고 적어 온 이유. 없으면 `null`. ⛔ 화면이 고쳐 적지 않는다. */
  unjudgedReason: string | null;
}

export function RunCaseRow({ runCase, measurable, unjudgedReason }: IRunCaseRowProps) {
  const status = judgeCaseStatus(runCase, measurable);
  const origin = judgeOrigin(runCase.origin);
  const attribution = judgeAttribution(runCase.attribution);
  const evidence = runCase.evidence;
  /** ⛔ 판단을 요구하는 것은 **잰 fail** 뿐이다 — 통과와 ⚪ 는 판단의 대상이 아니다. */
  const needsVerdict = measurable && runCase.status === 'failed';

  return (
    <div className={ROW}>
      <div className={HEAD}>
        <span className={CASE_ID}>
          {status.mark} {runCase.id}
        </span>
        <Pill tone={status.tone}>{status.label}</Pill>
        <Pill tone={origin.tone}>
          {origin.mark} {origin.label}
        </Pill>
        <Pill tone={attribution.tone}>
          {attribution.mark} {attribution.label}
        </Pill>
        {runCase.flaky === true && <Pill tone="warn">⚠️ 갈렸다 — 통과로도 실패로도 안 센다</Pill>}
        {!runCase.countsAsVerification && <Pill tone="unknown">검증 분모 밖</Pill>}
      </div>

      <span className={WHY}>{status.why}</span>
      {!runCase.countsAsVerification && <span className={WHY}>{origin.why}</span>}
      {runCase.originRef !== undefined && runCase.originRef !== null && (
        <span className={WHY}>출처: {runCase.originRef}</span>
      )}
      {runCase.attribution === 'unknown' && runCase.status === 'failed' && (
        <span className={WHY}>{attribution.why}</span>
      )}

      {evidence !== undefined && (
        <span className={EVIDENCE}>
          {evidence.url ?? '(url 이 안 왔다)'} · HTTP {evidence.httpStatus ?? '(없다)'} · 화면{' '}
          {evidence.screenshot ?? '(안 찍혔다)'}
        </span>
      )}

      {/**
       * ⛔⛔ **판단을 요구하는 자리는 fail 뿐이다.**
       * ⚠️ 처음엔 `verdict === null` 인 케이스마다 「아직 판단하지 않았다」를 찍었는데,
       * 그러면 **통과한 케이스에도** 그 문구가 붙었다(픽스처 `good` 에서 실제로 그렇게 그려졌다 —
       * `web/checks/render-fixtures.mjs` 가 잡았다). 통과는 판단할 것이 없고, ⚪ 못 잰 것은
       * 판단의 대상이 아니다 — 그 자리에 ⛔ 를 찍으면 **끝난 주행이 안 끝난 것처럼** 보인다.
       */}
      {runCase.verdict === null && needsVerdict && (
        <div className={NO_VERDICT}>
          ⛔ <strong>아직 판단하지 않았다.</strong>{' '}
          {unjudgedReason ?? '고쳤는지 · 테스트가 틀렸는지 · 받아들이는지 아무도 적지 않았다.'}
          <div className="mt-1.5">
            판단은 셋뿐이다 — <strong>고쳤다 · 테스트가 틀렸다 · 받아들인다(사유 필수)</strong>.
            ⛔ 「무시한다」는 판단이 아니다.
          </div>
        </div>
      )}

      {runCase.verdict !== null && (
        <div className={VERDICT_BOX}>
          <strong>
            {judgeVerdictKind(runCase.verdict.kind).mark} 판단: {judgeVerdictKind(runCase.verdict.kind).label}
          </strong>
          <div className="mt-1 whitespace-pre-wrap">{runCase.verdict.why}</div>
          {unjudgedReason !== null && (
            <div className="mt-1.5 text-ui-bad">
              ⛔ 그런데 도구는 이것을 <strong>판단으로 세지 않았다</strong>: {unjudgedReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
