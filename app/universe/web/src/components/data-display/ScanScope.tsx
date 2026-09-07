import type { IScanScope } from '@api/types';

import { Banner, Pill } from '@components/ui';

/**
 * **분모** — 「몇 건」 앞에 반드시 오는 것.
 *
 * ⛔⛔ 이 화면이 절대 하면 안 되는 첫 번째: **「0건」을 「위반이 없다」로 그리는 것.**
 * 훑은 파일이 0개면 그건 「위반이 없다」가 아니라 **「안 봤다」**다.
 *
 * ⚠️ 이 저장소의 실측(R162): 콘솔 은하의 좌표가 소스 없는 곳을 가리켜 훑개가 **파일 0개**를
 * 보았고, 모든 법칙 0건이 「실측으로 갱신했다」며 기준선으로 심겼다 — 그 은하는 **영원히
 * 초록**이 됐다. 좌표를 고치고 다시 재니 같은 은하에서 12건이 나왔다. 0건이 아니었다.
 * ⇒ 그래서 이 조각은 건수를 **혼자 그리지 않는다.** 「파일 N개를 훑어 M건」이 한 문장이다.
 *
 * ⛔ 두 번째 분모: **코드인데 규칙이 못 읽은 파일.** 수치가 0이 아니면 아무도 의심하지
 * 않는다 — 조용한 부분 실명은 0건보다 위험하다(§8). 그래서 함께 적는다.
 */

/** 비율을 백분율로 — 이름을 붙여 둔다(매직 넘버가 아니라 단위 환산이다). */
const PERCENT = 100;

const CARD = 'rounded-card border border-ui-line bg-ui-surface p-4';
const ROW = 'mt-2.5 flex flex-wrap items-baseline gap-2';
const META = 'text-meta text-ui-ink-faint';
const CODE = 'rounded-chip bg-ui-surface-sunken px-1.25 py-px font-mono text-xs';

export interface IScanScopeProps {
  scope: IScanScope;
  /**
   * 이번에 잰 위반 총합.
   * ⛔ 이 수를 **분모와 떼어 놓지 마라** — 떼는 순간 「24건」이 되고, 그건 절반만 참인 말이다.
   */
  found: number;
}

export function ScanScope({ scope, found }: IScanScopeProps) {
  const blindFiles = scope.blind.reduce((sum, ext) => sum + ext.files, 0);
  const unjudged = scope.blind.filter((ext) => ext.judged === null);

  /* ⛔ 분모가 0이면 **여기서 끝낸다.** 아래 「N건」을 그리면 그것이 잰 수로 보인다. */
  if (scope.files === 0) {
    return (
      <Banner tone="unknown">
        <strong>⚪ 훑은 파일이 0개다 — 「위반이 없다」가 아니라 「안 봤다」이다.</strong>
        <div className="mt-1.5">
          아래 법칙들의 건수는 <strong>전부 못 잰 것</strong>이다. 초록으로 읽지 마라 —
          0건을 기준선으로 심으면 그 은하는 <strong>영원히 초록</strong>이 된다(코드가 나빠져도 0과 0은 같다).
        </div>
        <div className="mt-1.5">
          제일 먼저 볼 자리: 좌표의 <code>appDir</code> 이 소스가 있는 곳을 가리키는가.
          지금 <code>{scope.appDir}</code> 이고, 훑개가 본 자리는 <code>{scope.target}</code> 다.
          그 아래에 <code>src/</code> 가 있어야 한다.
        </div>
      </Banner>
    );
  }

  return (
    <div className={CARD}>
      {/* ⛔ 분자와 분모는 **한 문장**이다. 갈라 놓으면 한쪽만 읽힌다. */}
      <p className="text-label">
        <strong>
          파일 {scope.files}개를 훑어 {found}건
        </strong>
        <span className={META}>
          {' '}
          — {scope.target}
          {scope.fingerprint !== null && ` · 지문 ${scope.fingerprint}`}
        </span>
      </p>

      {found === 0 && (
        <p className={`mt-1.5 ${META}`}>
          건수가 0인데 <strong>훑은 파일은 {scope.files}개</strong>다 — 이건 「안 봤다」가 아니라
          <strong> 잰 0건</strong>이다. 다만 아래 「한 번도 발동 안 한 규칙」을 함께 봐야
          그 0이 무슨 뜻인지 안다.
        </p>
      )}

      {blindFiles === 0 && (
        <p className={`mt-1.5 ${META}`}>
          규칙이 못 읽은 코드 파일은 없다 — 훑은 {scope.files}개가 코드 전부다.
        </p>
      )}

      {blindFiles > 0 && (
        <div className="mt-2.5 rounded-control border border-tone-warn-line bg-tone-warn-face px-3.5 py-3 text-tone-warn-ink">
          <strong>
            ⚠️ 코드인데 규칙이 못 읽은 파일 {blindFiles}개 (
            {Math.round((blindFiles / (scope.files + blindFiles)) * PERCENT)}%)
          </strong>
          <div className="mt-1.5 text-meta">
            수치가 0이 아니면 아무도 의심하지 않는다 — <strong>조용한 부분 실명은 0건보다 위험하다.</strong>
          </div>
          <div className={ROW}>
            {scope.blind.map((ext) => (
              <Pill key={ext.ext} tone={ext.judged === null ? 'unknown' : 'auto'}>
                {ext.ext} {ext.files}개{ext.judged === null && ' — 판단 없음'}
              </Pill>
            ))}
          </div>
          {unjudged.length > 0 && (
            <div className="mt-2.5 text-meta">
              이 은하는 {unjudged.map((ext) => ext.ext).join(' · ')} 를{' '}
              <strong>아직 판단하지 않았다.</strong> 좌표의{' '}
              <code className={CODE}>blindJudged</code> 에 「왜 안 재도 되는가, 아니면 언제 재게 할
              것인가」를 적기 전에는 <strong>초록불을 줄 수 없다.</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
