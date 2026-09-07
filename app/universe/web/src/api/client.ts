import type {
  IDomainSummary,
  IEmitFile,
  IGalaxyDraftResult,
  IGalaxyList,
  IObservation,
  IProgress,
  ISurvey,
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
