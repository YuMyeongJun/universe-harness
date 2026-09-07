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

/**
 * ── 잴 저장소 고르기 ── 서버(`server/src/galaxy-draft.ts`)가 `bin/galaxy.mjs` 를 부르고
 * **그 도구가 한 말을 그대로** 나른 것. ⛔ 화면은 이 값을 다시 세거나 채우지 않는다.
 *
 * ⚠️ 여기 이름과 모양은 서버의 `IGalaxyDraftResult` 와 **한 글자도 다르면 안 된다.**
 * 두 자리가 갈리면 화면은 조용히 `undefined` 를 그리고, 그건 「없다」로 보인다.
 */
export interface IGalaxyCandidates {
  /**
   * 태양계 후보. ⛔ **도구도 서버도 고르지 않았다** — 사람이 고른다(관측 법칙 §9).
   * `null` 은 「도구의 문장에서 못 뽑았다」(⚪)이고, `[]` 는 「도구가 없다고 말했다」다.
   */
  solarSystems: string[] | null;
  /** 도구가 쓴 문장 원문. 위 목록이 미덥지 않으면 사람이 이걸 읽는다. */
  solarSystemsRaw: string | null;
  /** 모노레포일 때만. 도구가 준 줄 그대로 — 여기서도 고르지 않는다. */
  workspaces: string[] | null;
  /** 도구가 저장소에서 **읽어낸** 명령. 지어낸 것은 없다. */
  commands: Record<string, string>;
  /** 도구가 「이 저장소엔 없다」고 적은 문장. 없는 명령을 지어내지 않은 흔적이다. */
  missingCommands: string | null;
}

export interface IGalaxyDraftTodos {
  /** 도구가 **직접 센** 개수. `null` = 도구의 말에서 못 읽었다(⚪) — 그러면 완성이라고 말하지 않는다. */
  count: number | null;
  /** 어디에 남았는지 짚어 주는 자리. 개수의 출처는 위(도구)다. */
  at: string[];
  /** 도구가 센 개수와 짚은 자리 수가 다르면 여기 적힌다 — 조용히 맞추지 않는다. */
  note: string | null;
}

export interface IGalaxyDraftResult {
  id: string | null;
  drafted: boolean;
  /** ⚪ 못 쟀다 — 도구가 한 말 그대로. 잰 빨강(❌)이 아니다. */
  unmeasured: string | null;
  draft: Record<string, unknown> | null;
  todos: IGalaxyDraftTodos;
  /** ⛔ `TODO:` 를 **실제로 0개로 세었을 때만** true. 못 셌으면 false 다. */
  complete: boolean;
  /** 화면에 그대로 띄울 한 줄. 「초안」이라는 말이 사라지지 않게 서버가 박아 준다. */
  summary: string;
  candidates: IGalaxyCandidates | null;
  /** 재현용 — 사람이 손으로 다시 칠 수 있어야 한다. */
  tool: {
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    /** 초안 파일의 실제 자리(`.data/` 안 — 커밋되지 않는다). */
    out: string | null;
  };
}
