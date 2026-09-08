import type {
  IAdoptResult,
  IBranchList,
  IBrowseResult,
  IGhLoginState,
  IGhOrgs,
  IGhStatus,
  ICaseVerdict,
  ICloneResult,
  IGalaxyDraftResult,
  IGalaxyList,
  IJudgedRun,
  IObservation,
  IRepoListResult,
  IRunListItem,
  IRunReceipt,
  ITcRunResult,
  ITcTemplateResult,
  IWatchResult,
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

/**
 * 서버가 서 있는가, 그리고 **어느 우주를 읽는가.**
 *
 * ⚠️⚠️ 전에는 이 자리가 `workflowRoot`(형제 폴더의 남의 저장소)와 `browser`(열린 로그인 세션)를
 * 함께 실어 왔다. 둘 다 **끊었다** — 세션을 여는 화면(수집)도 남의 저장소를 읽던
 * 도메인 계열도 지웠으므로, 그 칸을 남겨 두면 **영원히 아무 값도 안 오는 칸**이 된다.
 */
export interface IHealth {
  ok: boolean;
  universeRoot: string;
  /** `ok:false` 일 때만 온다 — 찾아본 자리와, 사람이 할 일. */
  tried?: string;
  hint?: string;
}

export const getHealth = (): Promise<IHealth> => req<IHealth>('/api/health');


/**
 * ── 폴더 훑기 ──
 *
 * ⛔ 브라우저의 폴더 선택기(`webkitdirectory` · `showDirectoryPicker`)는 **절대 경로를 안 준다.**
 * 서버는 실제 경로를 받아야 하므로 **서버가 훑어** 주고 화면은 타고 내려간다
 * (자세한 이유는 `server/src/browse.ts` 머리말).
 */
export const browseDir = (dir?: string): Promise<IBrowseResult> =>
  req<IBrowseResult>(`/api/fs${dir === undefined ? '' : `?dir=${encodeURIComponent(dir)}`}`);

/**
 * ── 깃 로그인 ──
 *
 * ⭐ 상태는 **언제나 계정 이름과 함께** 온다. 「로그인됨」만 보면 조직 계정과 개인 계정이
 * 섞이는 날 어느 쪽으로 붙었는지 모른다.
 */
export const getGh = (): Promise<IGhStatus> => req<IGhStatus>('/api/gh');

/** 기기 흐름 시작 — 일회용 코드와 URL 이 **먼저** 온다. 나머지는 서버가 배경에서 기다린다. */
export const startGhLogin = (): Promise<IGhLoginState> =>
  req<IGhLoginState>('/api/gh/login', { method: 'POST' });

/** 이 계정이 속한 조직 — 소유자 칸의 후보. ⛔ 실패와 「0개」를 화면이 가를 수 있게 `ok` 가 온다. */
export const getGhOrgs = (): Promise<IGhOrgs> => req<IGhOrgs>('/api/gh/orgs');

export const pollGhLogin = (): Promise<IGhLoginState> => req<IGhLoginState>('/api/gh/login');

export const cancelGhLogin = (): Promise<IGhLoginState> =>
  req<IGhLoginState>('/api/gh/login/cancel', { method: 'POST' });

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
/** @param branch ⚠️ 안 주면 **원격의 기본 가지**를 받는다 — 우주가 고른 것이 아니다. */
export const postClone = (url: string, name?: string, branch?: string): Promise<ICloneResult> =>
  req<ICloneResult>('/api/clones', {
    method: 'POST',
    /* ⛔ 안 준 칸은 **안 보낸다** — `undefined` 를 보내면 서버가 「빈 이름」과 「안 준 것」을 못 가른다. */
    body: JSON.stringify({
      url,
      ...(name === undefined || name === '' ? {} : { name }),
      ...(branch === undefined || branch === '' ? {} : { branch }),
    }),
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
/**
 * @param owner 계정 또는 **조직**. ⚠️ 안 주면 `gh` 의 **활성 계정 자신**을 본다 —
 *   계정이 조직에만 속해 있으면 그 목록은 **0개**이고, 화면에서 그건 「저장소가 없다」로 보인다.
 *   ⛔ 그건 못 본 것이지 없는 것이 아니다(§8).
 */
export const getRepos = (limit?: number, owner?: string): Promise<IRepoListResult> => {
  const q = new URLSearchParams();
  if (limit !== undefined) q.set('limit', String(limit));
  if (owner !== undefined && owner !== '') q.set('owner', owner);
  const tail = q.toString();
  return req<IRepoListResult>(tail === '' ? '/api/repos' : `/api/repos?${tail}`);
};

/** 그 저장소의 가지 목록. ⛔ `ok:false` 는 「가지가 없다」가 아니라 **못 쟀다**다. */
export const getBranches = (url: string): Promise<IBranchList> =>
  req<IBranchList>(`/api/branches?url=${encodeURIComponent(url)}`);

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

/**
 * ── TC ③ ── **보면서 돌린다.** `POST /api/e2e/watch`. 브라우저 창이 뜬다.
 *
 * ⛔⛔ **돌릴 명령을 보내지 않는다** — 은하 이름만 보낸다. 축은 은하 파일이 선언한다
 *    (`commands.e2eWatch`). 명령을 보내는 순간 이 콘솔이 원격 명령 실행기가 된다.
 * ⚠️ 오래 걸린다(최대 15분). 느리게 도는 것이 이 축의 목적이다.
 */
export const postWatch = (galaxy: string): Promise<IWatchResult> =>
  req<IWatchResult>('/api/e2e/watch', { method: 'POST', body: JSON.stringify({ galaxy }) });
