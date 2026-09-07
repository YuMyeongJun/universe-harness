/**
 * 실측 초안 — 화면이 다루는 상태의 SoT.
 *
 * ⭐ **이 파일의 핵심 규율: 출처(`origin`)와 사람 판정(`status`)을 분리해서 들고 간다.**
 *    자동 수집이 채운 값은 그 자체로 지식이 아니다 — **사람이 확인해야 지식이 된다.**
 *    확인 안 된 항목을 조용히 통과시키면 "그럴듯한데 틀린 지식"이 생기고,
 *    그게 엉뚱한 TC 로 이어진다. 그래서 `unmeasured` 는 끝까지 이름을 달고 남는다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { dataDir } from './paths.js';

/** 사람만 아는 진입 정보. 자동 수집은 여기서부터 시작한다 — 없으면 시작조차 못 한다. */
export interface IEntry {
  baseUrl: string;
  loginUrl: string;
  /** 로그인 방식 서술 (SSO · OTP · 계정+비밀번호 …) */
  loginMethod: string;
  /** 계정 — 수집에만 쓰고 **지식 md 에는 절대 나가지 않는다** */
  accountId: string;
  accountPw: string;
  /** 로그인 후 첫 진입 URL */
  landingUrl: string;
  /**
   * 자체 서명 인증서를 허용할지. **기본은 꺼짐.**
   * 로컬·스테이징 dev 서버는 자체 서명이 흔해서 안 켜면 아예 못 연다.
   * 다만 **조용히 켜 두지 않는다** — TLS 를 무시한다는 건 사람이 알고 고르는 것이다.
   */
  allowInsecureTls: boolean;
  /**
   * **무엇을 걷었는지** — 브랜치·커밋·배포 환경.
   *
   * 실측일만으로는 부족하다. 같은 날 걷어도 **어느 빌드에서 걷었는지**에 따라 화면이 다르다.
   * 실제로 이 도구의 첫 실전에서, 걷은 사본이 담당자의 브랜치가 아닌 다른 브랜치였다.
   * 안 남기면 나중에 "이 지식이 어느 시점 것이냐"가 **복원 불가능해진다.**
   */
  sourceRef: string;
  note: string;
}

export type ItemKind = 'lnb' | 'account' | 'flow' | 'term' | 'issue';

/** 사람 판정 — `unmeasured` 가 기본값이다. 확인해야만 지식이 된다. */
export type ItemStatus = 'unmeasured' | 'confirmed' | 'corrected' | 'rejected';

export interface ISurveyItem {
  id: string;
  kind: ItemKind;
  /** 메뉴명·용어·흐름 이름 */
  label: string;
  url: string;
  detail: string;
  /** 어디서 왔나 — 자동 수집인지 사람이 직접 넣었는지 */
  origin: 'auto' | 'human';
  status: ItemStatus;
  /**
   * **누가 · 언제 그 판정을 했는가.**
   *
   * ⭐ 서버가 찍는다. 화면이 보내는 값을 믿지 않는다 — 판정의 주체를 화면이 정할 수 있으면
   *    그 기록은 판정을 뒷받침하지 못한다.
   *
   * 사유 없는 `아님` 은 표에서 티가 나지만, **주체·시각 없는 `확인함` 은 티가 안 난다.**
   * 안 보이는 것부터 막는다.
   */
  decidedBy?: string;
  decidedAt?: string;
}

export interface ISurvey {
  domain: string;
  updatedAt: string | null;
  /** 자동 수집을 마지막으로 돌린 시각. 지식 md 의 **실측일**이 된다. */
  collectedAt: string | null;
  entry: IEntry;
  items: ISurveyItem[];
}

export const emptyEntry = (): IEntry => ({
  baseUrl: '',
  loginUrl: '',
  loginMethod: '',
  accountId: '',
  accountPw: '',
  landingUrl: '',
  allowInsecureTls: false,
  sourceRef: '',
  note: '',
});

export const emptySurvey = (domain: string): ISurvey => ({
  domain,
  updatedAt: null,
  collectedAt: null,
  entry: emptyEntry(),
  items: [],
});

const file = (domain: string): string => join(dataDir(), `${domain}.json`);

export const readSurvey = (domain: string): ISurvey => {
  try {
    const raw = JSON.parse(readFileSync(file(domain), 'utf8')) as Partial<ISurvey>;
    return {
      ...emptySurvey(domain),
      ...raw,
      domain,
      entry: { ...emptyEntry(), ...(raw.entry ?? {}) },
      items: Array.isArray(raw.items) ? raw.items : [],
    };
  } catch {
    // 아직 시작 안 한 도메인이다. 빈 초안은 정상 상태다.
    return emptySurvey(domain);
  }
};

export const writeSurvey = (survey: ISurvey): ISurvey => {
  mkdirSync(dataDir(), { recursive: true });
  const next: ISurvey = { ...survey, updatedAt: new Date().toISOString() };
  writeFileSync(file(survey.domain), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
};

/** 화면 상단에 띄우는 진행도. **확인된 것만** 센다. */
export const progressOf = (s: ISurvey): { total: number; done: number; unmeasured: number } => {
  const total = s.items.length;
  const done = s.items.filter((i) => i.status === 'confirmed' || i.status === 'corrected').length;
  const unmeasured = s.items.filter((i) => i.status === 'unmeasured').length;
  return { total, done, unmeasured };
};
