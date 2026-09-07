import { use__Star__ } from './use__Star__';

interface I__Star__Props {
  /** 별에 들어오는 것. 필요 없으면 이 인터페이스째 지운다. */
  title?: string;
}

export const __Star__ = ({ title = '__Star__' }: I__Star__Props) => {
  const { isLoading, hasError, items, selectItem } = use__Star__();

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
              className="bg-background hover:bg-accent w-full rounded-md border p-3 text-left"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
