/**
 * 16컬럼 시트 스펙 JSON 파서.
 *
 * 입력은 `qa-workflow` 의 `create-from-template --spec` 이 받는 그 스펙이다:
 * `{ title, path, project, components: [{ tab, desc, rows: [...] }] }`
 *
 * ⚠️ 이 파서의 핵심은 **액션 그룹**이다. 판별 키는 `no` 가 아니라
 *    **`content`(테스트항목) 문자열 완전 일치**다. 그룹을 쪼개면 워커가 같은 액션을
 *    여러 번 수행해 데이터가 파손되고 후속 행이 오판정된다.
 */

export interface ISheetRow {
  /** 탭 안의 0-based 위치 */
  index: number;
  major: string;
  middle: string;
  minor: string;
  sub: string;
  precondition: string;
  /** 테스트항목 */
  content: string;
  /** 기대결과 */
  expected: string;
  reviewComment: string;
  result: string;
  issueSummary: string;
  /** CLI 가 채워야 하는 값이 스펙에 들어 있으면 여기 담긴다 */
  presentIds: string[];
}

/** 연속한 동일 `content` 행들 — 액션 1회 + 검증 N개 */
export interface IActionGroup {
  content: string;
  rowIndexes: number[];
}

export interface ISheetComponent {
  tab: string;
  desc: string;
  rows: ISheetRow[];
  groups: IActionGroup[];
}

export interface IParsedSheet {
  file: string;
  title: string;
  components: ISheetComponent[];
  /**
   * 이어 붙이는 페이로드인가.
   *
   * 입력의 **형태가 이미 다르다** — 별도 필드가 필요 없다:
   * - `create-from-template --spec` → `{title, path, project, components[]}` **객체**. 항상 새 시트를 만들므로 선행 행이 없다
   * - `append-rows --rows`          → `[...]` **행 배열**. 시트의 마지막 행을 CLI 가 직접 이어받는다
   */
  isPartial: boolean;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const ID_FIELDS = ['scenarioId', 'tcId', 'no'] as const;

/**
 * 인용 구간 꼬리 마커 — G3-1.
 *
 * 인용은 **따옴표로 감싸지 않는다**(규격이 금지한다). 대신 뒤에 붙는 서술부로 식별한다.
 * 이 마커가 있으면 앞부분은 UI 원문이므로 어미·부사 검사에서 제외한다.
 */
const QUOTE_TAIL = /(문구\s*노출\s*됨|플레이스\s*홀더\s*문구\s*노출\s*됨|Toast\s*얼럿\s*노출\s*됨)$/;

export const hasQuoteSpan = (expected: string): boolean => QUOTE_TAIL.test(expected.trim());

/** 인용 구간과 가변 자리(`{{...}}`)를 걷어낸 **서술 구간**만 남긴다. 검사는 여기에만 건다. */
export const narrativeOf = (text: string): string => {
  const t = text.trim();
  const withoutVars = t.replace(/\{\{[^}]*\}\}/g, ' ');
  const tail = QUOTE_TAIL.exec(withoutVars);
  if (!tail) return withoutVars;
  // 번호 + 마커만 남기고 인용 본문을 지운다
  const number = leadingNumber(withoutVars) ?? '';
  return `${number} ${tail[0]}`;
};

/** 선행 번호 토큰 (`1.` · `1.1` · `1.1.1`). 없으면 undefined. */
export const leadingNumber = (text: string): string | undefined => {
  const m = /^\s*(\d+(?:\.\d+)*)\.?\s+/.exec(text);
  return m?.[1];
};

/** 번호 깊이 (`1` → 1, `1.1` → 2) */
export const numberDepth = (number: string): number => number.split('.').length;

/**
 * 번호 재시작 경계 — `소분류`(없으면 `중분류`) 그룹.
 *
 * ⚠️ 경계는 탭도 스펙도 아니다. 이 값이 바뀌는 지점마다 번호는 `1.` 로 돌아와야 한다.
 */
export const groupKeyOf = (row: ISheetRow): string =>
  row.minor.trim() !== '' ? `${row.major}|${row.middle}|${row.minor}` : `${row.major}|${row.middle}`;

/** 번호에서 최상위 자리 (`3.1` → 3) */
export const topLevelOf = (number: string): number => Number(number.split('.')[0]);

const toRow = (raw: Record<string, unknown>, index: number): ISheetRow => ({
  index,
  major: str(raw['major']),
  middle: str(raw['middle']),
  minor: str(raw['minor']),
  sub: str(raw['sub']),
  precondition: str(raw['precondition']),
  content: str(raw['content']),
  expected: str(raw['expected']),
  reviewComment: str(raw['reviewComment']),
  result: str(raw['result']),
  issueSummary: str(raw['issueSummary']),
  presentIds: ID_FIELDS.filter((field) => raw[field] !== undefined && raw[field] !== ''),
});

/** 연속한 동일 `content` 를 한 그룹으로 묶는다. 빈 `content` 는 묶지 않는다(G0 가 잡는다). */
const groupActions = (rows: ISheetRow[]): IActionGroup[] => {
  const groups: IActionGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.content === row.content && row.content !== '') {
      last.rowIndexes.push(row.index);
      continue;
    }
    groups.push({ content: row.content, rowIndexes: [row.index] });
  }
  return groups;
};

export const parseSheetSpec = (file: string, source: string): IParsedSheet => {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (error) {
    throw new Error(`스펙 JSON 을 읽지 못했다: ${(error as Error).message}`);
  }
  // 행 배열이면 `append-rows` 페이로드다 — 이어 붙이는 부분 스펙
  if (Array.isArray(json)) {
    const rows = json.map((r, i) => toRow((r ?? {}) as Record<string, unknown>, i));
    return {
      file,
      title: '',
      isPartial: true,
      components: [{ tab: '(append-rows)', desc: '', rows, groups: groupActions(rows) }],
    };
  }

  const root = (json ?? {}) as Record<string, unknown>;
  const rawComponents = Array.isArray(root['components']) ? root['components'] : [];

  const components: ISheetComponent[] = rawComponents.map((entry) => {
    const component = (entry ?? {}) as Record<string, unknown>;
    const rawRows = Array.isArray(component['rows']) ? component['rows'] : [];
    const rows = rawRows.map((r, i) => toRow((r ?? {}) as Record<string, unknown>, i));
    return {
      tab: str(component['tab']),
      desc: str(component['desc']),
      rows,
      groups: groupActions(rows),
    };
  });

  return { file, title: str(root['title']), components, isPartial: false };
};
