import type { IRunPayload } from '@api/types';

import { Pill, Tile } from '@components/ui';

/**
 * **분모를 먼저 보여 준다.**
 *
 * ⛔⛔ 「fail 3건」이라고만 적지 않는다 — **「42건 중 fail 3건」**이다. 분모가 없으면
 * 「0건」이 「위반이 없다」인지 「안 봤다」인지 알 수 없고, 이 저장소는 그것으로 여러 번 데였다.
 *
 * ⛔ 그리고 **검증 분모는 전체 건수가 아니다.** 구현에서 뽑은 TC(자기 채점)와 ⚪ 못 잰 것은
 * 빠진다. 뺀 것을 **합쳐 두지 않고 갈라** 적는 이유도 같다 — 합치면 「0건」의 뜻을 잃는다.
 */
const CARD = 'rounded-card border border-ui-line bg-ui-surface p-4';
const SECTION = 'mb-3.5 mt-0 text-label font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
const TILES = 'flex flex-wrap gap-2.5';
const NOTE = 'mt-3.5 text-meta text-ui-ink-dim';
const IDS = 'font-mono';

export interface IRunTallyProps {
  payload: IRunPayload;
}

export function RunTally({ payload }: IRunTallyProps) {
  const { stats, verification } = payload;
  const excluded = verification.excluded;

  return (
    <div className={CARD}>
      <h2 className={SECTION}>전체 {stats.total}건 중 — ⛔ 건수는 분모와 함께만 읽는다</h2>
      <div className={TILES}>
        <Tile v={stats.total} l="전체" />
        <Tile v={`✅ ${stats.expected}`} l="통과" />
        <Tile v={`❌ ${stats.unexpected}`} l="실패" />
        <Tile v={`⚪ ${stats.skipped}`} l="못 쟀다" />
        <Tile v={stats.flaky} l="갈렸다(flaky)" />
        <Tile v={verification.denominator} l="검증 분모" />
        <Tile v={payload.done.unjudged.length} l="판단 안 한 fail" />
      </div>

      <p className={NOTE}>
        검증 분모 <strong>{verification.denominator}건</strong> — 전체 {stats.total}건에서 뺀 것:
        구현에서 나온 TC {excluded.derivedFromCode}건 · 출처 미상 {excluded.unknownOrigin}건 · ⚪ 못 잰 것{' '}
        {excluded.unmeasured}건.
        {verification.denominator === 0 && (
          <> ⛔ <strong>분모가 0이다 — 이 주행은 아무것도 검증하지 않았다.</strong> 초록으로 읽지 마라.</>
        )}
      </p>

      {verification.selfScoringIds.length > 0 && (
        <p className={NOTE}>
          <Pill tone="bad">⛔ 자기 채점</Pill>{' '}
          <span className={IDS}>{verification.selfScoringIds.join(' · ')}</span> — 구현에서 뽑은 TC 는{' '}
          <strong>정의상 통과</strong>한다. 통과했다고 무엇이 검증된 것이 아니다.{' '}
          <strong>이름을 불러야 지워진다.</strong>
        </p>
      )}
    </div>
  );
}
