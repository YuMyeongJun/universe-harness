import type { ILawObservation, IScanScope } from '@api/types';

import { judgeLaw, missingSamples } from '@lib/verdict';

import { RuleRoster } from '@components/data-display/RuleRoster';
import { ViolationRow } from '@components/data-display/ViolationRow';
import { Banner } from '@components/ui';

/**
 * 법칙 하나의 실측 한 장 — **판정 · 규칙 명부 · 위반 목록**.
 *
 * ⛔ 판정을 여기서 내리지 않는다. `@lib/verdict` 한 자리가 색·표·문구를 함께 낸다 —
 * 판단이 두 곳에 있으면 언젠가 색만 고쳐지고 문구는 안 고쳐진다.
 *
 * ⛔ **못 잰 것(⚪)을 초록으로 그리지 않는다.** 훑은 파일이 0개거나 기준선이 없으면
 * 건수가 0이어도 초록이 아니다 — 색(`unknown`)과 문구를 함께 가른다.
 */
const CARD = 'mt-3.5 rounded-card border border-ui-line bg-ui-surface p-4';
const SECTION = 'mb-2.5 mt-4.5 text-xs font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
const SECTION_FIRST = 'mb-2.5 mt-0 text-xs font-semibold uppercase tracking-eyebrow text-ui-ink-faint';

export interface ILawReportProps {
  law: ILawObservation;
  /** 분모. ⛔ 법칙 혼자 판정할 수 없다 — 훑은 파일이 0개면 그 건수는 잰 수가 아니다. */
  scope: IScanScope;
}

export function LawReport({ law, scope }: ILawReportProps) {
  const verdict = judgeLaw(law, scope);
  const noSamples = missingSamples(law, scope);

  return (
    <div className={CARD}>
      <Banner tone={verdict.tone}>
        <strong>
          {verdict.mark} {law.title} — {law.total}건
        </strong>
        <div className="mt-1.5">{verdict.why}</div>
      </Banner>

      <h3 className={SECTION_FIRST}>이 법칙이 켠 규칙 — 0건도 함께 적는다</h3>
      <RuleRoster rules={law.rules} scope={scope} />

      <h3 className={SECTION}>위반한 자리와 처방</h3>

      {noSamples !== null && (
        <Banner tone="unknown">
          <strong>⚪ {noSamples}</strong>
          <div className="mt-1.5">
            건수가 있는데 자리가 없는 것은 <strong>「위반이 없다」가 아니다.</strong>{' '}
            이 화면은 지금 무엇을 고쳐야 하는지 <strong>모른다.</strong>
          </div>
        </Banner>
      )}

      {/* ⛔ 빈 자리로 두지 않는다 — 아무것도 없는 목록은 「고칠 게 없다」로 읽힌다. */}
      {scope.files === 0 && (
        <p className="text-meta text-ui-ink-dim">
          ⚪ 안 봤다 — 자리도 처방도 없다. 이건 「고칠 것이 없다」가 아니라 아직 아무것도 안 잰 것이다.
        </p>
      )}

      {law.total === 0 && scope.files > 0 && (
        <p className="text-meta text-ui-ink-faint">
          잰 0건이다 — 파일 {scope.files}개를 훑어 이 법칙에 걸린 자리가 없었다.
          다만 <strong>위 규칙 명부에 「뜻을 모른다」가 있으면</strong> 그만큼은 아직 못 잰 것이다.
        </p>
      )}

      {law.samples.map((sample) => (
        <ViolationRow key={`${sample.rule}|${sample.where}`} sample={sample} />
      ))}
    </div>
  );
}
