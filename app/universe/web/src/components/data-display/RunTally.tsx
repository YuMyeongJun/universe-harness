import type { IRunPayload } from '@api/types';

import { CARD, Pill, SECTION, Tile } from '@components/ui';

/**
 * **분모를 먼저 보여 준다.**
 *
 * ⛔⛔ 「fail 3건」이라고만 적지 않는다 — **「42건 중 fail 3건」**이다. 분모가 없으면
 * 「0건」이 「위반이 없다」인지 「안 봤다」인지 알 수 없고, 이 저장소는 그것으로 여러 번 데였다.
 *
 * ⛔ 그리고 **검증 분모는 전체 건수가 아니다.** 구현에서 뽑은 TC(자기 채점)와 ⚪ 못 잰 것은
 * 빠진다. 뺀 것을 **합쳐 두지 않고 갈라** 적는 이유도 같다 — 합치면 「0건」의 뜻을 잃는다.
 */
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
        {/* ⛔ **판정이 아닌 수에는 색을 안 칠한다.** 「전체 42건」이 좋은 소식인지
            나쁜 소식인지 화면은 모른다 — 모르는 것에 색을 칠하면 그게 거짓말이다. */}
        <Tile reading={stats.total} label="전체" />
        <Tile reading={`✅ ${stats.expected}`} label="통과" tone="ok" />
        <Tile reading={`❌ ${stats.unexpected}`} label="실패" tone="bad" />
        {/* ⛔⛔ 이 칸은 초록도 빨강도 아니다 — **점선 테두리**로 나머지 둘과 갈린다. */}
        <Tile reading={`⚪ ${stats.skipped}`} label="못 쟀다" tone="unknown" />
        <Tile reading={stats.flaky} label="갈렸다(flaky)" />
        <Tile reading={verification.denominator} label="검증 분모" />
        {/* 이 루프의 종료 조건이다 — 0 이 아니면 아직 안 끝났다. */}
        <Tile
          reading={payload.done.unjudged.length}
          label="판단 안 한 fail"
          tone={payload.done.unjudged.length === 0 ? undefined : 'bad'}
        />
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
