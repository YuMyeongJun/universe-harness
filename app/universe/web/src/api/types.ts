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

/* ══════════════════════════════════════════════════════════════════════════
 * ── 위반 목록과 처방 ──
 *
 * ⚠️⚠️ **이 모양은 아직 확정이 아니다.** `universe observe --json` 을 자식 D 가 만드는 중이고,
 * 서버(`app/universe/server/`)에도 아직 이 엔드포인트가 없다. 그래서 **화면이 필요한 모양을
 * 먼저 선언**하고, 칸마다 **도구/서버의 무엇과 대응하는지**를 적어 둔다.
 * ⛔ 두 자리가 갈리면 화면은 조용히 `undefined` 를 그리고, 그건 사람 눈에 **「없다」**로 보인다 —
 *    이 화면이 막으려는 사고를 이 화면이 저지르게 된다.
 *
 * 대응처(실측으로 읽은 것):
 *   · 표본·건수·분모 → `observatory/engine/packages/@plugins/harness-react-vite/dist/scan.d.ts`
 *                      의 `IScanResult` (`fileCount` · `blind` · `paths` · `total` · `byRule` · `samples`)
 *   · 기준선          → `galaxies/<은하>.json` 의 `observed.laws[법칙]` · `observed.files` · `observed.fingerprint`
 *   · 법칙 이름·제목  → `laws/<이름>.md` frontmatter 의 `name` · `title` · `rules`
 *   · 발동 증명 명부  → `observatory/rules-proven.json` 의 `provenRules`
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 위반 표본 한 건 — **자리 · 코드 · 처방이 한 몸이다.**
 *
 * ⛔⛔ 실측(R94): 관측소는 자리(파일:줄)와 코드는 보여 주는데 **처방이 안 왔다.** 데이터는
 * 있었고 화면만 비어 있었다 — 사람은 무엇을 고쳐야 하는지 모른 채 목록만 봤다.
 * 그래서 이 셋을 **한 인터페이스에 묶어** 하나가 빠지면 타입에서 보이게 한다.
 */
export interface IViolationSample {
  /** `samples[].rule` — 규칙 id (`a11y/button-type`). */
  rule: string;
  /** `samples[].where` — `web/src/routes/Survey.tsx:322`. 파일과 줄은 갈라 두지 않는다. */
  where: string;
  /** `samples[].evidence` — 그 줄의 코드 그대로. 줄바꿈은 도구가 `⏎` 로 접어 준다. */
  evidence: string;
  /**
   * `samples[].fix` — **처방.**
   * ⛔ 엔진 타입에서는 `fix?: string` 이라 **안 올 수 있다.** 화면은 `null` 로 받아
   * 「처방이 안 왔다」를 **적는다.** 빠뜨리면 R94 를 그대로 되풀이한다.
   */
  fix: string | null;
}

/**
 * 규칙 하나가 이 은하에서 어떤 상태였나.
 *
 * ⛔⛔ **「0건」은 한 갈래가 아니다.** 화면이 이 셋을 갈라 말해야 한다:
 *   · `fired`           — 발동했다. 건수는 **잰 것**이다.
 *   · `silent-proven`   — 여기선 0건인데 **더러운 은하에서 발동함이 증명된** 규칙이다
 *                         ⇒ 여기 0건은 「위반이 없다」는 뜻이다(관측 법칙 §8).
 *   · `silent-unproven` — 한 번도 발동한 적이 **증명되지 않았다**
 *                         ⇒ **규칙이 약한 것인지 위반이 없는 것인지 모른다(⚪).**
 */
export type RuleFiring = 'fired' | 'silent-proven' | 'silent-unproven';

export interface IRuleObservation {
  /** 규칙 id — 엔진 `contracts.RULE_PRESETS` 의 `rule.id`. */
  rule: string;
  /** `IScanResult.byRule` 의 짝값. 무발동이면 `0`. */
  count: number;
  /** 출처는 `observatory/rules-proven.json` 의 `provenRules` — 화면이 판단하지 않는다. */
  firing: RuleFiring;
}

/** 법칙 하나의 실측. */
export interface ILawObservation {
  /** `laws/<이름>.md` 의 `name` (`tokens`). */
  law: string;
  /** 그 파일의 `title` (`토큰 법칙`). 화면에 그대로 쓴다 — 고쳐 적지 않는다. */
  title: string;
  /** `IScanResult.total` — 이번에 **잰** 건수. */
  total: number;
  /**
   * `galaxies/<은하>.json` 의 `observed.laws[법칙]`.
   * ⛔ `null` 은 **기준선이 없다**(⚪)이지 `0` 이 아니다 — 견줄 것이 없는 것과 0과 같은 것은 다르다.
   */
  baseline: number | null;
  /**
   * 이 법칙이 켠 규칙 **전부**.
   * ⛔⛔ 발동 안 한 규칙을 빼고 주지 마라. 빼서 주면 화면은 그것을 **감출 수밖에 없고**,
   *     「위반이 없다」와 「규칙이 약하다」가 한 화면에서 구분되지 않는다.
   */
  rules: IRuleObservation[];
  /**
   * `IScanResult.samples` 중 이 법칙 몫.
   * ⚠️ `--sample` 을 안 주면 **빈 배열**로 온다 — 그때 화면은 「위반이 없다」가 아니라
   *    「무엇을 고칠지 못 받았다」고 적는다.
   */
  samples: IViolationSample[];
}

/** 규칙이 못 읽은 파일 한 갈래 — `IScanResult.blind` 의 `[확장자, 개수]` 짝. */
export interface IBlindExtension {
  /** 확장자 (`.vue`). */
  ext: string;
  /** 그 확장자의 파일 수. */
  files: number;
  /** `galaxies/<은하>.json` 의 `blindJudged[확장자]`. `null` = 이 은하가 **아직 판단 안 했다**. */
  judged: string | null;
}

/**
 * **분모** — 이 화면에서 제일 중요한 칸이다.
 *
 * ⛔⛔ 건수만 있고 분모가 없으면 「0건」이 「위반이 없다」로 읽힌다.
 * ⚠️ 이 저장소의 실측(R162): 콘솔 은하의 `appDir` 이 소스 없는 곳을 가리켜 훑개가
 *    **파일 0개**를 보았고, 모든 법칙 0건이 기준선으로 심겼다 — 그 은하는 **영원히 초록**이었다.
 *    고치고 나니 같은 은하에서 `a11y/input-label` **12건**이 나왔다. 0건이 아니었다.
 */
export interface IScanScope {
  /** `IScanResult.fileCount` — 규칙이 **실제로 읽은** 파일 수. `0` 이면 아무것도 안 본 것이다. */
  files: number;
  /** 훑은 자리 — 관측소가 만드는 `<appDir>/src`. 좌표가 어디를 가리켰는지 사람이 봐야 한다. */
  target: string;
  /** `galaxies/<은하>.json` 의 `appDir`. 0개를 훑었을 때 **제일 먼저 의심할 자리**다. */
  appDir: string;
  /** 코드인데 규칙이 못 읽은 파일 — **조용한 부분 실명은 0건보다 위험하다**(§8). */
  blind: IBlindExtension[];
  /**
   * `IScanResult.paths` 의 지문 — `observed.fingerprint` 와 견준다.
   * 수치가 같아도 **잰 대상이 달라졌으면 같은 것을 잰 게 아니다.** `null` 이면 못 읽었다.
   */
  fingerprint: string | null;
}

/** 이 은하를 한 번 잰 결과 전부. */
export interface IObservation {
  /** 은하 이름 — `galaxies/<이름>.json` 의 `name`. */
  galaxy: string;
  scope: IScanScope;
  laws: ILawObservation[];
  /**
   * ⚪ **못 쟀다** — 잴 수가 없었던 이유. `null` 이면 **잰 것**이다.
   * (은하가 이 기계에 없다 · 좌표가 빈 곳을 가리킨다 · 좌표에 `TODO:` 가 남았다 · 도구가 안 돌았다.)
   * ⛔ 이것은 ❌(잰 빨강)가 **아니다.** 화면은 색과 문구를 갈라 그린다.
   */
  unmeasured: string | null;
  /**
   * 도구가 낸 ⓘ·⚠️ 줄 — **고쳐 적지 않고 그대로.**
   * (지문이 바뀌었다 · 더러운 트리에서 심긴 기준선 · 꺼진 법칙의 낡은 기준선 · 기준선을 올린 이력…)
   */
  notes: string[];
  /** 재현용 — 사람이 손으로 다시 칠 수 있어야 「했습니다」가 검증된다. */
  tool: {
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  };
}
