import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MenuBadge } from './MenuBadge';

/**
 * 별의 **행동 계약**이다. 구현을 바꾸되 여기 적힌 것은 유지한다.
 * ⛔ 이 파일을 고쳐서 통과시키지 마라 — 그것은 통과가 아니다.
 */
describe('MenuBadge', () => {
  it('제목을 접근 가능한 이름으로 노출한다', () => {
    render(<MenuBadge title="MenuBadge" />);

    expect(screen.getByRole('region', { name: 'MenuBadge' })).toBeInTheDocument();
  });

  it('항목이 없으면 목록이 비어 있다', () => {
    render(<MenuBadge />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
