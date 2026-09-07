import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { DomainSelect } from '@routes/DomainSelect';
import { Survey } from '@routes/Survey';
import { Violations } from '@routes/Violations';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DomainSelect />} />
        <Route path="/d/:domain" element={<Survey />} />
        {/* 조각 3 — 위반 목록과 처방. 지금까지 터미널 출력에만 있던 자리다. */}
        <Route path="/violations" element={<Violations />} />
      </Routes>
    </BrowserRouter>
  );
}
