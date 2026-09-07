import { useCallback, useState } from 'react';

export interface I__Star__Item {
  id: string;
  label: string;
}

export interface IUse__Star__ {
  isLoading: boolean;
  hasError: boolean;
  items: I__Star__Item[];
  selectedId: string | null;
  selectItem: (id: string) => void;
}

/**
 * __Star__ 의 상태와 행동.
 *
 * ⚠️ props 를 여기 복사하지 마라 — 파생값은 렌더 중 계산한다(평탄성·품질 법칙).
 */
export const use__Star__ = (): IUse__Star__ => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* TODO: 실제 데이터 소스로 바꾼다. 지금은 별이 도는지 보기 위한 최소값이다. */
  const loadedItems: I__Star__Item[] = [];

  const selectItem = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return { isLoading: false, hasError: false, items: loadedItems, selectedId, selectItem };
};
