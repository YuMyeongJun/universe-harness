import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('항목을 고르면 선택 표시가 붙는다', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /아메리카노/ }));

    expect(screen.getByRole('button', { name: /아메리카노 \(선택됨\)/ })).toBeInTheDocument();
  });
});
