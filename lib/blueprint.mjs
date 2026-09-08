/**
 * **구조 설명 카드의 순수 부품** — 「페이지별 아키텍처 · 메뉴별 설명」이 있는가를 재는 재료.
 *
 * ⛔ 여기서는 **아무것도 읽지 않고 아무것도 쓰지 않는다.** 파일을 읽는 것도 모델을 부르는 것도
 * `observatory/blueprint.mjs` 의 몫이다. 이 파일은 **판정의 재료**만 든다 — 그래야
 * 부품 시험이 모델도 저장소도 없이 잴 수 있다(`lib/selftest.mjs` 의 그 규율).
 *
 * ## ⛔ 이름을 열거하지 않는다 (관측 법칙 §9)
 *
 * 「페이지」·「메뉴」가 어느 폴더에 사는지는 **사람이 정하는 이름**이다. 그것을 열거하면
 * 열거 밖의 저장소는 영영 안 보인다(§9 가 네 번 잡은 그 형태). ⇒ **구조로 찾는다**:
 *   ① 좌표가 스스로 선언한 `solarSystems[].srcDir` — 그 팀이 이미 적어 둔 것이다
 *   ② `index.*` 가 있는 폴더 — `index` 는 **번들러·Node 가 정한 이름**이라 안 낡는다
 *   ③ **URL 모양의 문자열 리터럴**이 둘 이상인 파일 — 라우터를 「따옴표 열고 `/`」라는
 *      **모양**으로 잡는다. 라이브러리 이름(`Route`·`createBrowserRouter`)을 안 본다.
 *
 * ## ⛔ 이 부품이 **못 재는 것** (§8)
 *   · **그 설명이 맞는 말인가.** 「있는가 · 자리를 가리키는가 · 사람이 채울 자리가 남았는가」만 본다.
 *   · **모양이 다른 라우터.** 경로를 코드로 조립하는 라우터(`` `/${base}/x` ``)는 URL 리터럴이
 *     안 남아 안 잡힌다. 그건 「라우터가 없다」가 아니라 **「못 봤다」**다.
 *   · **주석·정규식 안의 `'/…'`.** 모양으로 잡으므로 섞여 들 수 있다 — 그래서 판정은
 *     「단위 수」가 아니라 **사람이 화면에서 본 목록**이다.
 */
import path from 'node:path';

/**
 * 카드가 사는 곳 — **그 은하가 커밋하는 자리**(`universe/`).
 * ⛔ 우주의 `galaxies/` 가 아니다. 남의 저장소 설명을 우리 저장소에 쌓으면 그 팀은 못 고친다.
 * `observatory/extract.mjs` 가 지식 카드를 `<은하>/universe/knowledge/` 에 두는 것과 같은 규율이다.
 */
export const blueprintPaths = (galaxyPath) => ({
  dir: path.join(galaxyPath, 'universe', 'blueprint'),
  index: path.join(galaxyPath, 'universe', 'BLUEPRINT.md'),
});

/**
 * 자리 → 카드 id. **그대로 파일 이름이 된다.**
 * ⛔ 모델이 준 문자열이 `path.join` 에 들어가면 지식창고 밖 파일을 건드릴 수 있다
 * (엔진의 `isSafeCardId` 가 같은 값을 치렀다). 여기서는 **우리가 만든 자리 문자열**만 넣지만,
 * 그래도 구분자와 `..` 를 없앤 뒤에 쓴다.
 */
export const unitId = (at) => {
  const safe = String(at ?? '').replace(/^\.\//, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return safe === '' ? 'root' : safe;
};

/** `index.*` — **번들러가 정한 이름**이다(§9 의 예외). 「들어오는 자리」라는 뜻을 갖는다. */
export const ENTRY_FILE = /(^|\/)index\.[A-Za-z0-9]+$/;

/** 라우터로 보려면 URL 리터럴이 몇 개나 있어야 하나. 하나는 우연이고 둘부터 표다. */
export const ROUTE_MIN = 2;

/**
 * **URL 모양의 문자열 리터럴**을 전부 준다 — `'/'` · `"/orders/:id"` · `` `/a/b` ``.
 * ⛔ `'./x'`·`'https://…'` 는 안 걸린다(따옴표 **바로 뒤**가 `/` 여야 한다).
 */
export const routeLiterals = (text) => [...new Set(
  [...String(text ?? '').matchAll(/(['"`])(\/[\w\-./:*[\]$]*)\1/g)].map((m) => m[2]),
)];

/** 이 파일이 라우터 표인가 — **모양으로만** 판정한다. */
export const isRouteTable = (routes) => (routes?.length ?? 0) >= ROUTE_MIN;

/**
 * 설명해야 할 **단위**를 모은다.
 *
 * @param {object} galaxy 은하 좌표 (`solarSystems` 를 본다)
 * @param {{at: string, routes: string[]}[]} scanned 훑은 파일들(저장소 기준 상대경로)
 * @returns {{id,at,kind,why,routes?}[]} 자리로 중복을 없앤 목록
 */
export const collectUnits = (galaxy, scanned) => {
  const units = new Map();
  const put = (at, kind, why, extra = {}) => {
    const key = String(at ?? '').replace(/^\.\//, '');
    if (key === '' || units.has(key)) {
      return;
    }
    units.set(key, { id: unitId(key), at: key, kind, why, ...extra });
  };
  /* ① 좌표가 이긴다 — 그 팀이 「여기가 한 묶음이다」라고 **이미 적어 둔 것**이다. */
  for (const system of galaxy?.solarSystems ?? []) {
    put(system?.srcDir, '좌표', `좌표가 태양계 \`${system?.name ?? '?'}\` 로 선언했다`);
  }
  /* ② 라우터 — 파일 하나가 단위다(그 안에 메뉴가 나열돼 있다). */
  for (const file of scanned ?? []) {
    if (isRouteTable(file?.routes)) {
      put(file.at, '라우터', `URL 모양 리터럴 ${file.routes.length}개`, { routes: file.routes });
    }
  }
  /* ③ `index.*` 가 있는 폴더 — 들어오는 자리다. */
  for (const file of scanned ?? []) {
    if (ENTRY_FILE.test(file?.at ?? '')) {
      put(path.posix.dirname(file.at), 'index', '`index.*` 가 있다 — 밖에서 들어오는 자리다');
    }
  }
  return [...units.values()].sort((a, b) => a.at.localeCompare(b.at));
};

/**
 * **잘라서 부르되 몇 개를 안 봤는지 남긴다**(§8). ⛔ 조용히 자르면 「전부 봤다」로 읽힌다.
 */
export const budgetSlice = (items, max) => {
  const list = items ?? [];
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : list.length;
  return { taken: list.slice(0, limit), skipped: Math.max(0, list.length - limit) };
};

/** 카드가 반드시 들고 있어야 하는 칸. 없으면 **무엇을 설명한 카드인지 기계가 모른다.** */
export const REQUIRED_FIELDS = ['unit', 'at', 'kind'];

/** 사람이 채울 자리 표식 — `bin/galaxy.mjs` 초안과 **같은 표식**을 쓴다. */
export const PLACEHOLDER = 'TODO:';

/**
 * **1차 — 이 카드가 규칙에 맞는가.** ⛔ 모델을 안 부른다.
 * @param {{file:string, front:object, body:string, atExists:boolean}} card
 * @returns {string[]} 사람이 읽을 어긋남. 빈 배열이면 맞다.
 */
export const cardProblems = ({ file, front, body, atExists }) => {
  const problems = [];
  for (const key of REQUIRED_FIELDS) {
    if (String(front?.[key] ?? '').trim() === '') {
      problems.push(`${file} — 프론트매터에 \`${key}\` 가 없다 (무엇을 설명한 카드인지 기계가 모른다)`);
    }
  }
  /* ⛔ **없는 자리를 가리키는 설명**은 틀린 설명보다 나쁘다 — 사람이 그 자리를 찾으러 간다. */
  if (String(front?.at ?? '').trim() !== '' && atExists === false) {
    problems.push(`${file} — 가리키는 자리가 저장소에 없다: ${front.at}`);
  }
  if (String(body ?? '').includes(PLACEHOLDER)) {
    problems.push(`${file} — 사람이 채울 자리(${PLACEHOLDER})가 남아 있다`);
  }
  /* 「있다」와 「비어 있다」를 가른다 — 빈 카드가 있으면 덮였다고 세어져 **조용해진다**(§8). */
  if (String(body ?? '').replace(/\s/gu, '').length < 40) {
    problems.push(`${file} — 본문이 사실상 비어 있다 (덮인 것으로 세어져 조용해진다)`);
  }
  return problems;
};

/**
 * 단위와 카드를 맞춰 본다.
 * @returns {{missing: object[], stale: object[]}}
 *   `missing` — 설명이 없는 단위 · `stale` — 이제 단위가 아닌 자리를 설명하는 카드
 */
export const coverage = (units, cards) => {
  const described = new Set((cards ?? []).map((c) => String(c?.front?.at ?? '')).filter(Boolean));
  const known = new Set((units ?? []).map((u) => u.at));
  return {
    missing: (units ?? []).filter((u) => !described.has(u.at)),
    stale: (cards ?? []).filter((c) => {
      const at = String(c?.front?.at ?? '');
      return at !== '' && !known.has(at);
    }),
  };
};

/**
 * 카드 한 장. **사실 칸은 우리가 적고 산문만 모델에서 온다** —
 * 모델이 경로를 지어내면 「없는 자리를 가리키는 카드」가 되고, 그건 위에서 문다.
 */
export const renderCard = ({ unit, files, skipped, body, measuredAt, galaxyName }) => `---
unit: ${unit.id}
at: ${unit.at}
kind: ${unit.kind}
galaxy: ${galaxyName}
files: ${files.length}${skipped > 0 ? ` (안 본 파일 ${skipped}개)` : ''}
measuredAt: ${measuredAt}
---

<!-- ⛔ 손으로 고쳐도 되지만, 다시 뽑으면 덮인다. 다시 뽑는 법은 BLUEPRINT.md 에 있다. -->

${String(body).trim()}
`;

/** 명부. ⛔ **안 본 파일 수**를 여기에도 남긴다 — 화면은 지나가고 파일은 남는다. */
export const renderIndex = ({ galaxyName, rows, command, skippedUnits }) => `# ${galaxyName} — 페이지별 아키텍처 · 메뉴 설명

카드는 **구조에서 찾은 자리**마다 한 장이다(좌표가 선언한 태양계 · \`index.*\` 가 있는 폴더 ·
URL 모양 리터럴이 둘 이상인 파일). 폴더 이름을 열거해 짐작하지 않는다.

| 자리 | 종류 | 카드 |
|------|------|------|
${rows.join('\n')}
${skippedUnits > 0 ? `\n⛔ **설명하지 않은 자리 ${skippedUnits}개** — 한 번에 부르는 수를 잘랐다. 다시 부르면 이어서 채운다.\n` : ''}
## 다시 뽑는 법

\`\`\`bash
${command}
\`\`\`

⛔ 이 카드는 **모델이 쓴 산문**이다. 사실 칸(자리·종류·파일 수)만 기계가 잰 것이다 —
카드와 코드가 어긋나면 **코드가 이긴다.**
`;

/**
 * 모델에게 주는 **시스템 프롬프트**. ⛔ 파일로 떨어뜨려 `callClaude` 에 넘긴다
 * (엔진의 `IClaudeCall` 이 프롬프트를 **파일 경로**로만 받는다).
 */
export const BLUEPRINT_PROMPT = `당신은 프론트엔드 저장소의 **한 자리**를 읽고 그 자리의 구조 설명을 쓴다.

출력은 **마크다운 본문만** 낸다. 프론트매터(\`---\`)를 쓰지 마라 — 사실 칸은 부르는 쪽이 적는다.

반드시 이 세 절을 이 순서로 낸다:

## 이 자리는 무엇인가
## 화면·메뉴
## 안팎으로 무엇에 기대나

규율:
- **준 코드에서 읽은 것만 쓴다.** 안 준 파일의 내용을 짐작하지 마라.
- **경로를 지어내지 마라.** 준 파일 목록에 없는 경로를 쓰면 그 카드는 버려진다.
- 못 읽은 것은 「⚪ 못 봤다」라고 **그대로 적는다.** 빈칸으로 두지 마라.
- 한국어로, 각 절 3~8줄. 코드를 그대로 옮겨 붙이지 마라.
- \`TODO:\` 라는 문자열을 쓰지 마라 — 그 표식은 「사람이 채울 자리」라는 뜻이라 검사가 문다.`;

/**
 * 모델에 넣을 입력 한 덩어리. ⛔ **무엇을 안 줬는지 입력 안에 적는다** —
 * 안 적으면 모델은 준 것이 전부인 줄 알고 「이 자리에는 그것뿐이다」라고 쓴다.
 */
export const foldUnit = ({ unit, samples, skipped }) => [
  `[UNIT] ${unit.at} (${unit.kind} — ${unit.why})`,
  unit.routes ? `[ROUTES] ${unit.routes.join(' ')}` : '[ROUTES] (없음)',
  `[FILES] ${samples.length}개를 준다${skipped > 0 ? ` · **${skipped}개는 안 줬다**(잘랐다)` : ''}`,
  ...samples.map((s) => `--- ${s.at}\n${s.text}`),
].join('\n');
