/**
 * **TC 양식의 칸 — 계약에서 끌어온다.** 사람이 내려받아 채우는 표의 유일한 정의다.
 *
 * ## ⛔ 왜 칸 이름을 손으로 적지 않는가 (관측 법칙 §9)
 *
 * 양식과 계약이 **두 벌**이 되면 조용히 갈린다. 계약이 `attribution` 을 하나 늘려도
 * 양식은 모르고, 사람은 **계약이 안 읽는 칸**을 정성껏 채운다 — 화면은 「읽었다」로 조용하다.
 * ⇒ 칸 이름은 `../run/contract.ts` 의 **타입에서 끌어온다.** 아래 `satisfies` 들이
 * 컴파일 시점에 강제한다:
 *   · `Record<CaseColumn, …>` — 계약에 칸이 하나 늘면 **빌드가 깨진다**(안 적으면 못 짓는다).
 *   · `Record<CaseOrigin, 0>` 등 — 계약의 값 어휘가 바뀌면 **빌드가 깨진다.**
 * ⚠️ 값 어휘는 런타임에 필요하다(사람이 오타를 치면 거부해야 하니까). 타입은 런타임에 없으므로
 * 문자열을 적되 **계약과 같은지를 컴파일러가 대조**하게 만든 것이다 — 열거가 아니라 **대조**다.
 *
 * ## ⛔ 왜 오타를 조용히 넘기면 안 되나
 *
 * `origin: polciy` 처럼 오타가 난 값을 그대로 흘리면, 계약의
 * `NON_VERIFYING_ORIGINS.includes('polciy')` 가 `false` 라서 그 케이스는 **검증 분모에
 * 들어간다.** 오타 하나가 「검증했다」를 늘린다. ⇒ 모르는 값은 **거부한다.**
 *
 * ## 이 파일이 **안 정하는 것** (§8)
 *   · 「끝났는가」·「판단하지 않은 fail」·「검증 분모」는 여기서 안 센다. 계약(`../run/`)이 센다.
 *   · 양식에 `title` 칸이 하나 있는데 **계약이 모르는 칸**이다 — 사람이 읽으라고 있고
 *     판정에 안 쓴다. 계약 칸과 섞이지 않게 따로 둔다.
 */
import {
  MIN_ACCEPTED_WHY,
  NON_VERIFYING_ORIGINS,
  type Attribution,
  type CaseOrigin,
  type CaseStatus,
  type ICaseInput,
  type IEvidence,
  type IPrecondition,
  type IVerdict,
  type VerdictKind,
} from '../run/contract.js';
import { delimiterOf, formatRow, type SvFormat } from './sv.js';

/** 중첩 칸은 `점`으로 편다 — 표에는 층이 없다. ⛔ 이름은 전부 계약의 키에서 온다. */
export type CaseColumn =
  | Exclude<keyof ICaseInput, 'evidence' | 'verdict'>
  | `evidence.${keyof IEvidence}`
  | `verdict.${keyof IVerdict}`;

export type PreconditionColumn = keyof IPrecondition;

/** 계약이 모르는 칸. **판정에 안 쓴다** — 사람이 무슨 TC 인지 알아보라고 있다. */
export const HUMAN_COLUMNS = ['title'] as const;

const keysOf = <T extends Record<string, unknown>>(o: T): Array<keyof T & string> =>
  Object.keys(o) as Array<keyof T & string>;

/* ── 값 어휘 — 계약의 유니온과 **컴파일러가 대조한다** ───────────────────── */

export const ORIGIN_VALUES = keysOf(
  { policy: 0, human: 0, 'derived-from-code': 0, unknown: 0 } satisfies Record<CaseOrigin, 0>,
);
export const STATUS_VALUES = keysOf(
  { passed: 0, failed: 0, unmeasured: 0 } satisfies Record<CaseStatus, 0>,
);
export const ATTRIBUTION_VALUES = keysOf(
  { star: 0, galaxy: 0, environment: 0, unknown: 0 } satisfies Record<Attribution, 0>,
);
export const VERDICT_VALUES = keysOf(
  { fixed: 0, 'test-wrong': 0, accepted: 0 } satisfies Record<VerdictKind, 0>,
);
/** 전제의 `ok` 는 3상태다 — `null`(확인 못 했다)을 빈칸으로 쓰지 않는다. 이름을 준다. */
export const OK_VALUES = ['yes', 'no', 'unknown'] as const;

/* ── 칸 — `satisfies Record<…>` 가 **빠짐**을 막는다 ────────────────────── */

interface IColumnSpec {
  required: boolean;
  help: string;
  values?: readonly string[];
}

const CASE_COLUMN_SPEC = {
  id: { required: true, help: 'TC 번호. 주행(Playwright) 쪽 제목의 `TC-…` 와 같아야 짝이 맞는다' },
  origin: {
    required: true,
    values: ORIGIN_VALUES,
    help:
      `이 TC 가 어디서 나왔나. ⛔ ${NON_VERIFYING_ORIGINS.join(' · ')} 는 ` +
      '**검증 분모에서 빠진다** — 통과해도 아무것도 증명하지 않는다(계약이 그렇게 정한다)',
  },
  originRef: { required: false, help: '출처의 자리. 정책서 파일#줄 · 티켓 번호 · 회의록 — 되짚을 수 있게' },
  status: { required: true, values: STATUS_VALUES, help: '결과. ⚪(unmeasured)는 통과가 아니다 — 못 잰 것이다' },
  attribution: {
    required: true,
    values: ATTRIBUTION_VALUES,
    help: '누구 탓인가. 안 가르면 자동 수정이 환경 탓을 코드에서 고치려 든다',
  },
  flaky: { required: false, values: ['yes', 'no'], help: '재시도에서 갈렸나. 갈렸으면 통과로도 실패로도 안 센다' },
  unmeasuredReason: { required: false, help: '이미 ⚪ 인 케이스가 **왜** ⚪ 인가' },
  'evidence.url': { required: false, help: '증거 — 그때 그 화면의 주소' },
  'evidence.httpStatus': { required: false, help: '증거 — HTTP 상태 코드(숫자)' },
  'evidence.screenshot': { required: false, help: '증거 — 스크린샷 파일 경로' },
  'verdict.kind': {
    required: false,
    values: VERDICT_VALUES,
    help: 'fail 을 어떻게 판단했나. **비우면 「판단하지 않았다」** — 그러면 안 끝난 것이다',
  },
  'verdict.why': {
    required: false,
    help: `왜 그렇게 판단했나. accepted 는 **${MIN_ACCEPTED_WHY}자 이상** — 사유 없는 accepted 는 판단이 아니라 치운 것이다`,
  },
} satisfies Record<CaseColumn, IColumnSpec>;

const PRECONDITION_COLUMN_SPEC = {
  id: { required: true, help: '전제의 이름. 예: 로그인세션 · 시드데이터 · 브라우저바이너리' },
  ok: {
    required: true,
    values: OK_VALUES,
    help:
      '섰나. **yes 만 섰다.** no·unknown 이면 이 주행의 케이스는 **전부 ⚪ 로 접힌다** — ' +
      '❌ 로 세면 제품 결함이 아닌 것을 고치려 든다',
  },
  detail: { required: false, help: '무엇을 어떻게 확인했나' },
} satisfies Record<PreconditionColumn, IColumnSpec>;

export const CASE_COLUMNS = keysOf(CASE_COLUMN_SPEC);
export const PRECONDITION_COLUMNS = keysOf(PRECONDITION_COLUMN_SPEC);
export const specOfCaseColumn = (name: CaseColumn): IColumnSpec => CASE_COLUMN_SPEC[name];
export const specOfPreconditionColumn = (name: PreconditionColumn): IColumnSpec =>
  PRECONDITION_COLUMN_SPEC[name];

/** 양식의 머리 줄 — 계약 칸 + 사람 칸. ⛔ 순서는 위 정의의 순서다. */
export const caseHeader = (): string[] => [...CASE_COLUMNS, ...HUMAN_COLUMNS];
export const preconditionHeader = (): string[] => [...PRECONDITION_COLUMNS];

/* ── 양식 렌더 ─────────────────────────────────────────────────────────── */

/** 주석 줄은 **글자 그대로** 쓴다 — 칸으로 감싸면 사람이 읽을 것이 따옴표투성이가 된다. */
const comment = (lines: string[]): string[] => lines.map((line) => `# ${line}`.trimEnd());

/**
 * 읽는 규칙을 **양식 자신이 들고 다닌다.** 따옴표·줄바꿈에서 조용히 깨지는 자리라
 * 문서에만 적으면 채우는 사람이 못 본다.
 */
const quotingHelp = (format: SvFormat): string[] => {
  const what = format === 'tsv' ? '탭' : '쉼표';
  return [
    `칸 안에 ${what}·줄바꿈·따옴표를 넣으려면 그 칸을 "따옴표"로 감싸라. 안의 따옴표는 ""로 두 번 적어라.`,
    '  예) "1) 로그인한다 ⏎ 2) 잠금 문구를 본다 — 문구는 ""5회 실패"" 다"   (⏎ 자리에 진짜 줄바꿈을 넣어도 된다)',
    '엑셀에서 「CSV UTF-8」로 내보내면 그대로 읽힌다(BOM·CRLF 는 알아서 지운다). ⛔ .xlsx 는 못 읽는다.',
    '`#` 로 시작하는 줄은 설명이다 — 안 읽는다. 지워도 되고 둬도 된다.',
  ];
};

/** 예시 줄 — 표 모양 그대로 쓰되 `#` 을 붙여 **안 읽히게** 한다. 지우고 채우면 그대로 데이터다. */
const example = (cells: string[], format: SvFormat): string =>
  `# ${formatRow(cells, delimiterOf(format))}`;

export const renderCaseTemplate = (format: SvFormat): string => {
  const lines: string[] = [
    ...comment([
      'TC 양식 — 케이스. ⛔ 머리 줄의 칸 이름을 고치지 마라: 계약(qa/src/run/contract.ts)의 이름 그대로다.',
      '   이름을 바꾸면 「모르는 칸」으로 거부된다. 조용히 갈리는 것보다 낫다.',
      '',
      ...quotingHelp(format),
      '',
      '칸:',
      ...CASE_COLUMNS.map((name) => {
        const spec = specOfCaseColumn(name);
        const values = spec.values ? `  값: ${spec.values.join(' | ')}` : '';
        return `  ${name}${spec.required ? ' (필수)' : ''} — ${spec.help}${values}`;
      }),
      ...HUMAN_COLUMNS.map((name) => `  ${name} — 계약이 **안 읽는 칸**이다. 사람이 알아보라고 있다`),
      '',
      '아래 한 줄은 예시다(`#` 로 시작하니 안 읽는다). 지우고 채워라.',
    ]),
    formatRow(caseHeader(), delimiterOf(format)),
    example([
      'TC-001',
      'policy',
      'docs/정책서.md#L42',
      'failed',
      'star',
      'no',
      '',
      'https://example.test/login',
      '200',
      '',
      'accepted',
      '잠금 문구가 기획과 다르지만 다음 스프린트 문구 확정 뒤에 고치기로 팀이 합의했다',
      '로그인 5회 실패하면 잠긴다',
    ], format),
  ];
  return `${lines.join('\n')}\n`;
};

export const renderPreconditionTemplate = (format: SvFormat): string => {
  const lines: string[] = [
    ...comment([
      'TC 양식 — 전제. ⛔ **전제가 케이스보다 먼저다.**',
      '   하나라도 안 서면 그 주행의 케이스는 전부 ⚪ 로 접힌다 — ❌ 가 아니다.',
      '   ⛔ 이 파일을 안 내면 「전제 0개」다. 그것은 통과가 아니라 **못 잰 것**이다(종료코드 3).',
      '',
      ...quotingHelp(format),
      '',
      '칸:',
      ...PRECONDITION_COLUMNS.map((name) => {
        const spec = specOfPreconditionColumn(name);
        const values = spec.values ? `  값: ${spec.values.join(' | ')}` : '';
        return `  ${name}${spec.required ? ' (필수)' : ''} — ${spec.help}${values}`;
      }),
      '',
      '아래 두 줄은 예시다(`#` 로 시작하니 안 읽는다). 지우고 채워라.',
    ]),
    formatRow(preconditionHeader(), delimiterOf(format)),
    example(['로그인세션', 'yes', '주행 시작 시각에 /me 가 200 이었다'], format),
    example(['시드데이터', 'unknown', '확인 못 했다 — 확인 못 한 것은 「섰다」가 아니다'], format),
  ];
  return `${lines.join('\n')}\n`;
};

/** 양식 파일 이름. ⛔ 한 자리에서만 정한다 — 관문도 이 이름으로 대조한다. */
export const templateFileName = (which: 'cases' | 'preconditions', format: SvFormat): string =>
  `tc-${which}.${format}`;
