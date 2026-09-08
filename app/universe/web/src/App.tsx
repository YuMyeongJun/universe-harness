import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { DomainSelect } from '@routes/DomainSelect';
import { GalaxySelect } from '@routes/GalaxySelect';
import { Intake } from '@routes/Intake';
import { RunReport } from '@routes/RunReport';
import { Survey } from '@routes/Survey';
import { Violations } from '@routes/Violations';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/**
         * ⚠️ **첫 화면이 바뀌었다 — 옛 화면은 지우지 않았다.**
         * 전에는 `/` 가 형제 폴더의 남의 저장소(`qa-workflow-v2-main`)에서 읽어 온 「도메인」
         * 목록이었고, 그래서 **우주가 아는 은하가 화면에 아예 안 떴다.**
         * ⇒ `/` 는 은하가 되고, 옛 도메인 화면은 `/domains` 로 **살아 있다.**
         * ⛔ 없애지 않았다: 없애면 도메인 지식 수집(`/d/:domain`)이 통째로 못 들어간다.
         */}
        <Route path="/" element={<GalaxySelect />} />
        {/**
         * **첫 칸** — 깃 주소를 받아 저장소를 받아 오고 은하로 들인다.
         * ⛔⛔ 서버에는 `POST /api/clones` · `POST /api/adopt` 가 **이미 있었는데
         * 화면에서 부르는 곳이 하나도 없었다**(실측 0줄). 사용자의 계획은 「화면을 띄우고
         * 깃 주소를 입력하고」로 시작하는데 그 칸을 **CLI 를 아는 사람만** 밟을 수 있었다.
         */}
        <Route path="/intake" element={<Intake />} />
        <Route path="/domains" element={<DomainSelect />} />
        <Route path="/d/:domain" element={<Survey />} />
        {/* 조각 3 — 위반 목록과 처방. 지금까지 터미널 출력에만 있던 자리다. */}
        <Route path="/violations" element={<Violations />} />
        {/**
         * 조각 5 — **주행 결과의 fail 목록과 판정.**
         * ⛔ 이 화면의 종료 조건은 「fail 0」이 아니라 **「판단하지 않은 fail 0」**이다.
         */}
        <Route path="/runs" element={<RunReport />} />
      </Routes>
    </BrowserRouter>
  );
}
