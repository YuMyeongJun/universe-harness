import type { IViolationSample } from '@api/types';

/**
 * 위반 한 건 — **자리 · 코드 · 처방이 한 몸이다.**
 *
 * ⛔⛔ 실측(R94): 관측소가 자리(파일:줄)와 코드는 보여 주는데 **처방이 안 왔다.**
 * `universe fix` 는 규칙마다 `fix:` 를 강제해 놨으니 **데이터는 있었고 화면만 비어 있었다.**
 * 사람은 무엇을 고쳐야 하는지 모른 채 목록만 봤고, 처방 없는 관문은 **무시하는 법부터** 가르친다(R35).
 *
 * ⚠️ **규칙마다 한 번만 찍지 않았다.** 터미널은 시끄러움을 피하려고 처방을 규칙당 한 번 찍는데,
 * 화면은 스크롤로 잘리고 접히는 자리다 — 처방이 화면 밖으로 밀린 줄은 **R94 이전과 똑같이 보인다.**
 * ⇒ 줄마다 처방을 붙인다. 같은 처방이 반복되는 것이 처방이 사라지는 것보다 낫다.
 *
 * ⛔ 처방이 `null` 로 오면 **빈칸으로 두지 않는다.** 「처방이 안 왔다」고 적는다 —
 * 빈칸은 「고칠 게 없다」로 읽히고, 그건 이 조각이 막으려는 바로 그 사고다.
 */
const ROW = 'border-b border-ui-line py-3 last:border-b-0';
const WHERE = 'block font-mono text-label font-semibold';
const RULE = 'text-xs text-ui-ink-faint';
const CODE_BLOCK = [
  'mt-1.5 max-h-code overflow-x-auto whitespace-pre-wrap',
  'rounded-control border border-ui-line bg-ui-surface-sunken p-2.5',
  'text-xs leading-code',
].join(' ');
const FIX = 'mt-1.5 block text-meta text-ui-ok';
const FIX_MISSING = 'mt-1.5 block text-meta text-ui-warn';

export interface IViolationRowProps {
  sample: IViolationSample;
}

export function ViolationRow({ sample }: IViolationRowProps) {
  return (
    <div className={ROW}>
      <span className={WHERE}>{sample.where}</span>
      <span className={RULE}>{sample.rule}</span>
      <pre className={CODE_BLOCK}>{sample.evidence}</pre>
      {sample.fix === null ? (
        <span className={FIX_MISSING}>
          ⛔ <strong>처방이 안 왔다</strong> — 무엇을 고쳐야 하는지 이 화면은 모른다.
          규칙에 <code>fix</code> 가 없다는 뜻이고, 그건 규칙 쪽의 빚이다.
        </span>
      ) : (
        <span className={FIX}>▸ 처방 — {sample.fix}</span>
      )}
    </div>
  );
}
