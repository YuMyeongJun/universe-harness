import type { IDomainSummary, IEmitFile, IProgress, ISurvey } from './types';

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
