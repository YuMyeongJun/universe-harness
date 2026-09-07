import type { ReactNode } from 'react';

import { HELP_TEXT } from '@components/ui';

/**
 * 라벨이 **입력에 실제로 이어진** 한 칸.
 *
 * ⚠️ `ui.tsx` 의 `Field` 는 라벨을 `<span>` 으로 그린다 — 눈에는 같아 보여도
 * 스크린리더에는 이름이 없다(시맨틱 법칙 `a11y/input-label` 이 그 자리를 12건 물고 있다).
 * 새로 만드는 칸은 `htmlFor` + `id` 로 잇는다. **기존 자리를 여기서 고치지는 않았다** —
 * 그건 이 조각이 아니고, 기준선을 내리는 것은 재고 나서 할 일이다.
 */
export interface ITextFieldProps {
  id: string;
  label: string;
  sub?: string;
  help?: ReactNode;
  placeholder?: string;
  value: string;
  /** 경로·명령처럼 **글자 하나가 뜻을 바꾸는** 값은 고정폭으로 보여 준다. */
  mono?: boolean;
  onChange: (next: string) => void;
}

export function TextField({
  id,
  label,
  sub,
  help,
  placeholder,
  value,
  mono = false,
  onChange,
}: ITextFieldProps) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.25 flex items-baseline gap-2">
        <label htmlFor={id} className="text-label font-semibold">
          {label}
        </label>
        {sub && <span className="text-xs text-ui-ink-faint">{sub}</span>}
      </div>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={mono ? 'font-mono' : undefined}
        onChange={(ev) => onChange(ev.target.value)}
      />
      {help && <span className={`mt-1 ${HELP_TEXT}`}>{help}</span>}
    </div>
  );
}
