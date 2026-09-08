import type {
  IAdoptResult,
  ICaseVerdict,
  ICloneResult,
  IDomainSummary,
  IEmitFile,
  IGalaxyDraftResult,
  IGalaxyList,
  IJudgedRun,
  IObservation,
  IProgress,
  IRepoListResult,
  IRunListItem,
  IRunReceipt,
  ISurvey,
  ITcRunResult,
  ITcTemplateResult,
} from './types';

/** 서버가 준 오류 메시지를 **그대로** 던진다 — 화면에서 삼키지 않는다. */
const req = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `요청 실패 (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
};

export interface IHealth {
  ok: boolean;
  workflowRoot: string;
  tried?: string;
  hint?: string;
  browser: { open: boolean; domain: string | null; url: string | null };
}

export const getHealth = (): Promise<IHealth> => req<IHealth>('/api/health');

export const getDomains = (): Promise<{ domains: IDomainSummary[] }> =>
  req<{ domains: IDomainSummary[] }>('/api/domains');

export const getSurvey = (d: string): Promise<{ survey: ISurvey; progress: IProgress }> =>
  req(`/api/domains/${d}/survey`);

export const putSurvey = (
  d: string,
  patch: Partial<ISurvey>,
): Promise<{ survey: ISurvey; progress: IProgress }> =>
  req(`/api/domains/${d}/survey`, { method: 'PUT', body: JSON.stringify(patch) });

export const resetSurvey = (d: string): Promise<{ survey: ISurvey; progress: IProgress }> =>
  req(`/api/domains/${d}/survey/reset`, { method: 'POST' });

export const openBrowser = (d: string): Promise<{ ok: boolean; url: string }> =>
  req(`/api/domains/${d}/browser/open`, { method: 'POST' });

export const closeBrowser = (): Promise<{ ok: boolean }> =>
  req('/api/browser/close', { method: 'POST' });

export interface IScanResult {
  survey: ISurvey;
  progress: IProgress;
  scanned: {
    url: string;
    title: string;
    shot: string | null;
    found: number;
    added: number;
    reach: { textLength: number; inputs: number; buttons: number; thin: boolean };
    /** 못 쟀다고 볼 이유. null 이면 잰 것이다. */
    unmeasured: string | null;
  };
}

export const scan = (d: string): Promise<IScanResult> =>
  req(`/api/domains/${d}/scan`, { method: 'POST' });

export const previewEmit = (d: string, title: string): Promise<{ files: IEmitFile[] }> =>
  req(`/api/domains/${d}/emit/preview?title=${encodeURIComponent(title)}`);

export const applyEmit = (
  d: string,
  title: string,
  overwrite: string[],
): Promise<{ written: string[]; skipped: { path: string; why: string }[] }> =>
  req(`/api/domains/${d}/emit`, { method: 'POST', body: JSON.stringify({ title, overwrite }) });

export interface IProvenance {
  detected: boolean;
  ref: string | null;
  reason: string | null;
  detail: { port: number; pid: number; cwd: string; branch: string; commit: string; dirty: boolean } | null;
}

/** 「수집 대상 빌드」를 서버에서 확인한다. 못 알아내면 이유가 온다. */
export const getProvenance = (d: string): Promise<IProvenance> =>
  req<IProvenance>(`/api/domains/${d}/provenance`);

/**
 * ── 잴 저장소 고르기 ──
 *
 * ⛔ **못 쟀을 때 서버는 4xx 를 주지 않는다.** 「그 폴더에 `package.json` 이 없다」는
 * 제품이 깨진 것(❌)이 아니라 **잴 수 없는 것**(⚪)이라, 200 + `drafted:false` 로 온다.
 * 400 은 입력이 잘못된 것뿐이다(빈 이름 · 없는 폴더). 화면은 이 둘을 다르게 그린다 —
 * 접으면 「못 쟀다」가 「실패했다」로 보이고, 사람은 없는 버그를 찾으러 간다.
 */
export const makeGalaxyDraft = (name: string, dir: string): Promise<IGalaxyDraftResult> =>
  req<IGalaxyDraftResult>('/api/galaxy-drafts', {
    method: 'POST',
    body: JSON.stringify({ name, dir }),
  });

/**
 * 사람이 채운 자리를 **좌표에 적는** 자리 — ⛔ **아직 서버에 없다. 껍데기다.**
 *
 * 이 조각에서는 `app/universe/server/` 를 다른 손이 잡고 있어 열 수 없었다.
 * 그래서 화면은 **없는 대로** 만들었다: 눌러 보면 404 가 오고, 화면은 그것을
 * 「⚪ 아직 화면에서 못 적는다」로 **그대로 적고** 초안 파일 자리를 알려 준다.
 * ⛔ 실패를 삼키고 「적었다」고 말하지 않는다 — 그러면 아무도 안 적힌 좌표가 완성본이 된다.
 */
export const writeGalaxyCoordinates = (
  id: string,
  filled: Record<string, string>,
): Promise<{ written: string }> =>
  req(`/api/galaxy-drafts/${encodeURIComponent(id)}/coordinates`, {
    method: 'PUT',
    body: JSON.stringify({ filled }),
  });

/**
 * ── 위반 목록 ── 이 은하를 **다시 재서** 위반과 처방을 받아 온다.
 *
 * ⛔⛔ **아직 서버에 없다. 껍데기다.**
 * `app/universe/server/` 는 지금 다른 손이 잡고 있어 열 수 없었고,
 * 도구 쪽(`universe observe --json`)도 자식 D 가 만드는 중이라 **모양이 확정이 아니다.**
 * ⇒ 화면은 **없는 대로** 만들었다. 눌러 보면 404 가 오고, 화면은 그것을
 *   **⚪ 「못 쟀다」**로 그린다 — ❌ 「위반이 없다」로도, ✅ 초록으로도 그리지 않는다.
 *
 * 서버가 생기면 여기를 그 응답에 맞춘다. 맞출 때 볼 자리는 `@api/types` 의 `IObservation` 주석이다 —
 * 칸마다 **도구의 무엇과 대응하는지**를 적어 두었다.
 *
 * @param galaxy `galaxies/<이름>.json` 의 은하 이름 (`console`).
 * @param sample 표본을 몇 건까지 받을 것인가 — 관측소의 `--sample` 그대로.
 *   ⚠️ `0` 이면 표본이 **하나도 안 온다.** 그러면 건수는 있는데 **처방이 없다**(R94 의 그 형태).
 */
export const getObservation = (galaxy: string, sample: number): Promise<IObservation> =>
  req<IObservation>(
    `/api/observations/${encodeURIComponent(galaxy)}?sample=${encodeURIComponent(String(sample))}`,
  );

/**
 * ── 우주가 아는 은하 ── **첫 화면**이 부르는 자리.
 *
 * ⛔⛔ **실패해도 빈 목록으로 접지 마라.** 「목록을 못 읽었다」와 「은하가 0개다」는
 * 화면에서 똑같이 **아무것도 없는 화면**으로 보인다. 서버는 그래서 못 읽었을 때
 * `unmeasured` 에 사유를 담아 **200 으로** 준다 — 화면은 그 문장을 ⚪ 로 그린다.
 *
 * ⚠️ `galaxies.local/` 의 좌표 `path` 는 **남의 홈 경로**다(R152). 화면은 로컬이라 보여도
 * 되지만, ⛔ 이 응답을 **파일·로그로 흘리지 마라** — 커밋 대상이나 붙여넣기로 새 나간다.
 *
 * 대응처: `app/universe/server/src/server.ts` 의 `GET /api/galaxies` → `listGalaxies()`.
 */
export const getGalaxies = (): Promise<IGalaxyList> => req<IGalaxyList>('/api/galaxies');

/**
 * ── 주행 결과 ── **주행 결과 본문을 서버에 물려 판정을 받아 온다.**
 *
 * ⭐ 서버는 판정을 만들지 않고 `qa/dist/run/cli.js`(계약)를 부른다 — 접는 것 · 세는 것 ·
 * 「끝났는가」는 전부 그 계약이 안다. 화면도 서버도 **다시 세지 않는다.**
 *
 * ⚠️ 본문은 **손대지 않은 주행 결과**다: 계약 모양(`preconditions[]`·`cases[]`) 이거나
 * Playwright 리포트(`suites[]`). 출처 표를 함께 줄 때만 `{ report, origins }` 봉투로 싼다.
 * ⛔ 화면이 미리 파싱해서 되쓰지 않는다 — 되쓰면 「도구가 무엇을 읽었나」가 화면과 달라진다.
 *
 * ⛔ 이 길이 아직 안 열려 있을 수 있다(서버를 안 띄웠다 · 빌드가 없다). 그때는 던진 오류가
 * 화면에서 **⚪ 「못 받았다」**로 그려진다 — ❌ 도 ✅ 도 아니다.
 */
export const postRun = (raw: string, from?: 'contract' | 'playwright'): Promise<IRunReceipt> =>
  req<IRunReceipt>(from === undefined ? '/api/runs' : `/api/runs?from=${from}`, {
    method: 'POST',
    body: raw,
  });

/**
 * **남아 있는 주행 목록** — `GET /api/runs`.
 *
 * ⛔⛔ **이 목록은 「끝났는가」를 모른다.** 서버가 `note` 로 그렇게 적어 보낸다 —
 * 화면은 그 문장을 **그대로 나르고**, 목록의 수 자리에는 `0` 이 아니라 **`⚪`** 를 찍는다.
 * 「판단하지 않은 fail 이 0건」과 「그게 몇 건인지 모른다」는 다른 사실이다.
 */
export const getRuns = (): Promise<{ runs: IRunListItem[]; note: string }> =>
  req<{ runs: IRunListItem[]; note: string }>('/api/runs');

/**
 * **판정이 붙은 채로 다시 잰 주행을 받아 온다** — `GET /api/runs/:id`.
 *
 * ⭐ 「다시 잰다」가 핵심이다. 서버는 저장해 둔 케이스에 판정을 붙여 **계약 도구를 다시 부르고**
 * 그 답을 그대로 준다 — 화면도 서버도 「판단하지 않은 fail 이 하나 줄었다」를 **세지 않는다.**
 */
export const getRun = (id: string): Promise<IJudgedRun> =>
  req<IJudgedRun>(`/api/runs/${encodeURIComponent(id)}`);

/**
 * **사람이 내린 판정을 적는다** — `POST /api/runs/:id/verdict`.
 *
 * ⛔⛔ **답으로 오는 것은 「저장했다」가 아니라 다시 잰 주행 전체다.** 그래서 호출부는
 * 답을 **그대로 화면에 갈아 끼우면 되고**, 「판단하지 않은 fail」의 새 수를 스스로 세면 안 된다.
 * 세는 순간 화면의 수와 관문의 수가 갈리고, 갈린 뒤엔 어느 쪽이 사실인지 아무도 모른다.
 *
 * ⛔ **한 번에 한 건이다.** 서버가 `caseId` 배열을 거절한다(400) — 일괄 판정 갈래는
 *    「전부 통과 처리」로 가는 가장 짧은 길이라 계약이 막아 뒀다.
 * ⛔ `verdict: null` 은 **지우는 것**이다(장부에는 남는다). 「판단 안 함으로 되돌린다」이지
 *    「없던 일로 한다」가 아니다.
 * ⚠️ 사유가 짧은 `accepted` 도 **저장은 된다** — 그것이 판단으로 세어지는지는 계약이 정하고,
 *    답의 `report.done.unjudged` 에 그대로 남아 있다. 화면이 미리 막지 않는다.
 */
export const postVerdict = (
  id: string,
  caseId: string,
  verdict: ICaseVerdict | null,
): Promise<IJudgedRun> =>
  req<IJudgedRun>(`/api/runs/${encodeURIComponent(id)}/verdict`, {
    method: 'POST',
    body: JSON.stringify({ caseId, verdict }),
  });

/**
 * ── 첫 칸 ① ── **깃 주소를 받아 저장소를 받아 온다.** `POST /api/clones`.
 *
 * ⛔⛔ **토큰 칸을 만들지 마라.** 이 함수에 자격을 넣을 인자가 **없는 것이 설계다** —
 * 인증은 그 기계의 git 이 한다. 자격이 박힌 주소는 서버가 400 으로 거절하는데,
 * 그 이유가 「보안 일반론」이 아니라 구체적이다: 주소에 토큰이 있으면 그 값이
 * **인자**가 되어 셸 히스토리 · 프로세스 목록 · 서버 로그에 남는다.
 * ⇒ 화면은 그 거절 문장을 **그대로** 보여 준다(고쳐 적지 않는다).
 *
 * ⚠️ **`ok:false` 를 예외로 만들지 않는다.** 「그런 저장소가 없다」는 200 으로 온다 —
 * 이 함수는 그때 **던지지 않고 결과를 돌려준다.** 던지는 것은 요청의 모양이 틀렸을 때(400)와
 * 서버가 도구를 못 불렀을 때(500)뿐이다.
 */
export const postClone = (url: string, name?: string): Promise<ICloneResult> =>
  req<ICloneResult>('/api/clones', {
    method: 'POST',
    body: JSON.stringify(name === undefined ? { url } : { url, name }),
  });

/**
 * ── 첫 칸 ③ ── **채운 초안을 은하로 들인다.** `POST /api/adopt`.
 *
 * ⛔ **초안 파일 경로만 준다.** 은하 이름은 도구가 초안에서 읽는다 — 화면이 정하지 않는다.
 * ⛔ 서버는 **받아 온 자리 안의 초안만** 받는다(우주 밖 파일을 읽는 자리가 되지 않게).
 * ⚠️ 여기서도 `ok:false` 는 **결과**다 — 「`TODO:` 가 남았다」가 그것이고, 그건 사람이 채울 일이다.
 */
/**
 * ── 첫 칸 ⓪ ── **이 기계의 git 이 아는 저장소 목록.** `GET /api/repos`.
 *
 * ⛔⛔ **로그인을 화면이 하지 않는다.** 사용자가 요구한 「깃 로그인으로 레포 선택」에서
 *    로그인은 **이미 되어 있는 것**을 쓴다 — `gh auth login` 은 사람이 자기 터미널에서 하고,
 *    이 콘솔은 그 결과를 **읽기만** 한다. 화면에 자격을 받는 칸을 만들면 그 값이
 *    네트워크·서버 로그·프로세스 목록을 타고 흐른다. 그래서 **칸을 안 만든다.**
 * ⛔ 못 읽은 것을 **빈 목록으로 접지 않는다** — `ok:false` 는 ⚪(못 쟀다)이지 ❌ 가 아니다.
 */
export const getRepos = (limit?: number): Promise<IRepoListResult> =>
  req<IRepoListResult>(limit === undefined ? '/api/repos' : `/api/repos?limit=${String(limit)}`);

export const postAdopt = (draft: string): Promise<IAdoptResult> =>
  req<IAdoptResult>('/api/adopt', { method: 'POST', body: JSON.stringify({ draft }) });

/**
 * ── TC ① ── **양식을 내려받는다.** `GET /api/tc/template`. 모델 **0회**.
 *
 * ⛔ 화면이 양식을 짜지 않는다 — 칸 이름은 계약에서 오고, 서버는 도구를 돌려서 읽는다.
 *    화면이 짜면 계약이 바뀐 날 옛 칸을 나눠 주고, 채워 온 사람이 거부당하며
 *    **자기가 틀린 줄 안다.**
 */
export const getTcTemplate = (format: 'tsv' | 'csv'): Promise<ITcTemplateResult> =>
  req<ITcTemplateResult>(`/api/tc/template?format=${format}`);

/**
 * ── TC ② ── **채운 양식을 올려서 돌린다.** `POST /api/tc/runs`.
 *
 * ⛔ **경로가 아니라 내용을 보낸다** — 서버가 경로를 받으면 우주 밖 파일을 읽는 자리가 된다.
 * ⛔ **돌릴 명령을 화면이 안 보낸다** — 그 칸을 열면 콘솔이 원격 명령 실행기가 된다.
 */
export const postTcRun = (input: {
  cases: string;
  casesName?: string;
  preconditions?: string;
  preconditionsName?: string;
}): Promise<ITcRunResult> =>
  req<ITcRunResult>('/api/tc/runs', { method: 'POST', body: JSON.stringify(input) });
