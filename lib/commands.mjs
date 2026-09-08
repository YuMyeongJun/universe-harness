/**
 * **명령 명부 — 한 자리.** 무엇을 하는 명령인지와 **누가 치는 명령인지**를 여기서 정한다.
 *
 * ## 왜 생겼나 — 33개를 8개짜리 일에 보여 주고 있었다
 *
 * 사용자가 「명령어를 외워야 해서 어렵다」고 했다. 재 보니 원인이 달랐다:
 *   · `universe` 가 받는 명령 **33개**
 *   · 그중 **25개는 관문(`universe check`)이 알아서 부르는 것** — 사람이 칠 일이 없다
 *   · 문서에서 사람이 실제로 치는 것은 **8개**
 * ⇒ **외울 게 33개라서 어려운 게 아니라, 8개짜리 일을 33개로 보여 줘서** 어려웠다.
 *
 * ## ⛔ 두 번째 이유 — 도움말이 **두 번째 손 목록**이었다
 *
 * 예전엔 `bin/universe.mjs` 안에 도움말 문자열이 **따로** 있었다. 배분표(`SUBCOMMANDS`)와
 * 별개의 목록이라 **한 자리만 늘어나면 조용히 갈린다** — R47 이 관문 목록에서 겪은 그것이다.
 * 실제로 `orphans`·`extract` 를 더할 때 두 곳을 다 고쳐야 했다.
 * ⇒ 설명도 **여기 하나에** 둔다. 도움말은 이 명부에서 **만들어진다.**
 *
 * ## ⛔ 배분표는 안 건드린다
 *
 * `bin/universe.mjs` 의 `SUBCOMMANDS` 는 **모양을 그대로 둔다.**
 * `observatory/verify-args.mjs` 와 `observatory/verify-checks.mjs` 가 그 블록을
 * **정규식으로 읽어** 「사용자가 칠 수 있는 명령」을 찾는다. 구조를 바꾸면 그 둘이
 * 잴 대상을 0개로 읽는다(둘 다 「0개는 통과가 아니다」 가드가 있어 조용히 죽지는 않는다).
 * ⇒ 여기는 **분류와 설명만** 든다. 어느 파일이 도는지는 배분표가 정한다.
 *
 * ⚠️ **명부가 낡지 않게** 부품 시험이 양방향으로 문다 — 배분표에 있는데 여기 없거나,
 *    여기 있는데 배분표에 없으면 빨간불이다. 새 명령을 만들고 분류를 잊으면 막힌다.
 */

/**
 * `daily` — **사람이 치는 것.** 인자 없이 `universe` 를 쳤을 때 보이는 것들이다.
 * `gate`  — **관문이 알아서 부르는 것.** `universe check` 가 전부 돌린다.
 *           사람이 직접 칠 일은 「그 하나만 다시 보고 싶을 때」뿐이라 기본 화면에서 뺀다.
 *
 * ⚠️ `observe`·`verify`·`learn` 은 **둘 다**다 — 관문도 부르고 사람도 친다.
 *    그런 것은 `daily` 에 둔다. **못 찾는 것보다 하나 더 보이는 것이 낫다.**
 */
export const COMMANDS = {
  /* ── 사람이 치는 것 ─────────────────────────────────────── */
  init: { group: 'daily', usage: 'init', summary: '소비 저장소에 우주를 깐다' },
  clone: { group: 'daily', usage: 'clone <주소> [--into …] [--name …]', summary: '**저장소를 받아 와** 좌표 초안까지 — ⛔ 토큰은 안 받는다' },
  repos: { group: 'daily', usage: 'repos [--limit …] [--json]', summary: '이 기계의 **gh 로 레포를 고른다** — ⛔ 토큰은 안 받는다' },
  branches: { group: 'daily', usage: 'branches <주소> [--json]', summary: '그 저장소의 **가지 목록** — ⛔ 받아 오지 않는다' },
  session: { group: 'daily', usage: 'session <은하> [--timeout <초>]', summary: '창을 띄워 **사람이 로그인** — 그 세션을 화면 시험이 쓴다 · ⛔ 계정은 안 받는다' },
  'gh-auth': { group: 'daily', usage: 'gh-auth status|login [--json]', summary: '**깃 로그인** — 지금 계정을 말하고, 안 돼 있으면 시킨다 · ⛔ 토큰은 안 받는다' },
  blueprint: { group: 'daily', usage: 'blueprint --galaxy <이름> [--write] [--max-units …] [--max-files …] [--model …]', summary: '페이지별 **아키텍처·메뉴 설명** — ⛔ 기본은 모델 0회' },
  adopt: { group: 'daily', usage: 'adopt <초안파일> [--name …]', summary: '채운 초안을 **은하로 들인다** — 좌표와 목록이 **같이** 움직인다' },
  loop: { group: 'daily', usage: 'loop --galaxy <이름> [--report …]', summary: '이 은하는 **끝났는가** — 판단하지 않은 fail 로 잰다' },
  repeat: { group: 'daily', usage: 'repeat --galaxy <이름> [--max 5] [--stall 2] [--fix]', summary: '**fail 0 까지 반복** — ⛔ 판정은 자동으로 안 붙인다' },
  galaxy: { group: 'daily', usage: 'galaxy <이름> [--dir …]', summary: '저장소를 읽어 은하 좌표 초안을 만든다' },
  observe: { group: 'daily', usage: 'observe [--update]', summary: '은하의 법칙 위반을 잰다' },
  new: { group: 'daily', usage: 'new <은하> <태양계> <별>', summary: '빅뱅 — 별을 태어나게 한다' },
  verify: { group: 'daily', usage: 'verify [--stage <id>]', summary: '게이트 + 관문 — 지금 워킹트리를 잰다' },
  check: { group: 'daily', usage: 'check', summary: '관문 전부 — 라운드를 열지 않고 돌린다' },
  round: { group: 'daily', usage: 'round new|close', summary: '라운드 궤도 — 평가를 확인하고 성운으로 승격한다' },
  hooks: { group: 'daily', usage: 'hooks [--install]', summary: '커밋 시점 관문을 켠다' },
  learn: { group: 'daily', usage: 'learn [--check|--promote]', summary: '궤적을 읽어 성운 후보를 낸다 / 판단했는가' },
  'learn-cards': { group: 'gate', usage: 'learn-cards [--galaxy …] [--write] [--min 2]', summary: '반복 반려 → **브리핑 카드** (모델 호출 0회)' },
  extract: { group: 'daily', usage: 'extract [--write]', summary: '성공 궤적에서 지식 카드를 뽑는다 (기본은 모델 0회)' },

  /* ── 관문이 알아서 부르는 것 ────────────────────────────── */
  laws: { group: 'gate', usage: 'laws', summary: '우주 자신의 형식 검사' },
  links: { group: 'gate', usage: 'links', summary: '문서 링크가 실재하는 곳을 가리키는가' },
  checks: { group: 'gate', usage: 'checks', summary: '**검사가 정말 무는가** — 변이를 넣어 본다' },
  mutate: { group: 'gate', usage: 'mutate --file … --from … --to … --expect … -- <명령>', summary: '**손 변이**가 정말 물었는지 — 사고로 죽은 것과 가른다' },
  beacon: { group: 'gate', usage: 'beacon [--record]', summary: '위키가 낡았는가 (발행 뒤 --record)' },
  wiki: { group: 'gate', usage: 'wiki [<디렉터리>]', summary: '위키 본문이 발행본과 같은가' },
  structure: { group: 'gate', usage: 'structure [--check]', summary: '폴더 구조 그림을 다시 그린다 / 낡았는지 본다' },
  args: { group: 'gate', usage: 'args', summary: '받는 인자·광고하는 인자·문서가 셋 다 맞는가' },
  proven: { group: 'gate', usage: 'proven [--check]', summary: '발동이 증명된 규칙 명부를 만든다' },
  corpora: { group: 'gate', usage: 'corpora', summary: '인용한 수치의 대상이 아직 있는가' },
  coordinates: { group: 'gate', usage: 'coordinates', summary: '커밋되는 것에 **그 기계에만 있는 경로**가 있는가' },
  qa: { group: 'gate', usage: 'qa', summary: '흡수한 TC 도구의 시험을 돌린다 — **비켜선 수까지** 말한다' },
  quickstart: { group: 'gate', usage: 'quickstart', summary: '문서 순서를 빈 저장소에서 그대로 밟는다' },
  facts: { group: 'gate', usage: 'facts [--check]', summary: '문서의 「지금 상태」 수치를 생성한다' },
  lint: { group: 'gate', usage: 'lint [--update]', summary: '은하의 lint 를 기준선과 대조한다 (절대 0이 아니다)' },
  speed: { group: 'gate', usage: 'speed [--update]', summary: '초기 로드가 예산 안인가 (광속 한계)' },
  names: { group: 'gate', usage: 'names [--update]', summary: '이름 충돌 — 판단하지 않은 것이 있는가' },
  enumeration: { group: 'gate', usage: 'enumeration [--update]', summary: '규칙이 사람이 정한 이름을 열거하는가 (§9)' },
  fix: { group: 'gate', usage: 'fix [--update]', summary: '규칙이 무엇을 하라고 말하는가 — 처방을 잰다' },
  messy: { group: 'gate', usage: 'messy [--check]', summary: '일부러 더러운 은하를 규칙 표에서 생성한다' },
  parts: { group: 'gate', usage: 'parts', summary: '부품 시험 — lib/ 의 순수 함수들' },
  liveness: { group: 'gate', usage: 'liveness [--galaxy …]', summary: '세션이 **살아 있는가** — 있는 것과 살아 있는 것은 다르다' },
  census: { group: 'gate', usage: 'census [--galaxy …|--dir …]', summary: '규칙이 **얼마나 못 읽는가** — 분모와 함께 센다' },
  console: { group: 'gate', usage: 'console', summary: '콘솔이 **뜨고, 못 찾은 것을 못 찾았다고 말하는가**' },
  orphans: { group: 'gate', usage: 'orphans', summary: '아무도 안 가리키는 별을 센다' },
  delivery: { group: 'gate', usage: 'delivery', summary: '**배달본이 도는가** — 빈 곳에 깔아 본다' },
  render: { group: 'gate', usage: 'render', summary: '발행본을 조립한다' },
  publish: { group: 'gate', usage: 'publish [--dry-run]', summary: '위키로 전파한다 (Confluence)' },
};

/**
 * ⚠️ **배분표에 없는 관문이 둘 있다** — `observatory/verify-coordinates.mjs`(좌표 감사)와
 * `beacon/wiki.mjs`(git 위키 발행). 관문 목록에는 있어서 `universe check` 로는 돌지만
 * **`universe <이름>` 으로는 못 부른다.** 처음 이 명부를 쓰면서 있는 줄 알고 적었다가
 * 양방향 검사에 걸려서 알았다 — 손으로 적는 목록이 무엇을 숨기는지의 실례다(R91).
 * ⛔ 지어낸 것을 그대로 두지 않고 뺐다. 배분표에 더할지는 따로 판단한다.
 */

/**
 * **돈이 드는 갈래.** 대화형 입구가 이것들에는 **한 번 더 묻는다.**
 *
 * ⚠️⚠️ 「공짜인 줄 알고 돌렸다」가 이 저장소가 가장 싫어하는 사건이다(R145).
 * 메뉴는 고르기 쉬우므로 **실수도 쉽다** — 쉬워진 만큼 여기서 막아야 한다.
 * ⛔ 막는 것이 아니라 **말하고 확인받는** 것이다. 사람이 정한다.
 */
export const COSTS_MONEY = {
  'new --from': '3차 팽창은 **모델을 턴 수만큼 부른다**(구독이든 API 든 사용량을 쓴다).',
  'extract --write': '궤적 **한 건에 모델 한 번**이다. 몇 건인지 먼저 세어서 말한다.',
};

/** 사람이 치는 것만. 대화형 입구와 기본 도움말이 쓴다. */
export const dailyCommands = () => Object.entries(COMMANDS).filter(([, meta]) => meta.group === 'daily');

/** 관문이 부르는 것. `--all` 일 때만 보인다. */
export const gateCommands = () => Object.entries(COMMANDS).filter(([, meta]) => meta.group === 'gate');

/**
 * **화면에서 차지하는 칸 수.** 글자 수가 아니다.
 *
 * ⚠️⚠️ `padEnd` 는 **글자 수**로 채우는데 한글·한자·가나는 터미널에서 **두 칸**을 먹는다.
 * 그래서 `universe new <은하> <태양계> <별>` 같은 줄이 실제로는 훨씬 넓은데 좁게 세어져
 * **표가 어긋난다.** 처음 이 도움말을 만들고 화면을 보고서야 알았다 —
 * 「글자 수 = 너비」는 영어만 쓰는 자리에서만 참이다.
 * ⛔ 범위를 열거하지 않는다 — 유니코드가 정한 **East Asian Wide/Fullwidth** 구간을 쓴다.
 */
const displayWidth = (text) => [...text]
  .reduce((sum, ch) => sum + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1), 0);

/**
 * 도움말 한 줄. **여기 하나에서 만든다** — 문자열을 다른 곳에 또 쓰지 않는다.
 * ⚠️ 줄을 맞추는 폭은 가장 긴 `usage` 에서 **재서** 정한다. 손으로 세면 명령을 더할 때마다 어긋난다.
 */
export const helpLine = (name, meta, width) =>
  `  universe ${meta.usage}${' '.repeat(Math.max(0, width - displayWidth(meta.usage)))}  ${meta.summary}`;

/**
 * **뭐라고 쳐야 도는가** — 도구가 **맞는 말을 하게** 한다.
 *
 * ## ⛔ 왜 필요한가 — 못 부를 명령을 가르치고 있었다
 *
 * 대화형 입구의 존재 이유는 **명령줄을 가르치는 것**인데, 가르치던 그 `universe …` 가
 * **이 기계에 없는 명령**이었다(실측: 사용자가 그대로 쳤고 `command not found` 가 났다).
 * 문서는 `node <우주-저장소>/bin/universe.mjs` 로 부르라 하고, 도움말과 메뉴는 `universe` 라
 * 적고 있었다 — **두 말이 달랐다.** 화면이 가르친 것이 안 도는 것은 안 가르친 것만 못하다.
 *
 * ⇒ **이어져 있으면** `universe`, **아니면** 실제로 도는 `node …/bin/universe.mjs` 를 말한다.
 * ⛔ 짐작하지 않는다 — PATH 에서 찾은 것이 **이 패키지의 그것인지** 실경로로 확인한 결과를 받는다.
 *
 * @param {string|null} resolved PATH 에서 찾은 `universe` 의 실경로(못 찾았으면 null)
 * @param {string} packageHome 이 패키지의 집
 */
export const invocationLabel = (resolved, packageHome) =>
  (resolved === `${packageHome}/bin/universe.mjs` ? 'universe' : `node ${packageHome}/bin/universe.mjs`);

/** 표를 맞출 폭 — **화면 칸 수**로 잰다. 빈 목록이면 0. */
export const usageWidth = (entries) => entries.reduce((max, [, meta]) => Math.max(max, displayWidth(meta.usage)), 0);
