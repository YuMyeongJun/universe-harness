import { useCallback, useState } from 'react';

export interface IMenuBadgeItem {
  id: string;
  label: string;
  /** 품절이면 true. 카드 위 '품절' 배지 표시 여부를 결정한다. */
  isSoldOut: boolean;
}

export interface IUseMenuBadge {
  isLoading: boolean;
  hasError: boolean;
  items: IMenuBadgeItem[];
  selectedId: string | null;
  selectItem: (id: string) => void;
}

/**
 * MenuBadge 의 상태와 행동.
 *
 * ⚠️ props 를 여기 복사하지 마라 — 파생값은 렌더 중 계산한다(평탄성·품질 법칙).
 */
export const useMenuBadge = (): IUseMenuBadge => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* TODO: 실제 데이터 소스로 바꾼다. 지금은 별이 도는지 보기 위한 최소값이다. */
  const loadedItems: IMenuBadgeItem[] = [];

  const selectItem = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return { isLoading: false, hasError: false, items: loadedItems, selectedId, selectItem };
};
