import type { IDomainSummary, IEmitFile, IGalaxyDraftResult, IProgress, ISurvey } from './types';

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
