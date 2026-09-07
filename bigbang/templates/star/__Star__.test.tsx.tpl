import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { __Star__ } from './__Star__';

/**
 * 별의 **행동 계약**이다. 구현을 바꾸되 여기 적힌 것은 유지한다.
 * ⛔ 이 파일을 고쳐서 통과시키지 마라 — 그것은 통과가 아니다.
 */
describe('__Star__', () => {
  it('제목을 접근 가능한 이름으로 노출한다', () => {
    render(<__Star__ title="__Star__" />);

    expect(screen.getByRole('region', { name: '__Star__' })).toBeInTheDocument();
  });

  it('항목이 없으면 목록이 비어 있다', () => {
    render(<__Star__ />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
