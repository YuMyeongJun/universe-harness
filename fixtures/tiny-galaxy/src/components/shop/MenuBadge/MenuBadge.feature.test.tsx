import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MenuBadge } from './MenuBadge';
import { useMenuBadge } from './useMenuBadge';

/**
 * 새 동작 계약: 품절 배지.
 * - 품절 항목은 '품절' 텍스트를 보여준다.
 * - 품절이 아닌 항목은 아무 배지도 보여주지 않는다.
 */
vi.mock('./useMenuBadge', () => ({
  useMenuBadge: vi.fn(),
}));

const mockUseMenuBadge = vi.mocked(useMenuBadge);

// 이전 렌더가 DOM에 남아 다음 테스트의 부재 검증(queryByText 없음)을 오염시키지 않도록
// 테스트마다 명시적으로 언마운트한다.
afterEach(() => {
  cleanup();
});

describe('MenuBadge 품절 배지', () => {
  it('품절 항목에는 "품절" 배지를 보여준다', () => {
    mockUseMenuBadge.mockReturnValue({
      isLoading: false,
      hasError: false,
      items: [{ id: '1', label: '떡볶이', isSoldOut: true }],
      selectedId: null,
      selectItem: vi.fn(),
    });

    render(<MenuBadge />);

    expect(screen.getByText('품절')).toBeInTheDocument();
  });

  it('재고가 있는 항목에는 배지를 보여주지 않는다', () => {
    mockUseMenuBadge.mockReturnValue({
      isLoading: false,
      hasError: false,
      items: [{ id: '2', label: '순대', isSoldOut: false }],
      selectedId: null,
      selectItem: vi.fn(),
    });

    render(<MenuBadge />);

    expect(screen.queryByText('품절')).not.toBeInTheDocument();
  });

  it('항목이 없으면 배지도 없다', () => {
    mockUseMenuBadge.mockReturnValue({
      isLoading: false,
      hasError: false,
      items: [],
      selectedId: null,
      selectItem: vi.fn(),
    });

    render(<MenuBadge />);

    expect(screen.queryByText('품절')).not.toBeInTheDocument();
  });
});
