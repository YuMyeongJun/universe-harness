import type { ReactNode } from 'react';

import { HELP_TEXT } from '@components/ui';

/**
 * **도구가 뱉은 JSON 을 사람이 그대로 붙여 넣는 자리.**
 *
 * ⚠️ 왜 이런 칸이 있나 — `app/universe/server/` 에 아직 주행 결과를 주는 자리가 없다
 * (다른 손이 잡고 있다). 그동안 사람은 `tc-run … --json` 을 손으로 돌릴 수 있고,
 * 그 **출력을 그대로** 여기 붙이면 화면이 같은 것을 그린다.
 * ⛔ 화면이 대신 그럴듯한 주행 결과를 지어내는 것보다 **한 번 붙여넣게 하는 편이** 낫다 —
 * 지어낸 목록은 아무도 돌리지 않은 주행을 초록으로 보이게 한다.
 *
 * ⚠️ 라벨은 `htmlFor` 로 **실제로 이어져 있다**(`a11y/input-label` 이 이 콘솔에서 12건 물고 있는 자리다).
 */
const ROWS_ENOUGH_TO_SEE_A_RUN = 10;

export interface IJsonPasteFieldProps {
  id: string;
  label: string;
  sub?: string;
  help?: ReactNode;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
}

export function JsonPasteField({
  id,
  label,
  sub,
  help,
  placeholder,
  value,
  onChange,
}: IJsonPasteFieldProps) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.25 flex items-baseline gap-2">
        <label htmlFor={id} className="text-label font-semibold">
          {label}
        </label>
        {sub && <span className="text-xs text-ui-ink-faint">{sub}</span>}
      </div>
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        rows={ROWS_ENOUGH_TO_SEE_A_RUN}
        spellCheck={false}
        className="font-mono text-xs"
        onChange={(ev) => onChange(ev.target.value)}
      />
      {help && <span className={`mt-1 ${HELP_TEXT}`}>{help}</span>}
    </div>
  );
}
