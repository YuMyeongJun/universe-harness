/**
 * 도구가 **보여만 준** 후보 묶음 하나(태양계 후보 · 워크스페이스 후보).
 *
 * ⛔⛔ **여기서 고르지 않는다.** 폴더 이름은 사람이 정하는 것이라 도구가 열거하면 낡는다
 * (관측 법칙 §9). 화면이 하나를 기본값으로 집어 주면 사람은 그것을 「맞는 것」으로 읽는다.
 *
 * ⛔ `null` 과 `[]` 를 **같은 화면으로 접지 않는다.**
 *   · `null` = 도구의 문장에서 **못 뽑았다**(⚪ — 안 본 것이다)
 *   · `[]`   = 도구가 **없다고 말했다**(잰 것이다)
 * 접으면 「안 봤다」가 「없다」로 보이고, 그것이 이 저장소가 여러 번 데인 자리다.
 */
const LIST = 'mt-1.5 flex flex-wrap gap-1.5';
const CHIP = 'rounded-pill border border-ui-line bg-ui-surface-raised px-2.75 py-1.25 text-meta';

export interface ICandidateNoteProps {
  label: string;
  candidates: string[] | null;
  /** 도구가 쓴 문장 원문. 목록이 미덥지 않을 때 사람이 읽는 것이다. */
  raw?: string | null;
}

export function CandidateNote({ label, candidates, raw = null }: ICandidateNoteProps) {
  return (
    <div className="mb-3.5">
      <span className="block text-label font-semibold">
        {label} <span className="font-normal text-ui-ink-faint">— ⛔ 고르지 않았다</span>
      </span>

      {candidates === null && (
        <span className="mt-1 block text-xs text-ui-warn">
          ⚪ 도구의 문장에서 후보를 못 뽑았다 — <strong>후보가 없다는 뜻이 아니다.</strong>
          아래 원문을 직접 읽어라.
        </span>
      )}

      {candidates !== null && candidates.length === 0 && (
        <span className="mt-1 block text-xs text-ui-ink-faint">
          도구가 <strong>없다고 말했다</strong>(못 읽은 것이 아니다).
        </span>
      )}

      {candidates !== null && candidates.length > 0 && (
        <div className={LIST}>
          {candidates.map((candidate) => (
            <span key={candidate} className={CHIP}>
              {candidate}
            </span>
          ))}
        </div>
      )}

      {raw !== null && raw !== '' && (
        <span className="mt-1.5 block whitespace-pre-wrap text-xs text-ui-ink-faint">{raw}</span>
      )}
    </div>
  );
}
