import type { ReactNode } from 'react';

export function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: ReactNode }) {
  return (
    <div>
      <div className="top">
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <h1>{title}</h1>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

export function Field({
  label,
  sub,
  help,
  children,
}: {
  label: string;
  sub?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field__lab">
        <span className="field__label">{label}</span>
        {sub && <span className="field__sub">{sub}</span>}
      </div>
      {children}
      {help && <span className="field__help">{help}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  return <div className={`banner banner--${tone}`}>{children}</div>;
}

export function Tile({ v, l }: { v: number | string; l: string }) {
  return (
    <div className="tile">
      <span className="tile__v">{v}</span>
      <span className="tile__l">{l}</span>
    </div>
  );
}
