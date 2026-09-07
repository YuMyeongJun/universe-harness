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
  groupKeyOf,
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

/** G4 사전조건 종결 — 상태 명사로 끝난다 */
const PRECONDITION_TERMINAL_RE = /(상태|ON|OFF|로그인|로그아웃|있음|없음|입력|미입력|선택|미선택|권한|등록|미등록)$/;

/** G4 자명한 전제 — 적을 이유가 없다 */
const OBVIOUS_PRECONDITIONS = ['브라우저 실행', '인터넷 연결', '네트워크 연결', '전원 켜', 'PC 켜'] as const;

/** G5 분류 컬럼 길이 상한 */
const CATEGORY_LIMITS = [
  { field: 'major', label: '대분류', max: 10 },
  { field: 'middle', label: '중분류', max: 15 },
  { field: 'minor', label: '소분류', max: 15 },
  { field: 'sub', label: '세분류', max: 15 },
] as const;

/** G5 분류는 명사구다 — 문장부호·서술어 종결 금지 */
const CATEGORY_PUNCT_RE = /[.,!?;:]/;
const CATEGORY_PREDICATE_RE = /(한다|합니다|된다|됨|하기|하는)$/;

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
        let currentKey: string | undefined;
        let prevTop: number | undefined;
        let isFirstGroupOfPayload = true;
        for (const row of component.rows) {
          const number = leadingNumber(row.content);
          if (number === undefined) continue;
          const key = groupKeyOf(row);
          const top = topLevelOf(number);
          const where = `${component.tab || '(탭 없음)'} [${key}]`;

          if (key !== currentKey) {
            // 그룹이 바뀌었다 — 번호는 1. 로 돌아와야 한다
            if (top !== 1) {
              // 예외는 딱 하나: 이어 붙이는 페이로드의 **첫** 그룹.
              // 그 앞에 무엇이 있었는지는 시트에 있지 스펙에 없다.
              const exempt = sheet.isPartial && isFirstGroupOfPayload;
              out.push(
                exempt
                  ? unmeasured(
                      'G1-restart',
                      `${where} 가 ${top} 부터 시작한다 — 이어 붙이는 페이로드의 첫 그룹이라 못 쟀다`,
                      '선행 행은 시트에 있고 페이로드에 없다. 두 번째 그룹부터는 잰다',
                      where,
                    )
                  : err(
                      'G1-restart',
                      `${where} 의 번호가 ${top} 부터 시작한다`,
                      '번호는 소분류(없으면 중분류) 그룹이 바뀔 때마다 1. 로 재시작한다',
                      where,
                    ),
              );
            }
            currentKey = key;
            prevTop = top;
            isFirstGroupOfPayload = false;
            continue;
          }

          // 같은 그룹 안 — 번호는 같거나(액션 그룹) 1 늘어야 한다
          if (prevTop !== undefined && top !== prevTop && top !== prevTop + 1) {
            out.push(
              err(
                'G1-restart',
                `${where} 의 번호가 이어지지 않는다: ${prevTop} → ${top}`,
                '번호는 건너뛰거나 되돌아가지 않는다. 빠진 번호는 누락된 검증이다',
                where,
              ),
            );
          }
          prevTop = top;
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
    id: 'G3-abbrev-consistency',
    check: (sheet) => {
      // 축약형 `노출` 과 기본형 `노출 됨` 은 **한 시트 안에서 하나로 통일**한다.
      // 행 단위 검사로는 절대 안 잡히는 시트 단위 일관성 규칙이다.
      const abbrev: string[] = [];
      const full: string[] = [];
      for (const component of sheet.components) {
        for (const row of component.rows) {
          const body = row.expected.trim();
          if (/노출\s*됨$/.test(body)) full.push(at(component, row));
          else if (/노출$/.test(body)) abbrev.push(at(component, row));
        }
      }
      if (abbrev.length === 0 || full.length === 0) return [];
      return [
        err(
          'G3-abbrev-consistency',
          `축약형 \`노출\`(${abbrev.length}건)과 기본형 \`노출 됨\`(${full.length}건)이 섞였다`,
          '한 시트 안에서 하나로 통일한다. 섞이면 수행 쪽 판정 기준이 흔들린다',
          `${abbrev[0]} / ${full[0]}`,
        ),
      ];
    },
  },
  {
    id: 'G4-precondition-form',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const out: IFinding[] = [];
        const raw = row.precondition.trim();
        // ⚠️ 사전조건이 **비어 있는 것은 정상이다.** 해당 TC 의 기대결과를 바꾸는 조건만 적는다.
        if (raw === '') return out;

        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
        lines.forEach((line, i) => {
          const number = leadingNumber(line);
          if (number === undefined || Number(number) !== i + 1) {
            out.push(
              err(
                'G4-precondition-form',
                `\`사전 조건\` 번호가 어긋난다: "${line.slice(0, 30)}" (기대 ${i + 1}.)`,
                '항상 1. 부터 붙이고, 2건 이상이면 줄바꿈으로 나눈다',
                at(c, row),
              ),
            );
          }
          const body = line.replace(/^\s*\d+\.?\s+/, '').trim();
          if (body === '') return;
          if (!PRECONDITION_TERMINAL_RE.test(body)) {
            out.push(
              err(
                'G4-precondition-form',
                `\`사전 조건\` 이 상태 명사로 끝나지 않는다: "${body.slice(0, 30)}"`,
                '사전조건은 상태다. 동작 서술(`~한다`·`~하고 진입`)이 아니라 결과 상태를 적는다',
                at(c, row),
              ),
            );
          }
          for (const obvious of OBVIOUS_PRECONDITIONS) {
            if (body.includes(obvious)) {
              out.push(
                err(
                  'G4-precondition-form',
                  `\`사전 조건\` 에 자명한 전제가 있다: "${obvious}"`,
                  '적어야 하는 것은 그 TC 의 기대결과를 바꾸는 조건뿐이다',
                  at(c, row),
                ),
              );
            }
          }
        });
        return out;
      }),
  },
  {
    id: 'G5-category-form',
    check: (sheet) =>
      eachRow(sheet, (c, row) => {
        const out: IFinding[] = [];
        for (const { field, label, max } of CATEGORY_LIMITS) {
          const value = row[field].trim();
          if (value === '') continue;
          if (value.length > max) {
            out.push(
              err(
                'G5-category-form',
                `\`${label}\` 이 ${value.length}자다 (상한 ${max}): "${value}"`,
                '분류는 짧은 명사구다. 길어지면 축이 아니라 설명이 된다',
                at(c, row),
              ),
            );
          }
          if (CATEGORY_PUNCT_RE.test(value) || CATEGORY_PREDICATE_RE.test(value)) {
            out.push(
              err(
                'G5-category-form',
                `\`${label}\` 이 명사구가 아니다: "${value}"`,
                '동사·서술어·문장부호를 쓰지 않는다',
                at(c, row),
              ),
            );
          }
        }
        return out;
      }),
  },
  {
    id: 'G5-category-consistency',
    check: (sheet) => {
      // 같은 대상은 **철자·띄어쓰기까지 완전 동일**해야 한다.
      // 공백을 지우면 같아지는 값 쌍이 곧 위반이다 (`AI 도구관리` vs `AI 도구 관리`).
      const buckets = new Map<string, Map<string, string>>();
      for (const component of sheet.components) {
        for (const row of component.rows) {
          for (const { field, label } of CATEGORY_LIMITS) {
            const value = row[field].trim();
            if (value === '') continue;
            const key = `${label}|${value.replace(/\s+/g, '')}`;
            const seen = buckets.get(key) ?? new Map<string, string>();
            if (!seen.has(value)) seen.set(value, at(component, row));
            buckets.set(key, seen);
          }
        }
      }
      const out: IFinding[] = [];
      for (const [key, variants] of buckets) {
        if (variants.size < 2) continue;
        const label = key.split('|')[0];
        const list = [...variants.entries()].map(([v, where]) => `"${v}"(${where})`).join(' · ');
        out.push(
          err(
            'G5-category-consistency',
            `\`${label}\` 에 같은 대상의 표기가 갈렸다: ${list}`,
            '같은 대상은 철자·띄어쓰기까지 완전 동일해야 한다. 갈리면 집계가 쪼개진다',
          ),
        );
      }
      return out;
    },
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
        '`중분류`·`소분류` 가 실제 존재하는 화면인지 확인하지 않았다',
        '형식·길이·내부 일관성은 쟀다. 실재 여부는 도메인 지식이 있어야 잰다',
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
        '`사전 조건` 이 **필요한** 조건인지 판단하지 않았다',
        '형식·자명 전제·번호는 쟀다. "이 조건이 기대결과를 바꾸는가"는 도메인 판단이다',
      ),
    ],
  },
];

export interface ILintSheetOptions {
  /**
   * `대분류` 로 허용되는 이름 목록 — 지식 **폴더 이름**만 있으면 된다(파일을 열지 않는다).
   * 언더스코어 접두 폴더에 속하는 화면은 `대분류` 를 `공통` 으로 고정한다.
   */
  majorDictionary?: string[];
}

const COMMON_MAJOR = '공통';

/** 폴더 목록이 주어졌을 때만 도는 규칙. 없으면 ⚪ 로 남는다. */
const majorDictionaryRule = (dictionary: string[]): IRule<IParsedSheet> => ({
  id: 'G5-major-dictionary',
  check: (sheet) => {
    const allowed = new Set([
      ...dictionary.filter((name) => !name.startsWith('_')),
      COMMON_MAJOR,
    ]);
    return eachRow(sheet, (c, row) => {
      const value = row.major.trim();
      if (value === '' || allowed.has(value)) return [];
      return [
        err(
          'G5-major-dictionary',
          `\`대분류\` "${value}" 가 목록에 없다`,
          `허용: ${[...allowed].join(' · ')} (언더스코어 접두 폴더는 대분류가 아니라 \`${COMMON_MAJOR}\` 이다)`,
          at(c, row),
        ),
      ];
    });
  },
});

export const lintSheet = (sheet: IParsedSheet, options: ILintSheetOptions = {}): IFinding[] => {
  const dictionary = options.majorDictionary;
  const dictionaryRules: Array<IRule<IParsedSheet>> =
    dictionary === undefined || dictionary.length === 0
      ? [
          {
            id: 'G5-major-dictionary',
            check: () => [
              unmeasured(
                'G5-major-dictionary',
                '`대분류` 가 지식 폴더 이름과 일치하는지 확인하지 않았다',
                '`--features-dir` 로 폴더 경로를 주면 잰다 — 파일을 열 필요는 없다',
              ),
            ],
          },
        ]
      : [majorDictionaryRule(dictionary)];

  return [
    ...sheetRules.flatMap((rule) => rule.check(sheet)),
    ...dictionaryRules.flatMap((rule) => rule.check(sheet)),
    ...knowledgeRules.flatMap((rule) => rule.check(sheet)),
  ];
};
