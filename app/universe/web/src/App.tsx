import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { DomainSelect } from '@routes/DomainSelect';
import { Survey } from '@routes/Survey';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DomainSelect />} />
        <Route path="/d/:domain" element={<Survey />} />
      </Routes>
    </BrowserRouter>
  );
}
