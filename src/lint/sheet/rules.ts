/**
 * 16컬럼 시트 스펙 정적 관문 — `qa-workflow` 의 TC 문장 작성 규격 G0~G7 을 기계로 내린다.
 *
 * 그쪽의 유일한 관문은 749줄 SKILL.md 끝의 **산문 체크리스트 15줄**이었다.
 * 산문 체크리스트는 모델이 바쁘면 흘린다 — 그쪽이 "다시 만든다면 바꿀 것" 1번으로 꼽은 자리다.
 *
 * ⛔ **여기서 재지 않는 것**(지식 베이스가 있어야 재는 것)은 조용히 통과시키지 않고
 *    ⚪ 로 이름을 부른다. 조용히 넘기면 "다 쟀다"로 읽힌다.
 */
import { err, unmeasured, type IFinding, type IRule } from '../core.js';
import {
  hasQuoteSpan,
  leadingNumber,
  narrativeOf,
  numberDepth,
  topLevelOf,
  type IParsedSheet,
  type ISheetComponent,
  type ISheetRow,
} from './parse.js';

/** G2 종결 동작명사 화이트리스트 */
const ACTION_NOUNS = [
  '확인', '선택', '동작', '입력', '설정', '진입', '저장', '삭제', '수정',
  '추가', '변경', '해제', '호출', '체크', '호버', '업로드', '다운로드',
] as const;
const ACTION_NOUN_RE = new RegExp(`(${ACTION_NOUNS.join('|')})$`);

/** G2 금지 어미 — 서술어로 끝나면 안 된다 */
const BANNED_PREDICATE_RE = /(할\s*수\s*있는지|하는지|되는지|본다|한다|합니다|해본다)/;

/** G3 허용 종결 */
const EXPECTED_TERMINAL_RE = /(됨|않음|노출|열림|닫힘|불가|없음)$/;

/** G7 차단 목록 — 서술 구간에만 적용한다 */
const BANNED_WORDS = [
  '정상적으로', '제대로', '올바르게', '적절히', '문제없이', '자연스럽게', '빠르게',
  '필요 시', '등등', '기타', '일부', '대부분',
  '잘 되는지', '이상 없는지', '괜찮은지', '깨지지 않는지',
  '해야 한다', '할 수 있다',
  '일 것으로 보임', '예상됨', '아마',
  '해당 값', '그것', '위 항목',
] as const;

/** G6-2 이모지 금지 — 시트 업로드 시 인코딩이 깨진다 */
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

/** G6-2 토글 표기 — `ON`/`OFF` 는 항상 대문자 */
const LOWER_TOGGLE_RE = /(?:^|[^A-Za-z])(?:[Oo]n\s*\/\s*[Oo]ff|[Oo]ff\s*\/\s*[Oo]n)(?:[^A-Za-z]|$)|(?:^|[^가-힣])(?:켬|끔)(?:[^가-힣]|$)/;

const at = (component: ISheetComponent, row: ISheetRow): string =>
  `${component.tab || '(탭 없음)'}#${row.index + 1}`;

/** 모든 (컴포넌트, 행) 을 훑는다 */
const eachRow = (
  sheet: IParsedSheet,
  fn: (component: ISheetComponent, row: ISheetRow) => IFinding[],
): IFinding[] =>
  sheet.components.flatMap((component) => component.rows.flatMap((row) => fn(component, row)));

export const sheetRules: Array<IRule<IParsedSheet>> = [
  {
    id: 'G0-empty-action',
    check: (sheet) =>
      eachRow(sheet, (c, row) =>
        row.content.trim() === ''
          ? [
              err(
                'G0-empty-action',
                '`테스트항목` 이 비어 있다',
                '행 단위로 격리 실행하므로 공란이면 수행 불가가 된다. 연속 행은 동일 문자열을 반복 기재한다',
                at(c, row),
              ),
            ]
          : [],
      ),
  },
  {
    id: 'G0-single-point',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const joins = (row.expected.match(/되며,/g) ?? []).length;
        return joins > 1
          ? [
              err(
                'G0-single-point',
                `한 행 \`기대결과\` 에 검증 포인트가 ${joins + 1}개다 (\`되며,\` ${joins}회)`,
                '1행 = 1 검증 포인트. 3개 이상이면 행을 분리한다 (연결은 2개까지)',
                at(c, row),
              ),
            ]
          : [];
      }),
  },
  {
    id: 'G1-number-binding',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        if (row.content.trim() === '') return [];
        const action = leadingNumber(row.content);
        const expected = leadingNumber(row.expected);
        if (action === undefined) {
          return [
            err(
              'G1-number-binding',
              '`테스트항목` 에 번호가 없다',
              '번호는 장식이 아니라 테스트항목 ↔ 기대결과 대응 관계의 표현이다',
              at(c, row),
            ),
          ];
        }
        if (expected === undefined) {
          return [
            err(
              'G1-number-binding',
              '`기대결과` 에 번호가 없다',
              '기대결과 번호가 없으면 어느 액션의 결과인지 기계가 못 잇는다',
              at(c, row),
            ),
          ];
        }
        if (expected !== action && !expected.startsWith(`${action}.`)) {
          return [
            err(
              'G1-number-binding',
              `\`기대결과\` 번호 ${expected} 가 \`테스트항목\` 번호 ${action} 을 접두로 갖지 않는다`,
              '기대결과 번호는 소속 테스트항목 번호로 시작해야 한다',
              at(c, row),
            ),
          ];
        }
        return [];
      }),
  },
  {
    id: 'G1-depth',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const out: IFinding[] = [];
        for (const [label, text] of [
          ['테스트항목', row.content],
          ['기대결과', row.expected],
        ] as const) {
          const number = leadingNumber(text);
          if (number !== undefined && numberDepth(number) > 3) {
            out.push(
              err(
                'G1-depth',
                `\`${label}\` 번호 ${number} 가 ${numberDepth(number)}단계다`,
                '최대 3단계. 그 이상 필요하면 중분류·소분류를 쪼갠다',
                at(c, row),
              ),
            );
          }
        }
        return out;
      }),
  },
  {
    id: 'G1-restart',
    check: (sheet) => {
      const out: IFinding[] = [];
      for (const component of sheet.components) {
        // 번호는 소분류(없으면 중분류) 그룹 단위로 1. 부터 재시작한다
        const seen = new Map<string, number[]>();
        for (const row of component.rows) {
          const number = leadingNumber(row.content);
          if (number === undefined) continue;
          const key = `${row.major}|${row.middle}|${row.minor}`;
          const tops = seen.get(key) ?? [];
          const top = topLevelOf(number);
          if (tops[tops.length - 1] !== top) tops.push(top);
          seen.set(key, tops);
        }
        for (const [key, tops] of seen) {
          const where = component.tab || '(탭 없음)';
          // 건너뜀·되돌아감은 확실한 위반이다 — 스펙이 부분이든 전체든 성립하지 않는다
          const broken = tops.some((top, i) => i > 0 && top !== (tops[i - 1] ?? 0) + 1);
          if (broken) {
            out.push(
              err(
                'G1-restart',
                `분류 [${key}] 의 테스트항목 번호가 이어지지 않는다: ${tops.join(', ')}`,
                '번호는 건너뛰거나 되돌아가지 않는다. 빠진 번호는 누락된 검증이다',
                where,
              ),
            );
            continue;
          }
          // 시작이 1이 아닌 것은 **위반이라 단정할 수 없다** — `append-rows` 로 이어 붙이는
          // 부분 스펙은 정당하게 중간 번호에서 시작한다. 전체 스펙인지 여기서는 못 잰다.
          if (tops[0] !== undefined && tops[0] !== 1) {
            out.push(
              unmeasured(
                'G1-restart',
                `분류 [${key}] 의 번호가 ${tops[0]} 부터 시작한다 — 전체 스펙인지 못 쟀다`,
                '전체 스펙이면 1부터여야 하지만, append-rows 로 이어 붙이는 부분 스펙이면 정상이다',
                where,
              ),
            );
          }
        }
      }
      return out;
    },
  },
  {
    id: 'G2-terminal-noun',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const body = narrativeOf(row.content).replace(/^\s*\d+(?:\.\d+)*\.?\s+/, '').trim();
        if (body === '') return [];
        return ACTION_NOUN_RE.test(body)
          ? []
          : [
              err(
                'G2-terminal-noun',
                `\`테스트항목\` 이 동작명사로 끝나지 않는다: "${body.slice(0, 40)}"`,
                `종결은 체언으로 끝낸다 (${ACTION_NOUNS.slice(0, 6).join('·')} 등 ${ACTION_NOUNS.length}종)`,
                at(c, row),
              ),
            ];
      }),
  },
  {
    id: 'G2-no-particle',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const out: IFinding[] = [];
        const body = narrativeOf(row.content);
        if (BANNED_PREDICATE_RE.test(body)) {
          out.push(
            err(
              'G2-no-particle',
              `\`테스트항목\` 에 금지 어미가 있다: "${body.slice(0, 40)}"`,
              '서술어 어미를 붙이지 않는다 (`~한다`·`~하는지 확인`·`~해본다`)',
              at(c, row),
            ),
          );
        }
        // 조사 검출은 을·를·에서만 본다 — 이·가는 `추가`·`참가` 같은 어절과 구별이 안 된다
        const particle = /[가-힣](을|를)\s|[가-힣]에서\s/.exec(body);
        if (particle) {
          out.push(
            err(
              'G2-no-particle',
              `\`테스트항목\` 에 조사가 있다: "${particle[0].trim()}"`,
              '조사(을·를·에서)는 쓰지 않는다. `{요소}를 선택` ❌ → `{요소} 선택` ⭕',
              at(c, row),
            ),
          );
        }
        return out;
      }),
  },
  {
    id: 'G3-terminal',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const body = row.expected.trim();
        if (body === '') {
          return [
            err(
              'G3-terminal',
              '`기대결과` 가 비어 있다',
              '검증할 것이 없는 행은 수행할 수 없다',
              at(c, row),
            ),
          ];
        }
        return EXPECTED_TERMINAL_RE.test(body)
          ? []
          : [
              err(
                'G3-terminal',
                `\`기대결과\` 종결이 규격 밖이다: "${body.slice(-24)}"`,
                '`됨`·`않음`·`노출`·`열림`·`닫힘`·`불가`·`없음` 중 하나로 끝나야 한다',
                at(c, row),
              ),
            ];
      }),
  },
  {
    id: 'G6-2-notation',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const out: IFinding[] = [];
        for (const [label, text] of [
          ['테스트항목', row.content],
          ['기대결과', row.expected],
          ['사전 조건', row.precondition],
        ] as const) {
          if (EMOJI_RE.test(text)) {
            out.push(
              err(
                'G6-2-notation',
                `\`${label}\` 에 이모지가 있다`,
                '시트 업로드 시 인코딩이 깨진다. 텍스트 라벨이나 위치 설명으로 대체한다',
                at(c, row),
              ),
            );
          }
          if (LOWER_TOGGLE_RE.test(text)) {
            out.push(
              err(
                'G6-2-notation',
                `\`${label}\` 의 토글 표기가 대문자가 아니다`,
                '`ON`/`OFF` 는 항상 대문자. `On`·`on`·`켬` 금지',
                at(c, row),
              ),
            );
          }
        }
        return out;
      }),
  },
  {
    id: 'G7-banned-words',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const out: IFinding[] = [];
        for (const [label, text] of [
          ['테스트항목', row.content],
          ['기대결과', row.expected],
          ['사전 조건', row.precondition],
        ] as const) {
          // 인용 구간(G3-1)은 검사 대상이 아니다 — 화면 문구가 `~합니다` 로 끝나는 것은
          // 규격 위반이 아니라 검증 대상이다
          const narrative = narrativeOf(text);
          for (const word of BANNED_WORDS) {
            if (narrative.includes(word)) {
              out.push(
                err(
                  'G7-banned-words',
                  `\`${label}\` 서술 구간에 금지 표현이 있다: "${word}"`,
                  '무엇이 정상인지 쓰라는 뜻이지, 정상이라고 쓰라는 뜻이 아니다',
                  at(c, row),
                ),
              );
            }
          }
        }
        return out;
      }),
  },
  {
    id: 'initial-values',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const out: IFinding[] = [];
        if (row.result !== '' && row.result !== 'Incomplete') {
          out.push(
            err(
              'initial-values',
              `\`Result\` 초기값이 "${row.result}" 다`,
              '전 행 `Incomplete` 여야 한다 — 초기값이자 재개 커서다. 미리 채우면 안 돈 행이 통과로 세어진다',
              at(c, row),
            ),
          );
        }
        if (row.issueSummary.trim() !== '') {
          out.push(
            err(
              'initial-values',
              '`Issue Summary` 가 채워져 있다',
              '전 행 공란이어야 한다 — 수행 결과가 들어갈 자리다',
              at(c, row),
            ),
          );
        }
        return out;
      }),
  },
  {
    id: 'no-ids-in-spec',
    check: (sheet) =>
      eachRow(sheet, (c, row) =>
        row.presentIds.length === 0
          ? []
          : [
              err(
                'no-ids-in-spec',
                `스펙에 CLI 가 채울 값이 들어 있다: ${row.presentIds.join(', ')}`,
                '`scenarioId`·`tcId`·`no` 는 CLI 가 규약대로 채운다. 직접 넣으면 연번이 어긋날 위험만 진다',
                at(c, row),
              ),
            ],
      ),
  },
  {
    id: 'tab-placeholder',
    check: (sheet) =>
      sheet.components.flatMap((component) =>
        component.tab.trim() === '' || /^컴포넌트\s*\d*$/.test(component.tab.trim())
          ? [
              err(
                'tab-placeholder',
                `탭 이름이 자리표시자다: "${component.tab}"`,
                '탭 이름은 실제 컴포넌트명이어야 한다',
                component.tab || '(탭 없음)',
              ),
            ]
          : [],
      ),
  },
];

/**
 * 지식 베이스가 있어야 재는 것 — **재지 않았다고 말한다.**
 *
 * 조용히 통과시키면 "다 쟀다"로 읽힌다. 지식 경로가 주어지면 그때 잰다.
 */
export const knowledgeRules: Array<IRule<IParsedSheet>> = [
  {
    id: 'G3-1-quote-fidelity',
    check: (sheet) => {
      const quoted = sheet.components.reduce(
        (sum, c) => sum + c.rows.filter((r) => hasQuoteSpan(r.expected)).length,
        0,
      );
      return quoted === 0
        ? []
        : [
            unmeasured(
              'G3-1-quote-fidelity',
              `인용 구간 ${quoted}건의 UI 원문 대조를 하지 않았다`,
              '원문이 지식의 표기와 1글자라도 다르면 그 TC 는 무의미하다. 지식 경로가 있어야 잰다',
            ),
          ];
    },
  },
  {
    id: 'G5-category-dictionary',
    check: () => [
      unmeasured(
        'G5-category-dictionary',
        '분류값(대·중·소·세분류)이 사전에 있는 값인지 확인하지 않았다',
        'distinct 목록이 있어야 잰다',
      ),
    ],
  },
  {
    id: 'G6-1-name-grounding',
    check: () => [
      unmeasured(
        'G6-1-name-grounding',
        '명칭이 도메인 지식에 근거하는지 확인하지 않았다',
        '형식에 맞추려고 없는 요소·문구를 지어내도 이 관문은 못 잡는다',
      ),
    ],
  },
  {
    id: 'G4-precondition-judgment',
    check: () => [
      unmeasured(
        'G4-precondition-judgment',
        '`사전 조건` 에 자명한 전제가 섞였는지 판단하지 않았다',
        '자명 여부는 도메인 판단이라 형식으로 못 가른다',
      ),
    ],
  },
];

export const lintSheet = (sheet: IParsedSheet): IFinding[] => [
  ...sheetRules.flatMap((rule) => rule.check(sheet)),
  ...knowledgeRules.flatMap((rule) => rule.check(sheet)),
];
