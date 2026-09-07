export type Fill = 'filled' | 'partial' | 'stub';

export interface IDomainSummary {
  domain: string;
  title: string;
  docs: number;
  bytes: number;
  tbdDocs: number;
  lnbFolders: number;
  fill: Fill;
}

export type ItemKind = 'lnb' | 'account' | 'flow' | 'term' | 'issue';
export type ItemStatus = 'unmeasured' | 'confirmed' | 'corrected' | 'rejected';

export interface ISurveyItem {
  id: string;
  kind: ItemKind;
  label: string;
  url: string;
  detail: string;
  origin: 'auto' | 'human';
  status: ItemStatus;
}

export interface IEntry {
  baseUrl: string;
  loginUrl: string;
  loginMethod: string;
  accountId: string;
  accountPw: string;
  landingUrl: string;
  allowInsecureTls: boolean;
  sourceRef: string;
  note: string;
}

export interface ISurvey {
  domain: string;
  updatedAt: string | null;
  collectedAt: string | null;
  entry: IEntry;
  items: ISurveyItem[];
}

export interface IProgress {
  total: number;
  done: number;
  unmeasured: number;
}

export interface IEmitFile {
  path: string;
  content: string;
  exists: boolean;
  isStub: boolean;
}

export const FILL_LABEL: Record<Fill, string> = {
  filled: '작성됨',
  partial: '일부',
  stub: '골격만',
};

export const KIND_LABEL: Record<ItemKind, string> = {
  lnb: 'LNB 메뉴',
  account: '계정 체계',
  flow: '화면 흐름',
  term: '용어',
  issue: '알려진 이슈',
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  unmeasured: '미확인',
  confirmed: '확인함',
  corrected: '고쳐서 확인',
  rejected: '아님',
};
