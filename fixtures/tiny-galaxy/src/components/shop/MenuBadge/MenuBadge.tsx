import { useMenuBadge } from './useMenuBadge';

interface IMenuBadgeProps {
  /** 별에 들어오는 것. 필요 없으면 이 인터페이스째 지운다. */
  title?: string;
}

export const MenuBadge = ({ title = 'MenuBadge' }: IMenuBadgeProps) => {
  const { isLoading, hasError, items, selectItem } = useMenuBadge();

  if (hasError) {
    return (
      <section role="alert" className="text-destructive p-4">
        불러오지 못했습니다.
      </section>
    );
  }

  if (isLoading) {
    return <section className="text-muted-foreground p-4">불러오는 중…</section>;
  }

  return (
    <section aria-label={title} className="flex flex-col gap-4 p-4">
      <h2 className="text-foreground text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => selectItem(item.id)}
              className="bg-background hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left"
            >
              <span>{item.label}</span>
              {item.isSoldOut && (
                <span className="bg-destructive text-destructive-foreground rounded px-2 py-0.5 text-xs font-medium">
                  품절
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
