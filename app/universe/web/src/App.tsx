import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { GalaxySelect } from '@routes/GalaxySelect';
import { Intake } from '@routes/Intake';
import { RepoSelect } from '@routes/RepoSelect';
import { RunReport } from '@routes/RunReport';
import { Tc } from '@routes/Tc';
import { Violations } from '@routes/Violations';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/**
         * ⚠️⚠️ **형제 저장소를 끊었다.**
         * 전에는 `/` 가 형제 폴더의 남의 저장소(`qa-workflow-v2-main`)에서 읽어 온 「도메인」
         * 목록이었고, 그래서 **우주가 아는 은하가 화면에 아예 안 떴다.** 그 뒤 `/` 를 은하로
         * 바꾸면서 옛 화면을 `/domains` 로 **남겨 뒀는데**, 그 자리가 계속 남의 저장소를 읽었다.
         * ⇒ 이제 도메인 계열(`/domains` 의 목록 · `/d/:domain`)은 **없다.**
         *   `/repos` 는 그 파일에 **같이 살고 있던 우주 자신의 기능**(잴 저장소 고르기)이다.
         */}
        <Route path="/" element={<GalaxySelect />} />
        {/**
         * **첫 칸** — 깃 주소를 받아 저장소를 받아 오고 은하로 들인다.
         * ⛔⛔ 서버에는 `POST /api/clones` · `POST /api/adopt` 가 **이미 있었는데
         * 화면에서 부르는 곳이 하나도 없었다**(실측 0줄). 사용자의 계획은 「화면을 띄우고
         * 깃 주소를 입력하고」로 시작하는데 그 칸을 **CLI 를 아는 사람만** 밟을 수 있었다.
         */}
        <Route path="/intake" element={<Intake />} />
        <Route path="/repos" element={<RepoSelect />} />
        {/* 조각 3 — 위반 목록과 처방. 지금까지 터미널 출력에만 있던 자리다. */}
        <Route path="/violations" element={<Violations />} />
        {/**
         * 조각 5 — **주행 결과의 fail 목록과 판정.**
         * ⛔ 이 화면의 종료 조건은 「fail 0」이 아니라 **「판단하지 않은 fail 0」**이다.
         */}
        <Route path="/runs" element={<RunReport />} />
        {/**
         * **TC 칸** — 양식을 내려받고, 채운 것을 올려서 돌린다.
         * ⛔⛔ TC 도구는 **있었는데 서버에 자리가 아예 없었다**(라우트 22개 중 0개).
         * 사용자가 요구한 두 칸(「양식 다운로드」·「업로드해서 자동수행」)이 통째로
         * **터미널 전용**이었다 — 이 제품의 전제와 정면으로 어긋난다.
         */}
        <Route path="/tc" element={<Tc />} />
      </Routes>
    </BrowserRouter>
  );
}
