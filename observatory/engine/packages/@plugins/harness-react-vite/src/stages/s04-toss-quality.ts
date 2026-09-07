/**
 * Stage 04 — 토스 코드 퀄리티 · 접근성 리팩터링.
 *
 * 유일하게 **코드를 새로 심는** 스테이지다. 심는 컴포넌트에는 실제 리뷰에서 반복해 나온
 * 결함만 넣는다 — 복사본 state, 중첩 삼항, 의도 없는 이름, 임의 값 Tailwind,
 * `div` + `onClick`, 이름 없는 아이콘 버튼.
 *
 * 채점의 축은 두 개다:
 *   - Contract 가 통과시켰는가 (관문은 러너가 매 제출마다 이미 돌린다)
 *   - **행동이 유지됐는가** — 같이 심는 테스트가 계속 초록불인가.
 * 두 번째가 없으면 에이전트는 규칙을 만족시키려고 기능을 지운다(실제로 그런다).
 */
import type { IStageDefinition, IStageIO, ISignal } from '@core/fe-agent-harness';

import { inApp } from '../paths.ts';
import type { IReactVitePaths } from '../paths.ts';
import type { IStageDeps } from './index.ts';

const SEEDED_COMPONENT = `import { useEffect, useState } from 'react';

interface CatalogRowProps {
  data: { id: string; title: string; price: number; soldOut: boolean };
  selectedId: string;
  onSelect: (id: string) => void;
}

export function CatalogRow(props: CatalogRowProps) {
  const [data2, setData2] = useState(props.data.title);
  const [flag, setFlag] = useState(props.selectedId === props.data.id);

  useEffect(() => {
    setFlag(props.selectedId === props.data.id);
  }, [props.selectedId, props.data.id]);

  useEffect(() => {
    setData2(props.data.title);
  }, [props.data.title]);

  return (
    <div
      onClick={() => props.onSelect(props.data.id)}
      className="flex items-center justify-between w-[327px] px-[12px] py-[10px] rounded-[8px] border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F9FAFB]"
      data-testid="catalog-row"
    >
      <div className="flex flex-col">
        <span className="text-[14px] text-[#111827]">{data2}</span>
        <span className="text-[12px] text-[#6B7280]">
          {props.data.soldOut ? '품절' : props.data.price > 100000 ? '무료배송' : '배송비 3,000원'}
        </span>
      </div>
      <div className="flex items-center gap-[8px]">
        {flag ? <span className="text-[12px] text-[#2563EB]">선택됨</span> : null}
        <button onClick={() => props.onSelect(props.data.id)}>
          <svg width="16" height="16" viewBox="0 0 16 16" />
        </button>
      </div>
    </div>
  );
}
`;

const SEEDED_TEST = `import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CatalogRow } from './CatalogRow';

/**
 * 이 테스트는 **행동 계약**이다. 리팩터링으로 규칙을 만족시키되 여기 적힌 것은 유지해야 한다.
 * ⛔ 이 파일을 고쳐서 통과시키지 마라 — 러너가 이 파일의 내용을 확인한다.
 */
const item = { id: 'a1', title: '아메리카노', price: 4500, soldOut: false };

describe('CatalogRow', () => {
  it('행을 활성화하면 선택 콜백이 id 와 함께 불린다', async () => {
    const onSelect = vi.fn();
    render(<CatalogRow data={item} selectedId="" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /아메리카노/ }));

    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('키보드만으로 선택할 수 있다', async () => {
    const onSelect = vi.fn();
    render(<CatalogRow data={item} selectedId="" onSelect={onSelect} />);

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('선택된 행임을 이름으로 알린다', () => {
    render(<CatalogRow data={item} selectedId="a1" onSelect={() => undefined} />);

    expect(screen.getByText('선택됨')).toBeInTheDocument();
  });

  it('품절이면 배송 문구 대신 품절을 보여준다', () => {
    render(<CatalogRow data={{ ...item, soldOut: true }} selectedId="" onSelect={() => undefined} />);

    expect(screen.getByText('품절')).toBeInTheDocument();
  });

  it('props 의 title 이 바뀌면 화면도 바뀐다', () => {
    const { rerender } = render(<CatalogRow data={item} selectedId="" onSelect={() => undefined} />);
    rerender(<CatalogRow data={{ ...item, title: '라떼' }} selectedId="" onSelect={() => undefined} />);

    expect(screen.getByText('라떼')).toBeInTheDocument();
  });
});
`;

export const createStage04 = (paths: IReactVitePaths, deps: IStageDeps): IStageDefinition => {
  const target = inApp(paths, `${paths.seedComponentDir}/CatalogRow.tsx`);
  const test = inApp(paths, `${paths.seedComponentDir}/CatalogRow.test.tsx`);

  return {
    id: 's04-toss-quality',
    title: '토스 코드 퀄리티 · 접근성 리팩터링',
    intent: '행동을 그대로 둔 채, 의도 기반 네이밍 · 얼리 리턴 · 복사본 state 제거 · 토큰 스타일 · 키보드 접근을 세운다.',
    maxSteps: 10,
    contractLanes: { quality: true, typeSafety: true, a11y: true, tailwind: true, delivery: false },

    setup: async (io: IStageIO) => {
      await io.write(target, SEEDED_COMPONENT);
      await io.write(test, SEEDED_TEST);
    },

    briefing: async () => `
\`${target}\` 를 리팩터링하라. 요구는 두 줄이다.

1. \`${test}\` 는 **한 줄도 고치지 않고** 계속 초록불이어야 한다(러너가 내용을 확인한다).
2. Contract 가 통과시켜야 한다 — 제출할 때마다 관문이 판정을 돌려준다.

관문이 보는 것: 의도 기반 네이밍 · 얼리 리턴 · props 복사 state 금지 · 디자인 토큰
(임의 값 금지) · 시맨틱 요소와 키보드 접근 · 저장소 컨벤션(화살표 함수 · \`I\` 접두사 인터페이스).

⚠️ 규칙을 만족시키려고 기능을 지우지 마라. 테스트가 곧 계약이다.
`,

    verify: async (io: IStageIO): Promise<ISignal[]> => {
      const component = await io.read(target);
      const seededTest = await io.read(test);

      const testResult = await io.exec(deps.testFileCommand.replaceAll('<PATH>', paths.seedComponentDir), {
        timeoutMs: 10 * 60_000,
      });

      return [
        {
          name: '행동 계약 테스트 통과',
          ok: testResult.code === 0,
          measured: `exit ${testResult.code}`,
          detail: testResult.code === 0 ? '' : testResult.stdout.split('\n').slice(-25).join('\n'),
        },
        {
          name: '테스트 파일을 고치지 않았다',
          ok: seededTest.trim() === SEEDED_TEST.trim(),
          detail: '테스트를 고쳐서 통과시키는 것은 통과가 아니다.',
        },
        {
          name: '임의 값 Tailwind 0',
          ok: !/(?:bg|text|border|w|h|p[xy]?|rounded|gap)-\[[^\]]+\]/.test(component),
          measured: `${(component.match(/-\[[^\]]+\]/g) ?? []).length}개`,
        },
        {
          name: 'props 복사 state 0',
          ok: !/useState\(\s*props\./.test(component) && !/useEffect\([^)]*\)\s*=>\s*\{?\s*set[A-Z]/.test(component),
        },
        {
          name: '클릭 대상이 시맨틱하다',
          ok: !/<div[^>]*onClick=/.test(component),
        },
        {
          name: '화살표 함수 컴포넌트',
          ok: !/^\s*export\s+function\s/m.test(component),
        },
      ];
    },
  };
};
