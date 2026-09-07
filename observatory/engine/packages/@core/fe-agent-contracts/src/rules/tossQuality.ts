/**
 * 레인: quality — **토스 식 코드 퀄리티** 중 기계로 셀 수 있는 것.
 *
 * 셀 수 없는 것(응집·성급한 추상화·숨은 부수효과)은 여기 두지 않는다. 그것은 판정 레인(LLM)
 * 몫이다 — 이 분업이 관문의 재현성을 만든다.
 */
import type { IContractReason, IStaticRule } from '@core/fe-agent-harness';

/* ⚠️ `callArgsReferenceIdentifier` 는 JSX 가 아니지만 **따옴표 건너뛰기를 같이 쓴다** —
   부품을 쪼개다 그 기계를 두 번 만들면 갈라진다(R117). 같은 자리에 둔다. */
import { skipComment, jsxTagEnd, booleanPropsOf, callArgsReferenceIdentifier } from './jsx.ts';
import { findAll, isSource, isTsx, lineOf, maskStringsAndComments, patternRule } from './helpers.ts';

/** 널리 쓰이는 HTTP 상태 코드 — 이 수들은 그 자체가 이름이다. */
const HTTP_STATUS = new Set([200, 201, 202, 204, 301, 302, 304, 400, 401, 403, 404, 405, 409, 410, 422, 429, 500, 502, 503, 504]);

/* ── `quality/cohesion` 전용 JSX 훑개 ──────────────────────────────────────────
 * 왜 정규식이 아니라 훑개인가. 옛 규칙은 이것이었다:
 *   /\bis[A-Z]\w*\s*=\s*\{?(?:true|false)\}?\s+\w+…/
 * 실측 은하(whitehole-front · 파일 1,227개)에서 **0건**. 코드가 깨끗해서가 아니라
 * 세 조건을 동시에 요구했기 때문이다 — 셋 다 실제 JSX 와 어긋난다:
 *   (1) 첫 prop 이 `is` 로 시작할 것
 *       → 실제 위반은 `shouldCloseOnEsc`·`showCount`·`useHighlight` 로 시작한다.
 *   (2) 셋 다 `={true}`/`={false}` 리터럴일 것
 *       → JSX 의 boolean prop 은 대개 **축약형**(`<Foo bar />`)이다. 최악의 위반
 *         (`<Mention showCount useKakaoEmoji useHighlight … />`)이 전부 축약형이었다.
 *   (3) 셋이 딱 붙어 있을 것
 *       → 사이에 `className`·`onClose` 가 한 줄만 끼어도 놓친다.
 * 고친 뒤 같은 은하에서 **21건**, 표본 21건 전부 눈으로 봐서 오탐 0.
 * (`FormModal` — boolean prop 10개 · `Mention` — 16개. 둘이 21건 전부의 출처다.)
 *
 * ⚠️ 대신 새 오탐 통로가 열린다: `<TData, TError, TVariables, TContext>` 같은
 *    **제네릭 인자 목록**이 여는 태그와 똑같이 생겼다. 훑개를 처음 걸었을 때 26건 중
 *    5건이 이것이었다. 최상위 `,` 나 `extends`/`keyof`/`typeof` 가 보이면 버린다. */

/** boolean prop 몇 개부터 「겸업」으로 볼 것인가. */
const COHESION_BOOLEAN_LIMIT = 3;


export const TOSS_QUALITY_RULES: IStaticRule[] = [
  patternRule({
    id: 'quality/naming-intent',
    lane: 'quality',
    applies: isSource,
    /* ⚠️ `temp\w*` 로 쓰면 `templateImageRatioLabel` 같은 **멀쩡한 이름**을 통째로 먹는다
       (whitehole-front 실측: naming-intent 167건 중 상당수가 `template*` 였다).
       모호한 이름만 잡으려면 뒤에 숫자만 허용해야 한다. */
    /* ⚠️ **의미로 잡으려 했지만 안 됐다**(R30 실측). 「오른쪽이 무엇인지 말하는데 왼쪽이
       그걸 안 쓰면」으로 재봤더니 선언의 **29.7%** 가 걸렸고 대부분 오탐이었다 —
       `parts = relativePath.split('/')` · `hourOptions = Array.from(…)` 은 좋은 이름이다.
       **좋은 이름은 결과의 개념을 말하는데 그건 오른쪽에 글자로 안 나온다.**

       그래서 열거를 유지하되 **낱말 단위**로 바꿨다 — 이름의 **모든 낱말**이 그릇 낱말이면
       의도가 없다. 합성어(`numValue` · `responseData` · `resList`)까지 덮는다.

       ⚠️ 그릇 낱말은 **측정으로 다듬었다.** 관용어를 넣으면 오탐이 된다 —
       `result`(267건) · `context`(30) · `params`(24) · `config` · `input` · `idx` ·
       `value`(대부분 `e.target.value`) 는 **일부러 뺐다.**
       남의 저장소 둘에서 새로 잡히는 124건의 표본이 전부 진짜였다. */
    /* 「홀로면 관용, 합성어면 아닌 낱말」이 있다 — `value` 는 `e.target.value` 로 늘 쓰이지만
       `numValue` 는 뜻이 없다. 그래서 낱말을 두 갈래로 둔다:
         · 엄격(홀로도 나쁘다): data · res · response · req · tmp · item · obj · payload · msg · no …
         · 느슨(합성어일 때만): value · result · context · params · config · input · list · info · content
       이름이 이 낱말들로만 되어 있고 **엄격 낱말을 하나라도 품으면** 의도가 없는 이름이다. */
        /* ⚠️ **세 번째 갈래 — 홀로일 때만 나쁜 낱말**(`item` · `items`).
       실측(R42): 남의 저장소 둘에서 155건 중 `item` 계열이 19건이었는데,
       `itemContext`(6) · `itemConfig`(3) · `itemList` · `configItem` 은 **오탐**이었다 —
       거기서 `item` 은 그릇 낱말이 아니라 **도메인 명사**(업로드 항목·차트 항목)다.
       반대로 `const items = …` 홀로는 여전히 자리표시 이름이다.
       ⛔ `numValue` 와 `itemContext` 는 **구조가 같다**(엄격+느슨). 기계로는 못 가른다 —
       그래서 낱말을 옮겼지 규칙 모양을 바꾸지 않았다. */
    pattern: /\b(?:const|let)\s+\[?\s*_?(?:[Ii]tems?\d*(?![\w$])|(?:(?:[Dd]ata|[Rr]esp|[Rr]esponse|[Rr]es|[Rr]equest|[Rr]eq|[Tt]emp|[Tt]mp|[Ii]tems|[Ii]tem|[Aa]rray|[Aa]rr|[Oo]bject|[Oo]bj|[Pp]ayload|[Rr]et|[Mm]sg|[Nn]um|[Ss]tr|[Bb]uf|[Ff]lag|[Vv]al|[Nn]o|[Vv]alue|[Rr]esult|[Cc]ontext|[Pp]arams|[Pp]aram|[Cc]onfig|[Ii]nput|[Ll]ist|[Ii]nfo|[Cc]ontent)){0,2}(?:[Dd]ata|[Rr]esp|[Rr]esponse|[Rr]es|[Rr]equest|[Rr]eq|[Tt]emp|[Tt]mp|[Aa]rray|[Aa]rr|[Oo]bject|[Oo]bj|[Pp]ayload|[Rr]et|[Mm]sg|[Nn]um|[Ss]tr|[Bb]uf|[Ff]lag|[Vv]al|[Nn]o)(?:(?:[Dd]ata|[Rr]esp|[Rr]esponse|[Rr]es|[Rr]equest|[Rr]eq|[Tt]emp|[Tt]mp|[Ii]tems|[Ii]tem|[Aa]rray|[Aa]rr|[Oo]bject|[Oo]bj|[Pp]ayload|[Rr]et|[Mm]sg|[Nn]um|[Ss]tr|[Bb]uf|[Ff]lag|[Vv]al|[Nn]o|[Vv]alue|[Rr]esult|[Cc]ontext|[Pp]arams|[Pp]aram|[Cc]onfig|[Ii]nput|[Ll]ist|[Ii]nfo|[Cc]ontent)){0,2}\d*\b(?![\w$]))/,
    fix: '이름이 무엇인지가 아니라 **무엇을 위한 것인지**를 말하게 하라 (`data` → `pendingTemplates`).',
  }),
  patternRule({
    id: 'quality/nested-ternary',
    /* 오탐을 구조로 적는다(R127) — known-negative 에 `fp: <이름>` 이 있어야 한다. */
    falsePositives: ['널 병합', '옵셔널 체이닝'],
    /* ⚠️⚠️ **정규식과 문자열 안의 `?` 를 삼항으로 읽고 있었다.** 남의 저장소 표본 6건 중
       **5건이 오탐**이었다 — `?<![0-9xX*])(?:` · `?)(?:` 같은 **정규식 리터럴**,
       그리고 `` ? `?templateId=${x}` : `` 처럼 **문자열 안에 `?` 가 든 한 겹 삼항**.
       마스킹은 이미 있었는데 이 규칙이 **안 켜고 있었다** — 있는 도구를 안 쓴 것이다. */
    mask: true,
    lane: 'quality',
    applies: isSource,
    /* ⚠️⚠️ **`??` 와 `?.` 를 삼항으로 읽고 있었다.** 남의 저장소에서 153건이 나왔는데
       표본을 보니 중첩 삼항이 아니었다:
         · `? data.lastCardAuthCode ?? '' :`  ← 널 병합 `??`
         · `?.isOldPassword ? '…' :`          ← 옵셔널 체이닝 `?.`
       현대 TS 는 둘 다 늘 쓴다. 우리 저장소에는 이 조합이 드물어 안 보였다.
       삼항의 `?` 는 **앞뒤가 `?` 도 `.` 도 아닌 것**이다. */
    pattern: /(?<![?.])\?(?![?.])[^?:;\n]{0,80}(?<![?.])\?(?![?.])[^:;\n]{0,80}:/,
    fix: '중첩 삼항 금지 — 얼리 리턴이나 조건별 컴포넌트로 나눠라.',
  }),
  patternRule({
    id: 'quality/early-return',
    lane: 'quality',
    applies: isSource,
    pattern: /\bif\s*\([^)]*\)\s*\{[^{}]{0,200}\bif\s*\([^)]*\)\s*\{[^{}]{0,200}\bif\s*\(/,
    fix: '조건 3중첩 — 예외를 먼저 반환(early return)해 본류를 평평하게 하라.',
  }),
  {
    /**
     * 복사본 state — **props/서버 데이터를 state 로 복사했는가.**
     *
     * ⚠️ 실측(whitehole-front, 파일 1227개)에서 드러난 오탐 세 개를 막는다:
     *   1) `useState(180)` · `useState(lunaPayTypes.card)` — 그냥 기본값이다. props 가 아니다.
     *      → 초기값의 **뿌리 식별자가 실제로 prop 인지** 확인한다(`props.` 이거나
     *        `({ x }: IFooProps)` 로 구조분해된 이름이거나).
     *   2) `useState } from 'react';` — `useState[^(]*\(` 가 줄바꿈을 건너뛰어 **import 문**을
     *      다음 여는 괄호까지 먹었다. → 제네릭 인자만 허용하고 줄바꿈을 넘지 않는다.
     *   3) `useEffect(() => setFiles([]))` — **리셋**이다. 복사가 아니다.
     *      → 인자가 전부 리터럴인 호출은 세지 않는다(위 주석 참고 · 19건 → 6건).
     */
    id: 'quality/copy-state',
    lane: 'quality',
    applies: isSource,
    scan: (file) => {
      const propNames = new Set<string>();
      for (const match of file.content.matchAll(/\{([^}]*)\}\s*:\s*\w*Props\b/g)) {
        for (const name of match[1].split(',')) {
          const clean = name.split(/[:=]/)[0].trim().replace(/^\.\.\./, '');
          if (/^[A-Za-z_$][\w$]*$/.test(clean)) {
            propNames.add(clean);
          }
        }
      }
      const looksLikeProp = (initializer: string) => {
        const root = /^([A-Za-z_$][\w$]*)/.exec(initializer.trim())?.[1];
        if (root === undefined) {
          return false;
        }
        /* ⛔ **`default*` 는 「처음 값만 준다」는 뜻이다(R107).** React·Radix 의 관용 API 이름이고
           (`defaultValue`·`defaultChecked`·`defaultOpen`), 그 값을 state 로 옮기는 것이
           **비제어 컴포넌트를 만드는 정석**이다. 벌하면 옳은 코드를 벌한다.
           실측: 살아 있는 은하(1,407파일) 13건 중 **3건**이 이것이었다.
           ⚠️ 어휘를 나열하는 것이 아니다 — **언어·라이브러리가 정한 접두사**다(§9 의 예외 자리). */
        if (/^default[A-Z]/.test(root)) {
          return false;
        }
        return root === 'props' || propNames.has(root);
      };

      /* ⛔ **`set…` 이 전부 state 세터인 것은 아니다(R107).** 실측: `setLocalStorage('lnb-open', …)`
         를 잡고 있었는데 그것은 `useStorageUtils()` 가 준 **저장소 쓰기 함수**다.
         세터는 **같은 파일의 `useState` 가 선언한 것**이라야 한다 — 이름이 아니라 선언으로 가른다. */
      const declaredSetters = new Set(
        [...file.content.matchAll(/\[\s*[A-Za-z_$][\w$]*\s*,\s*(set[A-Z]\w*)\s*\]\s*=\s*useState/g)]
          .map((m) => m[1]),
      );

      return [
        ...findAll(
          file,
          /useState\s*(?:<[^>\n]*>)?\s*\(\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*\)/,
          'quality/copy-state',
          'props 를 state 로 복사하지 마라 — 파생값은 렌더 중 계산하고, 정말 필요하면 `key` 로 리마운트하라.',
          (match) => looksLikeProp(match[1]),
        ),
        ...findAll(
          file,
          /useEffect\(\s*\(\)\s*=>\s*\{?\s*set[A-Z]\w*\(/,
          'quality/copy-state',
          '`useEffect` 로 state 를 동기화하지 마라 — 파생값은 계산으로 만든다.',
          (match) => {
            const setter = /set[A-Z]\w*/.exec(match[0])?.[0];
            if (setter === undefined || !declaredSetters.has(setter)) {
              return false;
            }
            return callArgsReferenceIdentifier(match.input, match.index + match[0].length);
          },
        ),
      ];
    },
  },
  {
    /**
     * 응집 — **한 컴포넌트가 boolean 스위치로 여러 화면을 겸업하는가.**
     *
     * ⚠️⚠️ **쓰는 쪽이 아니라 정의하는 쪽을 본다.** 예전엔 JSX 사용처를 훑었는데,
     * 남의 저장소에서 잡힌 41건 상당수가 `<Modal useDim useEscButton …>` —
     * **공유 컴포넌트의 API** 였다. 위반은 쓰는 쪽에 뜨는데 **고칠 자리는 만든 쪽**이다.
     * 고칠 수 없는 자리를 벌하면 사람은 관문을 무시하는 법부터 배운다.
     *
     * 정의 쪽에서 보면 같은 말뭉치에서 **20개**가 나오고 하나하나가 고칠 수 있는 것이다 —
     * `IUsePaginationProps` 는 boolean 이 다섯이다(`showFirstButton` · `hidePrevButton` ·
     * `showLastButton` · `hideNextButton` · `disabled`).
     */
    id: 'quality/cohesion',
    lane: 'quality',
    applies: isSource,
    scan: (file) => {
      const reasons: IContractReason[] = [];
      const decl = /(?:interface|type)\s+(\w*(?:Props|Prop))\s*(?:=\s*)?\{([\s\S]*?)\n\}/g;
      let match = decl.exec(file.content);

      while (match !== null) {
        const names = [...match[2].matchAll(/^\s*(\w+)\??:\s*boolean/gm)].map((m) => m[1]);
        if (names.length >= COHESION_BOOLEAN_LIMIT) {
          reasons.push({
            rule: 'quality/cohesion',
            where: `${file.path}:${lineOf(file.content, match.index)}`,
            evidence: `${match[1]} — ${names.join(' · ')}`.slice(0, 160),
            fix: `boolean prop ${names.length}개가 한 컴포넌트를 여러 화면으로 겸업시킨다 — 컴포넌트를 쪼개라.`,
          });
        }
        match = decl.exec(file.content);
      }
      return reasons;
    },
  },
  {
    /**
     * 매직 넘버 — **이름 없는 수가 로직을 정하고 있는가.**
     *
     * 토스 17패턴 중 **두 자리**(가독성 「매직 넘버에 이름 붙이기」·응집도 「매직 넘버
     * 없애기」)에 나오는데 우리에겐 규칙이 없었다. 기계로 아주 쉽게 재는 것인데 빠져
     * 있었다 — 우리가 **중요도가 아니라 정규식으로 재기 쉬운 것**을 골랐기 때문이다.
     *
     * ⚠️ **오탐이 나기 제일 쉬운 규칙이라 좁게 문다.** 걸러 내는 것:
     *   · 한 자리 수 — `0` `1` `2` 는 관용이고 이름을 붙이면 오히려 나빠진다
     *   · `const NAME = 300` — **그게 이름 붙이는 것이다.** 벌하면 처방과 정반대가 된다
     *   · 시험 파일 — 기댓값은 원래 숫자다
     *   · 문자열·주석 안의 숫자 — Tailwind 클래스는 tailwind 규칙의 몫이다
     *   · `2xl` 같이 식별자에 붙은 숫자
     */
    id: 'quality/magic-number',
    lane: 'quality',
    /* ⛔ **주석이 아니라 구조로 적는다(R127).** 여기 적은 이름마다 known-negative 에
       `fp: <이름>` 표시가 있어야 한다 — 없으면 엔진 계약 시험이 문다. */
    falsePositives: ['JSX 치수 prop', '숫자 객체 키', 'JSX 텍스트', 'HTTP 상태 코드', '레코드 값'],
    applies: (file) => isSource(file) && !/\.(test|spec)\.[tj]sx?$/.test(file.path),
    scan: (file) => {
      const reasons: IContractReason[] = [];
      const masked = maskStringsAndComments(file.content);
      const lines = masked.split('\n');
      const originals = file.content.split('\n');

      lines.forEach((line, index) => {
        /* ⚠️ HTTP 상태 코드는 **숫자 자체가 이름**이다. `status === 200` 에 이름을 붙이면
           읽기가 나빠진다. 규모(엔진 소스 52파일)에 걸고서야 이 오탐이 보였다 —
           작은 표본에는 없었다. 「status」가 있는 줄에서만 뺀다(값만으로 빼면
           `retries === 404` 같은 진짜 매직 넘버까지 놓친다). */
        const isHttpStatusLine = /\bstatus(?:Code)?\b/i.test(line);

        /* 이름을 붙이는 줄은 벌하지 않는다 — 그게 처방이다. */
        if (/\b(?:const|enum)\s+[A-Z_][A-Z0-9_]*\s*[:=]/.test(line)) { return; }
        if (/^\s*(?:export\s+)?const\s+\w+\s*=\s*-?\d+(?:\.\d+)?\s*;?\s*$/.test(line)) { return; }

        /* 두 자리 이상의 정수(`300`·`25`), 또는 소수점 아래 두 자리 이상의 소수(`1.08`).
           ⚠️ `0.5` 는 **일부러 뺐다** — 비율·투명도로 흔히 쓰이고 이름을 붙이면 오히려
           읽기 나빠지는 자리가 많다. 선을 어디 긋든 완벽하지 않으므로 **어디 그었는지를
           적는다.** 이 선이 틀렸다는 실측이 나오면 그때 옮긴다. */
        const literal = /(?<![\w$.])(\d{2,}(?:\.\d+)?|\d\.\d{2,})(?![\w$])/g;
        let match = literal.exec(line);
        while (match !== null) {
          if (isHttpStatusLine && HTTP_STATUS.has(Number(match[1]))) {
            match = literal.exec(line);
            continue;
          }
          /* ⚠️ **데이터는 매직 넘버가 아니다.** 픽스처 은하에 걸어 보고서야 보였다 —
             `{ id: 'a1', title: '아메리카노', price: 4500 }` 의 4500 을 잡고 있었다.
             4500 에 이름을 붙이는 건 우스운 일이다. 토스가 말하는 매직 넘버는
             **로직을 정하는 수**(임계값·지속시간·계수)이지 레코드의 값이 아니다.
             ⇒ `키: 숫자` 로 **값 전체가 그 숫자뿐**이면 데이터로 본다.
             `timeoutMs: 20 * 60_000` 처럼 식의 일부면 여전히 로직이므로 잡는다. */
          const before = line.slice(0, match.index);
          const after = line.slice(match.index + match[1].length);
          const isPropertyValue = /[\w'"\]]\s*:\s*$/.test(before) && /^\s*[,;)}\]]|^\s*$/.test(after);
          /* ⚠️ **남의 코드에 걸고서야 보인 오탐 셋.** 우리 저장소에는 없던 모양이다.
             표본을 눈으로 보니 13개 중 절반 이상이 매직 넘버가 아니었다:
               · `width={12}` · `listWidth={150}` — **JSX 치수 prop.** 데이터지 로직이 아니다
               · `10: { label: … }` · `4029: {` — **숫자 객체 키.** 맵의 키다
               · `<>404</>` — **JSX 텍스트.** 화면에 찍히는 글자다
             앞의 「데이터 레코드」 제외가 `키: 숫자` 만 덮고 이 셋을 못 덮었다. */
          const isJsxAttribute = /=\{\s*$/.test(before) && /^\s*\}/.test(after);
          /* ⚠️ 처음엔 `(^|[{,(\[]\s*)$` 로 썼는데 **들여쓴 키를 놓쳤다** —
             여러 줄 객체에서 `    422: '…'` 의 앞은 공백뿐이라 `^$` 에 안 맞는다. */
          const isNumericKey = /(^\s*|[{,(\[]\s*)$/.test(before) && /^\s*:/.test(after);
          /* 배열 원소도 데이터다 — `[16, 16]` · `[10, 30, 50, 100]`. */
          const isArrayElement = /[[,]\s*$/.test(before) && /^\s*[,\]]/.test(after);
          /* ⚠️ **한글이 붙은 수는 산문이다** — 화면에 찍히는 글자지 로직이 아니다.
             `최대 10개` · `총 20MB 이내` · `최대 200자`.
             남의 코드에 걸고서야 보였다. 처음엔 이것을 「주석이 샜다」고 잘못 읽었는데
             열어 보니 **JSX 텍스트**였다 — 앞의 `*` 는 주석 기호가 아니라 화면의 글머리표다. */
          const isProse = /[가-힣]\s*$/.test(before) || /^[A-Za-z]{0,3}\s*[가-힣]/.test(after);
          const isJsxText = />\s*$/.test(before) && /^\s*</.test(after);
          if (isPropertyValue || isJsxAttribute || isNumericKey || isJsxText || isArrayElement || isProse) {
            match = literal.exec(line);
            continue;
          }
          reasons.push({
            rule: 'quality/magic-number',
            where: `${file.path}:${index + 1}`,
            evidence: (originals[index] ?? line).trim().slice(0, 160),
            /* ⛔ **지어낸 이름을 권하지 않는다(R104).** 전엔 `const RETRY_LIMIT = 1024` 라고
               적었는데, 그 1024 는 `100 * 1024 * 1024`(=100MB)의 일부였다 — **재시도 한계가
               아니다.** 틀린 이름을 권하는 처방은 무시하는 법부터 가르친다(R35 의 반대편이다).
               이름은 그 수가 무엇을 뜻하는지 아는 사람만 지을 수 있다. 자리만 짚는다. */
            fix: `이름 없는 수 \`${match[1]}\` 가 로직을 정하고 있다 — **무엇을 뜻하는지** 이름을 붙여라(그 이름은 이 코드를 아는 사람이 짓는다).`,
          });
          match = literal.exec(line);
        }
      });
      return reasons;
    },
  },
];
