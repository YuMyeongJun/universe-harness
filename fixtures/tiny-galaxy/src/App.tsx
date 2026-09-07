import { useState } from 'react';

import { MenuBadge } from './components/shop/MenuBadge';

const ITEMS = [
  { id: 'a1', title: '아메리카노', price: 4500, soldOut: false },
  { id: 'a2', title: '라떼', price: 5000, soldOut: true },
];

export const App = () => {
  const [selectedId, setSelectedId] = useState('');

  return (
    <main>
      <h1>tiny galaxy</h1>
      <ul>
        {ITEMS.map((entry) => (
          <li key={entry.id}>
            <button type="button" onClick={() => setSelectedId(entry.id)}>
              {entry.title}
              {selectedId === entry.id ? ' (선택됨)' : ''}
            </button>
          </li>
        ))}
      </ul>
      <MenuBadge title="품절 안내" />
    </main>
  );
};
