import type { ReactNode } from 'react';

/**
 * 누르면 **뭔가 도는** 버튼.
 *
 * ⚠️ 껍질은 통째로 하나만 고른다 — 같은 속성을 두 벌 겹쳐 적으면 tailwind 는 클래스가
 * 적힌 순서가 아니라 CSS 출력 순서로 이겨서, 어느 쪽이 이길지 호출부만 봐서는 알 수 없다.
 */
const SHAPE = 'rounded-control border px-3.75 py-2.25 [&:not(:disabled)]:hover:border-ui-accent';
const SKIN_PLAIN = 'border-ui-line bg-ui-surface-raised text-ui-ink';
const SKIN_PRIMARY = 'border-ui-accent bg-ui-accent font-semibold text-ui-on-solid';

export interface IActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

export function ActionButton({ children, onClick, disabled = false, primary = false }: IActionButtonProps) {
  return (
    <button
      type="button"
      className={`${SHAPE} ${primary ? SKIN_PRIMARY : SKIN_PLAIN}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
