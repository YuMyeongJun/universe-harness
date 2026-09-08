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

/* ══════════════════════════════════════════════════════════════════════════
 * ── 우주가 아는 은하 ── 콘솔의 **첫 화면**이 보는 자리.
 *
 * ⚠️⚠️ 여기 이름과 모양은 서버(`app/universe/server/src/galaxies.ts`)의 `IGalaxyList` 와
 * **한 글자도 다르면 안 된다.** 두 자리가 갈리면 화면은 조용히 `undefined` 를 그리고,
 * 그건 사람 눈에 **「없다」**로 보인다 — 이 화면이 막으려는 사고를 이 화면이 저지르게 된다.
 *
 * 대응처(실측으로 읽은 것 — `curl -s http://127.0.0.1:8788/api/galaxies`):
 *   · 목록의 정본  → `universe.config.json` 의 `galaxies` 배열
 *   · 좌표         → `galaxies.local/<이름>.json` → `galaxies/<이름>.json` (순서는 `lib/galaxy-load.mjs`)
 *   · 기준선       → 그 좌표의 `observed`
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 이 은하가 지금 어떤 상태인가. ⛔ **「괜찮다」가 기본값이 아니다.**
 *
 * ⛔⛔ 실측(R121): 좌표를 만들어 놓고 `universe.config.json` 에 안 올렸더니 관측이
 * **「아무것도 안 재고 초록불」**을 냈다. 그 침묵이 결함이다.
 * ⇒ 화면은 아래 다섯을 **색과 문구로 갈라** 그리고, ⛔ **어느 것도 목록에서 빼지 않는다.**
 * 조용히 빼면 「원래 없었다」와 구별이 안 된다.
 */
export type GalaxyState =
  | 'listed'
  | 'no-coordinate'
  | 'unreadable'
  | 'not-registered'
  | 'bad-name';

/** 좌표 파일이 어디 있나. ⛔ `found:false` 는 「없는 은하」가 아니라 「좌표가 없다」다. */
export interface IGalaxyCoordinate {
  found: boolean;
  /** 우주 뿌리 기준 **상대** 경로. 어느 명부에 있는지 사람이 봐야 한다. */
  file: string | null;
  /** `galaxies.local` 인가 `galaxies` 인가. */
  dir: string | null;
  /** gitignore 되는 자리인가(= 절대 경로를 담아도 되는 자리인가). */
  local: boolean;
  /** 못 읽었으면 서버가 옮긴 **문장 그대로**. 화면이 고쳐 적지 않는다. */
  problem: string | null;
}

/**
 * 기준선 — **있으면** 언제 무엇을 쟀는지.
 *
 * ⛔ 이 객체가 `null` 이면 **아직 안 쟀다**(⚪)이지 「위반 0」이 아니다.
 * ⛔⛔ `files` 가 `0` 이면 **아무것도 안 훑고 심긴 기준선**이다 — 그 은하는 영원히 초록이다(R162).
 */
export interface IGalaxyBaseline {
  measuredAt: string | null;
  commit: string | null;
  /** 그때 훑은 **파일 수** — 분모다. */
  files: number | null;
  dirtyFiles: number | null;
  fingerprint: string | null;
  /** 법칙별 기준선 건수. ⛔ **그때 잰 값**이지 지금 값이 아니다. */
  laws: Record<string, number>;
}

export interface IGalaxyEntry {
  name: string;
  state: GalaxyState;
  /** `universe.config.json` 의 `galaxies` 에 있는가. **목록의 정본은 그 배열이다.** */
  registered: boolean;
  coordinate: IGalaxyCoordinate;
  description: string | null;
  /** 은하가 사는 자리. ⛔ `null` 은 「좌표를 못 읽어서 모른다」이지 「경로가 없다」가 아니다. */
  path: string | null;
  /** 이 기계에 실재하는가. ⛔ `false` 는 ⚪(이 기계엔 없다)이지 ❌(실패)가 아니다. `null` = 못 봤다. */
  pathExists: boolean | null;
  appWorkspace: string | null;
  /** 훑개가 보는 자리. ⚠️ 이게 틀리면 파일 0개를 훑고 「0건」이 기준선이 된다(R162). */
  appDir: string | null;
  /** 이 은하가 켠 법칙. ⛔ `null` = 좌표를 못 읽었다 — 「법칙이 0개」가 아니다. */
  laws: string[] | null;
  /** 좌표에 **선언된** 명령. 지어낸 것은 없다. */
  commands: Record<string, string>;
  /**
   * 좌표가 「이 저장소엔 없다」고 적어 둔 것.
   * ⛔⛔ **빈칸으로 두지 마라** — 없는 축은 ⚪ 로 **안 재진다**. 빈칸은 「그 축이 초록」으로 읽힌다.
   */
  missingCommands: string | null;
  /** ⛔ `null` = 기준선이 없다 ⇒ **아직 안 쟀다**(⚪). `0` 건과 섞지 않는다. */
  baseline: IGalaxyBaseline | null;
  /** ⛔ 말해야 하는 것. 없으면 `null`. */
  problem: string | null;
  /** 서버가 판정 어휘(⛔·⚪·ⓘ)를 박아 준 줄들. ⛔ 화면이 **고쳐 적지 않는다.** */
  notes: string[];
}

export interface IGalaxyList {
  /** 목록의 정본이 사는 파일 — 우주 뿌리 기준 상대 경로. */
  configFile: string;
  /** ⛔ `null` 은 **못 읽었다**(⚪)이지 「은하가 없다」가 아니다. */
  registered: string[] | null;
  /** 등재 순서대로, **그 뒤에** 등재 안 된 좌표. ⛔ 어느 쪽도 빠져 있지 않다. */
  galaxies: IGalaxyEntry[];
  /** ⛔ 화면 맨 위에 그대로 띄울 것 — 양쪽이 어긋난 자리. */
  problems: string[];
  /** ⚪ 못 쟀다 — 목록 자체를 만들 수 없었던 이유. `null` 이면 **잰 것**이다. */
  unmeasured: string | null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ── 주행 결과(`tc-run`) ── **fail 목록과 판정** 화면이 받는 모양.
 *
 * ⛔⛔ **여기서 계약을 다시 정의하지 않았다.** 원천은 `qa/src/run/contract.ts` 이고,
 * 이 칸들은 `tc-run … --json` 이 stdout 으로 뱉는 **전선 모양의 거울**이다.
 * 값의 뜻(무엇을 검증으로 세는가 · 무엇이 판단인가)은 전부 그 파일이 정하고,
 * ⛔ 화면은 **그 셈을 다시 하지 않는다** — 두 자리에서 세면 언젠가 갈리고,
 * 갈린 뒤에는 어느 쪽이 사실인지 아무도 모른다(`BlankCounter` 가 같은 이유로 그렇게 한다).
 *
 * ⚠️ 그래서 이 화면이 스스로 하는 일은 **셈이 아니라 대조**다: 도구가 「끝났다」고 했는데
 * 화면에 보이는 fail 에 판단이 없으면 **끝났다고 말하지 않는다**(`@lib/run-judge` 의 `disagreements`).
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * TC 가 어디서 나왔는가.
 * ⛔ `derived-from-code`·`unknown` 은 **검증이 아니다** — 구현을 읽고 쓴 TC 는 정의상 통과한다.
 */
export type CaseOrigin = 'policy' | 'human' | 'derived-from-code' | 'unknown';

/** ⛔ 2상태(passed/failed)가 아니다 — `unmeasured` 를 접으면 **못 잰 것이 통과로 세어진다.** */
export type CaseStatus = 'passed' | 'failed' | 'unmeasured';

/** 누구 탓인가. 안 가르면 자동 수정이 **환경 탓을 코드에서** 고치려 든다. */
export type Attribution = 'star' | 'galaxy' | 'environment' | 'unknown';

/** 판단의 종류는 셋뿐이다 — 고쳤다 · 테스트가 틀렸다 · 받아들인다. */
export type VerdictKind = 'fixed' | 'test-wrong' | 'accepted';

export interface IPrecondition {
  id: string;
  /** ⛔ `true` 만 「섰다」다. `null` 은 **확인 못 했다** — `false` 와 함께 ⚪ 로 접힌다. */
  ok: boolean | null;
  detail?: string;
}

export interface ICaseEvidence {
  url?: string | null;
  httpStatus?: number | null;
  screenshot?: string | null;
}

export interface ICaseVerdict {
  kind: VerdictKind;
  /** ⛔ `accepted` 는 사유가 짧으면 판단이 아니다 — **길이는 도구가 잰다**(최소 30자). */
  why: string;
}

/** 도구가 접고 센 뒤의 케이스 한 건. */
export interface IRunCase {
  id: string;
  origin: CaseOrigin;
  originRef?: string | null;
  status: CaseStatus;
  attribution: Attribution;
  evidence?: ICaseEvidence;
  /** ⛔ `null` 이면 **판단하지 않음.** 「빈 객체」와 구별한다. */
  verdict: ICaseVerdict | null;
  flaky?: boolean;
  /** ⛔ **검증 분모에 드는가.** 구현에서 나왔거나 못 쟀으면 안 든다 — 화면이 갈라 그린다. */
  countsAsVerification: boolean;
  /** 전제가 안 서서 ⚪ 로 접힌 케이스의 **원래 상태**. 잃지 않으려고 도구가 따로 적는다. */
  foldedFrom?: CaseStatus;
  unmeasuredReason?: string;
}

/** Playwright 어휘 그대로 — 옮겨 적으면서 뜻이 바뀌는 것을 막는다. */
export interface IRunStats {
  total: number;
  expected: number;
  unexpected: number;
  skipped: number;
  flaky: number;
}

export interface IRunVerification {
  /** ⛔ **분모.** 이 수가 0이면 그 주행은 아무것도 검증하지 않았다. */
  denominator: number;
  /** 분모에서 뺀 것 — 합치면 「0건」의 뜻을 잃는다. */
  excluded: {
    derivedFromCode: number;
    unknownOrigin: number;
    unmeasured: number;
  };
  /** 자기 채점 케이스의 id — **이름을 불러야 지워진다.** */
  selfScoringIds: string[];
}

/** 판단이 필요한데 안 한 케이스 하나. `reason` 은 **도구의 문장 그대로** 쓴다. */
export interface IUnjudgedCase {
  id: string;
  attribution: Attribution;
  reason: string;
}

export interface IRunDone {
  /** ⛔ **「fail 0」이 아니다.** 판단하지 않은 fail 이 0건일 때만 `true`. */
  done: boolean;
  /** `0` 끝났다 / `1` 판단하지 않은 fail 이 있다 / `3` **못 쟀다**(전제·분모). */
  exitCode: number;
  unjudged: IUnjudgedCase[];
  /** 실패는 아니지만 **자동 수정이 못 다루는 것** — 탓을 못 가른 fail 의 id. */
  unattributed: string[];
  reason: string;
}

/** `tc-run … --json` 의 stdout 전체. */
export interface IRunPayload {
  tool: 'tc-run';
  ran: boolean;
  preconditions: IPrecondition[];
  /** ⛔ **케이스보다 이것을 먼저 보라.** `false` 면 그 주행의 케이스는 전부 ⚪ 다. */
  measurable: boolean;
  unmeasurableBecause: string[];
  stats: IRunStats;
  verification: IRunVerification;
  cases: IRunCase[];
  done: IRunDone;
  /** ⛔ 도구가 **안 재는 것**. 화면이 「다 쟀다」로 읽지 않게 그대로 적는다. */
  notMeasured?: string;
}

/**
 * 서버가 도구를 **부르고 나른** 결과 — `POST /api/runs` 의 답.
 *
 * ⛔ 서버는 판정을 만들지 않는다(`server/src/run-result.ts` 머리말). 여기 실려 오는 `report` 는
 * `tc-run … --json` 의 **stdout 그대로**이고, 화면은 그것을 `IRunPayload` 로 읽는다.
 * ⛔ `report` 가 `null` 인 것은 **「결과가 없다」가 아니라 「못 받았다」**다 — 그때 `unmeasured` 에
 * 이유가 있고, 화면은 ⚪ 로 그린다.
 */
export type RunShape = 'contract' | 'playwright' | 'unknown';

export interface IRunToolTrace {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/**
 * 서버가 **남긴** 주행 한 건.
 *
 * ⛔⛔ 이 칸이 없으면 **사람의 판정이 화면 밖으로 못 나간다.** 판정을 적으려면 그 판정이
 * 어느 주행에 붙는지를 알아야 하는데, 그 주소가 `id` 다. `POST /api/runs` 가 이것을 준다.
 */
export interface IRunMetaView {
  id: string;
  receivedAt: string;
  receivedShape: RunShape;
  from: string | null;
  /**
   * 판정을 붙여 **다시 쟀는가.** `true` 면 위 `shape` 는 `contract` 다 —
   * 원문이 Playwright 였어도 판정을 붙일 칸이 계약 모양에만 있기 때문이다.
   */
  remeasured: boolean;
}

/**
 * **판정이 붙은 채로 다시 잰 주행** — `GET /api/runs/:id` · `POST /api/runs/:id/verdict` 의 답.
 *
 * ⭐ 서버는 「판단하지 않은 fail 이 하나 줄었다」를 **계산하지 않는다.** 저장해 둔 케이스에
 * 판정을 붙여 **도구를 다시 부르고** 그 답을 그대로 나른다 — 그래서 화면의 수와 관문의 수가
 * 갈리지 않는다. ⛔ 화면도 다시 세지 않는다.
 */
/**
 * 목록에 뜨는 주행 한 줄 — `GET /api/runs`.
 *
 * ⛔⛔ **여기에는 「끝났는가」가 없다. 없는 게 맞다.** 서버가 그 목록에 붙여 보내는 말 그대로:
 *   「이 목록은 「끝났는가」를 말하지 않는다 — 그 답은 주행을 **열어 다시 재야** 나온다.」
 * ⇒ 화면은 목록에서 **판단하지 않은 fail 의 수를 알 수 없다.** 그 자리에 `0` 을 찍으면
 *   「이 주행은 끝났다」는 거짓말이 된다. **`⚪` 를 찍어야 한다**(`CountBadge`).
 *
 * ⚠️ `verdictsRecorded` 를 그 수로 **대신 쓰지 마라.** 그건 **적힌 판정의 수**이지
 * 「판단으로 세어진 수」가 아니다 — 사유가 짧은 `accepted` 는 저장은 되되 세어지지 않는다.
 * 둘을 같은 칸에 쓰면 화면이 「3건 판단함」이라고 말하는데 관문은 「1건 남았다」고 말하게 된다.
 */
export interface IRunListItem extends Omit<IRunMetaView, 'remeasured'> {
  /** ⛔ **적힌 수**다. 「판단으로 세어진 수」가 아니다. */
  verdictsRecorded: number;
  verdictsCleared: number;
}

export interface IJudgedRun extends IRunReceipt {
  id: string;
  run: IRunMetaView;
}

export interface IRunReceipt {
  /** ⭐ 도구의 JSON 그대로. ⛔ `null` 은 못 받았다 — 화면이 빈 목록으로 접지 않는다. */
  report: unknown;
  /** 서버가 본문을 어떤 모양으로 읽어 도구에 넘겼나. **판정이 아니라 경로**다. */
  shape: RunShape;
  /** ⚪ 못 쟀다 — 이유. `null` 이면 도구가 답한 것이다. ⛔ ❌(잰 빨강)와 다른 말이다. */
  unmeasured: string | null;
  /** `0` 끝났다 · `1` 판단하지 않은 fail · `3` 못 쟀다 · 그 밖/`null` = 뜻을 모른다. */
  exitCode: number | null;
  /** 서버가 알아챈 것(빌드가 낡았다 등). ⛔ 판정이 아니다 — 화면이 고쳐 적지 않는다. */
  notes: string[];
  tool: IRunToolTrace;
  /**
   * ⛔ **`null` 이면 주행을 못 남긴 것이다** — 잰 결과는 멀쩡한데 **판정을 붙일 자리가 없다.**
   * 그 둘은 다른 사실이라 화면이 갈라 말해야 한다(⚪ 로 접지도, 조용히 숨기지도 않는다).
   * ⚠️ `undefined` 는 「이 답에는 그 칸이 안 온다」다(도구 JSON 을 화면이 그대로 그리는 길).
   */
  id?: string | null;
  run?: IRunMetaView | null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ── 첫 칸: 저장소를 받아 와 은하로 들인다 ──
 *
 * ⛔⛔ **서버에는 이 자리가 있었는데 화면에서 부르는 곳이 하나도 없었다**(실측:
 * `grep -rn "api/clones\|api/adopt" web/src` → 0줄). 사용자의 계획은 「우주를 깔고
 * **화면을 띄우고 깃 주소를 입력하고**」로 시작하는데, 그 첫 칸이 **CLI 를 아는 사람만**
 * 밟을 수 있었다. 화면에 없으면 아무도 안 쓴다 — 이 저장소가 첫 화면에서 이미 겪은 일이다.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 저장소를 받아 온 결과 — `POST /api/clones`.
 *
 * ⛔ **`ok:false` 는 오류가 아니라 결과다.** 「자격이 없다」·「그런 저장소가 없다」는
 * 제품이 깨진 것이 아니라 **재 본 결과**다. 서버가 그래서 4xx 를 안 준다(200 + `ok:false`).
 * ⇒ 화면도 빨간 오류 박스로 그리지 않는다.
 */
export interface ICloneResult {
  /** 도구가 실제로 끝난 코드. ⛔ 0 이 아니면 **받아 오지 못한 것**이다. */
  exitCode: number | null;
  ok: boolean;
  /**
   * 시간 제한에 끊겼는가.
   * ⛔⛔ **이건 「못 받았다」가 아니라 「못 쟀다」다**(⚪). 큰 저장소는 5분을 넘길 수 있고,
   * 그때 화면이 ❌ 로 그리면 사람은 **없는 실패를 고치러 간다.**
   */
  killed: boolean;
  /** 도구가 사람에게 한 말 — ⛔ **그대로** 나른다. 서버도 화면도 요약하지 않는다. */
  say: string;
  /** 받아 온 자리(성공했을 때만). */
  into: string | null;
  /** 좌표 초안 파일(도구가 만들었을 때만). ⛔ `null` 이면 들일 것이 없다. */
  draft: string | null;
}

/**
 * 초안을 은하로 들인 결과 — `POST /api/adopt`.
 *
 * ⛔ 여기서도 **`ok:false` 는 결과다** — 「`TODO:` 가 7곳 남았다」·「이미 있는 은하다」.
 * 고쳐야 할 것은 코드가 아니라 **초안**이고, 그건 사람이 채운다(§9).
 */
export interface IAdoptResult {
  exitCode: number | null;
  ok: boolean;
  /** ⛔ 「못 들였다」가 아니라 **「못 쟀다」**다(⚪). */
  killed: boolean;
  /** 도구가 사람에게 한 말 — ⛔ **그대로** 나른다. */
  say: string;
}

/**
 * ── 첫 칸 ⓪ ── **이 기계의 git 이 아는 저장소 하나.**
 *
 * ⛔ 이 모양은 화면이 정하지 않았다 — `bin/repos.mjs` 가 내는 것을 **그대로** 받는다.
 *    화면에서 이름을 바꾸면 도구와 화면이 갈리고, 갈린 뒤엔 어느 쪽이 사실인지 아무도 모른다.
 */
export interface IRepo {
  nameWithOwner: string;
  url: string;
  visibility: string;
  isFork: boolean;
  isArchived: boolean;
  updatedAt: string;
  description: string;
}

/**
 * **고를 수 있는 저장소 목록.**
 *
 * ⛔⛔ `truncated` 가 이 형에서 가장 중요한 칸이다. `gh` 는 기본으로 위에서 몇 개만 잘라 온다 —
 *    그걸 안 보여 주면 **잘린 목록이 전부인 척**한다. 「내 레포가 여기 없다」고 느낀 사람은
 *    화면이 고장 난 줄 알지, 목록이 잘렸다고 생각하지 않는다(§8 — 늘 분모를 지고 다닌다).
 * ⛔ 토큰은 **이 형에 칸 자체가 없다.** 도구가 로그를 가리는 것과 별개로, 나를 곳이 없어야 한다.
 */
export interface IRepoListData {
  account: string | null;
  host: string | null;
  scopes: string | null;
  owner: string | null;
  limit: number;
  count: number;
  /** ⛔ true 면 **이게 전부가 아니다.** 화면은 반드시 그 사실을 말한다. */
  truncated: boolean;
  repos: IRepo[];
}

/**
 * ⛔ `ok:false` 는 「레포가 없다」가 **아니다** — 「**못 쟀다**」다(⚪).
 *    `gh` 가 없거나 로그인이 안 됐을 때가 그것이고, 그때 빈 목록을 그리면
 *    사람은 **없는 사실**(레포가 하나도 없다)을 믿는다.
 */
export interface IRepoListResult {
  ok: boolean;
  data: IRepoListData | null;
  say: string;
  exitCode: number | null;
}

/** TC 양식 파일 하나 — ⛔ 이름도 도구가 지은 것이다. 화면이 짓지 않는다. */
export interface ITcTemplateFile {
  name: string;
  text: string;
}

export interface ITcTemplateResult {
  ok: boolean;
  format: 'tsv' | 'csv';
  /** ⛔ **둘 다** 온다. 전제 양식을 빼고 채우면 「전제 0개」가 되고, 그건 통과가 아니라 못 쟀다(3)다. */
  files: ITcTemplateFile[];
  say: string;
  exitCode: number | null;
}

/**
 * **채워 올린 TC 를 돌린 결과.**
 *
 * ⛔⛔ `ok:false` 를 전부 ❌ 로 그리면 안 된다. 이 도구의 계약은 세 갈래다:
 *   `exitCode 0` — 끝났다(**「fail 0」이 아니라 「판단하지 않은 fail 0」**)
 *   `exitCode 1` — 판단하지 않은 fail 이 있다 ❌
 *   `exitCode 3` — **못 쟀다** ⚪ (전제가 안 섰다 · 검증 분모가 0이다 · 양식을 못 읽었다)
 * ⇒ `unmeasured` 가 그 셋째 갈래다. 이걸 ❌ 로 그리면 사람은 **없는 실패**를 고치러 간다.
 */
export interface ITcRunResult {
  ok: boolean;
  unmeasured: boolean;
  exitCode: number | null;
  killed: boolean;
  /** 도구가 `--json` 으로 낸 것 그대로. ⛔ 화면이 모양을 바꾸지 않는다. */
  report: unknown;
  say: string;
}
