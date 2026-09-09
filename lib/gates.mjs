/**
 * **관문 목록 — 한 자리.**
 *
 * ⚠️⚠️ 예전엔 이 목록이 `round close` 안에만 있었다. 그래서 **라운드를 열지 않으면
 * 관문 전체를 돌릴 방법이 없었다** — 소비 저장소에는 라운드가 없는데도.
 * 그리고 목록을 두 자리에 복사하면 한 자리만 늘어나 조용히 갈린다(R47 이 그 종류를 잡았다).
 *
 * ⛔ **여기 없는 것은 관문이 아니다.** 검사를 만들었으면 여기 적어야 돈다.
 */
/**
 * `scope: 'universe'` 는 **우주 자신의 저장소에서만** 뜻이 있는 검사다 —
 * 규칙 소스·픽스처·엔진을 읽는데 그것들은 **배달되지 않는다**(보존 법칙).
 *
 * ⚠️⚠️ 실측(R58): 소비 저장소에서 관문 전부를 돌려 보니 **13개 중 9개가 빨간불**이었다.
 * 고장이 아니라 **거기서는 잴 수 없는 것들**이었는데, 화면은 「빨간불 9개」라고만 했다.
 * 그것을 본 사람은 도구가 깨진 줄 안다 — 그리고 관문을 안 믿는 법부터 배운다.
 * ⇒ 갈라서 **「거기선 못 잰다」고 말한다.** 조용히 빼지도, 실패로 세지도 않는다(§8).
 */
/**
 * `needsEngine: true` — **엔진(빌드된 dist·설치된 의존성)이 있어야** 뜻이 있는 검사다.
 * ⚠️⚠️ 실측(R82): **갓 클론한 우주**에서 `universe check` 가 빨간불 6개를 냈다.
 * `dist` 는 gitignore 라 없는 것이 **정상**인데, 받은 사람은 **깨진 도구**를 본다.
 * ⛔ 문자열로 짐작하지 않는다 — 어떤 검사는 엔진 없이도 다른 이유로 죽어 사유가 안 보인다.
 * 관문 자신이 「나는 엔진이 필요하다」고 말한다.
 */
/**
 * **관문이 「못 쟀다」고 말하는 법 — 종료코드 3.**
 *
 * ⚠️⚠️ 실측(R154 · CI 가 잡았다): `learn --check` 는 궤적이 하나도 없으면
 * 「⚠️ 궤적 파일이 하나도 없다」고 **말은 하면서 exit 0** 으로 끝냈다. 부르는 쪽은
 * 종료코드만 보므로 화면에는 **`✅ 학습 후보 감사`** 가 찍혔다 — **아무것도 안 쟀는데.**
 * 로컬에는 궤적이 있어서 혼자서는 영영 못 볼 자리였다.
 *
 * R146 이 **신호**를 셋으로 갈랐다(✅ 잰 초록 · ❌ 잰 빨강 · ⚪ 못 쟀다).
 * 그런데 **관문** 자신은 여전히 둘뿐이었다 — 0 아니면 1. 같은 결함이 한 층 위에 남아 있었다.
 * ⇒ 관문도 셋으로 말한다. `3` 은 「여기선 잴 수 없었다」이고 **통과가 아니다.**
 *
 * ⛔ 실패로 세지 마라. ⛔ 통과로도 세지 마라. 따로 세고 **이름을 불러라.**
 */
export const EXIT_UNMEASURED = 3;

export const GATES = [
  { label: '우주 형식', file: 'observatory/verify-laws.sh' },
  /**
   * ⚠️⚠️ **R58 에서 내가 이것을 「우주 전용」으로 잘못 표시했다.**
   * 소비 저장소의 사본으로 돌리면 엔진이 없어 죽는데, 그것을 보고 「거기선 못 잰다」로 묶었다.
   * 그런데 이 검사는 **소비 저장소의 은하를 재는 가장 중요한 검사**다 —
   * 패키지 쪽에서 `--universe` 로 겨누면 멀쩡히 돈다(실측 R59).
   * ⇒ 「못 잰다」가 아니라 **「어디서 돌려야 하는가」**의 문제였다.
   */
  { runsFrom: 'package', needsEngine: true, label: '법칙 관측', file: 'observatory/observe.mjs' },
  /* ⚠️ lint 는 은하의 도구 사슬을 돌린다 — 픽스처에선 0.8초지만 진짜 은하에선 8초쯤이다.
     그래도 관문에 둔다: **늘었는지**만 보므로 트렁크가 빨간 팀도 첫날부터 쓸 수 있다(R61). */
  { runsFrom: 'package', label: 'lint 드리프트', file: 'observatory/lint-drift.mjs' },
  /* ⚠️ **빌드를 돌린다** — 픽스처 1.1초, 진짜 은하 10초쯤이고 `dist/` 를 다시 쓴다.
     그래도 관문에 둔다: 광속 한계는 **관문이 없어서 오래 장식이었다**(R62). */
  { runsFrom: 'package', needsEngine: true, label: '광속 한계', file: 'observatory/light-speed.mjs' },
  { label: '문서 링크', file: 'observatory/verify-links.mjs' },
  { scope: 'universe', label: '인자 관측', file: 'observatory/verify-args.mjs' },
  { scope: 'universe', needsEngine: true, label: '검사가 무는가', file: 'observatory/verify-checks.mjs', noMutation: '이 파일이 변이를 거는 하네스 자신이다 — 자기를 변이시키면 판정하는 쪽이 사라진다. 대신 거부 사유·말·§7·잠금 갈래가 자기를 잰다' },
  { label: '행동 계약 보호', file: 'bigbang/selftest-behavior-contract.mjs' },
  /* ⚠️ 엔진 selftest 를 관문에 단 이유는 사고 때문이다 — 커밋 3a5bab8 이 다른 갈래의
     **변이 중인 규칙 파일을 그대로 삼켜** `a11y/img-alt` 가 HEAD 에서 죽어 있었다. */
  { scope: 'universe', needsEngine: true, label: '엔진 계약 규칙', file: 'observatory/engine/packages/@core/fe-agent-contracts/src/selftest.ts', noMutation: '규칙 19개마다 known-positive·known-negative 를 자기 안에 들고 있다(R07). 밖에서 변이를 걸려면 엔진 dist 를 다시 빌드해야 해 한 번에 30초가 넘는다' },
  /* 원본이 도는 것과 **배달본이 도는 것은 다르다** — 42커밋 동안 달랐다. */
  { scope: 'universe', needsEngine: true, label: '배달본이 도는가', file: 'observatory/verify-delivery.mjs' },
  { scope: 'universe', label: '폴더 구조 그림', file: 'observatory/render-structure.mjs', args: ['--check'] },
  { scope: 'universe', label: '이름 충돌', file: 'observatory/verify-names.mjs' },
  /* ⚠️ MIT 로 공개하고 밀었더니 `galaxies/backoffice.json` 의 `path` 가 `/Users/…/orca/…` 였다 —
     **남의 홈 경로가 공개 저장소에 올라가 있었다**(R152). 회사 이름을 열거해 막지 않는다(§9):
     「절대 경로는 그 기계에만 있다」는 **구조**로 잰다. 로컬 명부는 안 본다 — 거기가 옳은 자리다. */
  { scope: 'universe', label: '좌표 감사', file: 'observatory/verify-coordinates.mjs' },
  /* ⚠️ 「게이트는 별이 도는지 볼 뿐 **사람이 볼 수 있는지는 안 본다**」를 이 저장소가 세 자리에
     적어 두고도 재지 않았다(R157). 3차는 patch 를 별의 폴더로 묶어서 **구조적으로** 고아를 만든다.
     ⛔ 갓 만든 별은 세지 않는다 — **커밋된 별**만 본다(커밋은 「이걸로 됐다」는 말이다). */
  { scope: 'universe', label: '고아 별', file: 'observatory/verify-orphans.mjs' },
  { scope: 'universe', label: '열거 감사', file: 'observatory/verify-enumeration.mjs' },
  { scope: 'universe', label: '처방 감사', file: 'observatory/verify-fix.mjs' },
  { scope: 'universe', needsEngine: true, label: '더러운 은하', file: 'fixtures/messy-galaxy/generate.mjs', args: ['--check'] },
  /**
   * ⚠️⚠️ **`scope: 'universe'` 로 고쳤다 — 소비 저장소에서 ❌ 로 죽고 있었다(실측 2026-09-08).**
   * `lib/selftest.mjs` 는 우주 자신의 **소스를 읽는다** — 예를 들어
   * `observatory/verify-checks.mjs` 를 열어 「변이 케이스가 전부 `expect:` 를 적었는가」를 잰다.
   * 그 파일은 `scope: 'universe'` 라 **배달되지 않으므로**, 갓 깐 소비 저장소에서는
   * `ENOENT` 로 죽고 관문에 **빨간불**로 찍혔다.
   * ⛔ 그건 「그 저장소가 잘못됐다」가 아니라 **거기서 잴 것이 아니다**라는 뜻이다.
   *    갓 깐 사람이 그 빨간불을 보면 도구가 깨진 줄 알고 관문을 안 믿는 법부터 배운다(R58 과 같은 종류).
   * ⚠️ 우주 자신의 저장소에서는 **그대로 돈다** — 커버리지는 줄지 않았다.
   */
  { scope: 'universe', label: '부품 시험', file: 'lib/selftest.mjs' },
  /* ⚠️ 3차는 **가장 비싼 갈래인데 가장 안 재지던 갈래**였다 — 실주행은 사람의 사용량을 쓰므로
     관문에 못 넣는다. 대본(`--agent-script`)은 같은 배선을 **모델 없이** 지나가므로 공짜다.
     그래서 여기 둔다: 범위 관문 · 게이트 · 요구사항 신호 셋이 살아 있는지만 본다(R147). */
  { scope: 'universe', needsEngine: true, label: '3차 배선', file: 'observatory/verify-nebula-wiring.mjs' },
  /* 크기 한계만 본다 — 발행 신선도는 자격증명이 있어야 판정되므로 관문이 될 수 없다. */
  /* ⚠️ `beacon/` 은 배달 목록에 없다(위키 발행은 우주 자신의 일이다). 그런데 이 검사만
     `observatory/` 에 실려 가서 소비 저장소에서 「렌더가 실패했다」로 빨간불이 났다(R58). */
  { scope: 'universe', label: '발행본 크기', file: 'observatory/verify-beacon.mjs', args: ['--local'] },
  /* 궤적에만 남은 관측은 실행되지 않는다 — 성운의 법을 궤적에도 건다(R48). */
  { label: '학습 후보 감사', file: 'observatory/learn.mjs', args: ['--check'] },
  /**
   * 반복 반려 → 브리핑 카드의 **훑개**를 잰다. ⛔ 모델을 안 부른다 — `extract.mjs` 를 관문
   * 밖에 둔 사유(돈이 나간다)가 여기엔 없다. 궤적을 읽고 문자열을 세는 것뿐이다.
   *
   * ⚠️ 이 관문이 지키는 것은 **「반려는 있는데 사유를 하나도 못 붙였다」**는 자리다.
   * 훑개가 눈멀면 카드는 영영 0장인데 화면은 「반복 실패가 없다」로 보인다(§8).
   */
  {
    label: '카드 훑개',
    file: 'observatory/learn-cards.mjs',
    args: ['--self-test'],
    /* ⛔ `noMutation` 을 쓰지 않는다 — **등재할 수 있는데 비켜간 것**이 이 세션에 잡은 병이다
       (「확인한 변이가 등재 없이 떠 있었다」). 훑개를 눈멀게 하는 변이를 `verify-checks` 에 박았다. */
  },
  /**
   * ⛔ **선언이 없으면 ⚪ 가 매번 뜬다 — 그것이 이 관문을 넣은 이유다.**
   * 「아무 은하도 세션 생존을 선언 안 했다」는 **보여야 하는 사실**이다. 안 보이면
   * 나중에 세션이 죽어 「전부 fail」이 났을 때 아무도 그것이 제품 결함이 아님을 모른다.
   * ⚠️ `verify-wiki` 를 관문 밖에 둔 사유(「늘 못 쟀다면 재는 척만 한다」)와 **다르다** —
   *    저건 **네트워크**가 없어서 우리 손 밖이고, 이건 **좌표에 한 줄 적으면** 재진다.
   */
  /**
   * ⛔ **「범용」이라 부르려면 얼마나 못 보는지 먼저 알아야 한다.**
   * 규칙은 `.ts`/`.tsx` 만 읽는다 — `.js`·`.jsx`·`.vue` 도 못 읽는다. 그 비율을 **재서 말한다.**
   * ⚠️ 이 관문은 **판단하지 않는다.** 「이 비율이면 못 쓴다」는 사람이 정한다.
   */
  /* ⚠️ **인자를 준다.** 이 도구는 「훑을 자리를 하나만 정해라」고 요구한다 — 관문이
     인자 없이 부르면 그 거절에 걸린다(등재하고 나서야 알았다).
     ⛔ 여러 은하를 한 번에 세지 않는다: 섞으면 **어느 저장소의 비율인지 사람이 못 가린다.**
     ⚠️⚠️ 예전엔 `--galaxy console` 이었다. 화면(콘솔)을 이 제품의 범위에서 빼면서 그 은하가
     목록에서 사라졌고, 그대로 두면 이 관문이 **영원히 ⚪** 가 된다 — 「좌표 파일이 없다」로.
     ⛔ ⚪ 가 배경 소음이 되면 사람은 그것을 안 읽는다. ⇒ 늘 있는 픽스처 은하로 옮긴다.
     ⚠️ 소비 저장소에서는 이 이름도 없어서 ⚪ 다 — **그건 맞는 판정이다**(잴 대상이 그 저장소의 것이라). */
  { label: '못 읽는 비율', file: 'observatory/blind-census.mjs', args: ['--galaxy', 'tiny-galaxy'] },
  { scope: 'universe', needsEngine: true, label: '문서의 지금 상태', file: 'observatory/render-facts.mjs', args: ['--check'] },
  { scope: 'universe', needsEngine: true, label: '발동 증명 명부', file: 'observatory/render-proven.mjs', args: ['--check'] },
  { scope: 'universe', label: '말뭉치 감사', file: 'observatory/verify-corpora.mjs' },
  /* ⛔ 틀 자체가 **배선 안 된 검사기**가 되면 안 된다 — 이 저장소가 그 상태를 두 번 겪었다.
     임시 파일로만 돌아 저장소를 안 건드린다. */
  /* ⛔ 초안을 **떠 보는 것으로 끝내지 않는다** — 그대로 걸어서 관측이 파일을 보는지 잰다.
     「코드가 없는 자리를 가리키는 좌표」는 그 은하를 **영원히 조용하게** 만든다(R163). */
  { scope: 'universe', needsEngine: true, label: '초안이 도는가', file: 'observatory/probe-draft.sh' },
  /* `universe clone` 이 참인가. ⛔ 네트워크를 안 쓴다 — `file://` 로 잰다. */
  { scope: 'universe', label: '주소로 받아 오는가', file: 'observatory/probe-clone.sh' },
  /* `universe repos` 가 참인가. ⛔ 네트워크에 안 기댄다 — gh 가 없는 상태를 만들어 잰다. */
  { scope: 'universe', label: '레포를 고르는가', file: 'observatory/probe-repos.sh' },
  /* `universe blueprint` — 「없으면 ⚪ · 모델은 --write 로만」이 참인가. ⛔ 모델을 안 부르는 갈래만 잰다. */
  { scope: 'universe', label: '구조 설명이 있는가', file: 'observatory/probe-blueprint.sh' },
  /* ⚠️⚠️ 2026-09-09: 화면을 뺄 때 이 넷도 같이 뺐다가 **되돌렸다.** 이것들은 화면이 아니라
     **터미널 명령**(`galaxy`·`clone`·`repos`·`blueprint`)을 잰다 — 빼는 순간 그 넷이
     아무도 안 재는 상태가 됐다. ⛔ 「화면 관련」이라는 말이 넓게 잡히면 재던 것까지 같이 나간다.
     ⚠️ 다섯째였던 `probe-loop.sh` 만은 못 되돌렸다 — 사유는 아래 NOT_GATED 에 적었다. */
  { scope: 'universe', label: '손 변이 틀', file: 'observatory/mutate.mjs', args: ['--self-test'] },
  { scope: 'universe', needsEngine: true, label: '새 사람의 길', file: 'observatory/verify-quickstart.mjs' },
  { scope: 'universe', needsEngine: true, label: '새 사람의 길 — 모노레포', file: 'observatory/verify-quickstart.mjs', args: ['--monorepo'] },
];

/**
 * 관문 **밖**에 두는 도구 — 사유 없이는 못 뺀다.
 *
 * ⛔ 실측(R91): 손으로 적은 목록은 결함을 숨긴다. 관문 목록도 손 목록이라, 도구를 만들고
 * 등록을 잊으면 **아무도 안 돌리는 검사**가 된다 — R08 이 실측으로 증명한 그 자리다
 * (엔진 규칙 11개를 덮은 지 한 시간도 안 돼 하나가 죽은 채 커밋됐다).
 * 그래서 「관문에 없는 도구 0개」가 아니라 **「판단하지 않은 도구 0개」**를 센다.
 */
export const NOT_GATED = {
  /**
   * ── ⛔ **화면(콘솔·TC)은 2026-09-09 에 `feat/console-screens` 가지로 나갔다.**
   *
   * `app/universe/`(콘솔) · `qa/`(흡수한 TC 도구)와 그것들만 재던 탐침 다섯이 이 가지에서
   * 통째로 빠졌다(콘솔·TC·세션 생존). 재는 것 자체는 옳았지만, 화면이 관문 39개 중 10개와 사람이 치는 명령의
   * 3분의 1을 차지하면서 **이 제품이 무엇인지가 흐려졌다** — 법칙·관측·빅뱅이 아니라
   * 「콘솔과 TC 도구」로 보였고, 새로 오는 사람이 사용법에서 화면부터 만났다.
   *
   * ⛔ **지운 것이 아니다.** `git show feat/console-screens:app/universe/...` 로 그대로 있다.
   * ⚠️ 되돌릴 때는 파일만 되살리지 말고 **관문에도 다시 등재해라** — 옮겨 온 시험은 옮겨 온
   *    순간부터 아무도 안 돌린다(이 저장소가 `qa/tests` 239개로 이미 겪었다).
   */
  /* ⛔ **관문은 이 도구를 탐침(`probe-loop.sh`)으로 돌린다** — 직접 등재하면 은하가
     `commands.e2e` 를 선언 안 한 지금 **관문이 매번 ⚪ 로 물든다**. 그건 「못 쟀다」가 맞지만,
     그 상태로 두면 사람은 ⚪ 를 **배경 소음**으로 배운다. ⇒ 셋으로 갈리는가를 탐침이 재고,
     실제 은하에 걸어 보는 것은 그 은하가 축을 선언한 뒤다. */
  /* ⛔ 관문은 이 도구를 탐침(`probe-loop.sh`)으로 돌린다 — 직접 등재하면 축을 선언한 은하가
     하나뿐인 지금 **관문이 매 바퀴 브라우저를 띄운다.** 느린 관문은 아무도 안 본다. */
  /**
   * ⛔⛔ **2026-09-09 — 이 둘은 지금 이 가지에서 아무도 안 잰다. 그렇게 적어 둔다.**
   *
   * `probe-loop.sh` 가 「끝났는가」의 세 갈래(끝났다 0 · 남았다 1 · 못 쟀다 3)를 재고 있었다.
   * 그런데 그 탐침의 네 갈래 중 **셋이 TC 도구(`qa/`)의 얼려 둔 리포트와 TC 원장**에 매여
   * 있었다 — 그것이 화면과 함께 `feat/console-screens` 로 나가면서 **잴 재료가 없어졌다.**
   * ⚠️ 은하를 픽스처로 바꿔 붙여 보았지만 `real-run.json` 의 케이스가 전부 「구현에서 나온 TC」라
   *    검증 분모가 0이 되어 **언제나 ⚪** 였다 — 그건 재는 것이 아니라 **재는 척**이다.
   * ⛔ 그래서 억지로 초록을 만들지 않고 **뺐다.** ⚠️ 그 대가는 정확히 이것이다:
   *    **`universe loop` 와 `universe repeat` 는 지금 관문이 안 문다.** 고장 나도 조용하다.
   * ⇒ 되살리려면 TC 원장을 가진 은하가 이 가지에 하나 있어야 한다. 그때 `probe-loop.sh` 를
   *   `feat/console-screens` 에서 꺼내 GATES 로 되돌려라.
   */
  'observatory/loop-state.mjs':
    '⚠️ **지금 아무도 안 잰다** — 재던 탐침(probe-loop.sh)이 TC 도구와 함께 나갔다(2026-09-09)',
  'observatory/repeat.mjs':
    '⚠️ **지금 아무도 안 잰다** — 같은 사유. 실제 반복은 사람이 부른다(브라우저를 띄운다)',
  /* ⛔ 관문에 직접 등재하지 않는다 — **`--write` 면 모델을 부른다.** 관문은 커밋마다·CI 마다
     도는 자리라 여기 넣으면 **돈이 조용히 나간다**(R145 가 못 박은 그 부류). 탐침
     (`probe-blueprint.sh`)이 **모델을 안 부르는 갈래만** 재고, 만드는 것은 사람이 부른다. */
  'observatory/blueprint.mjs':
    '탐침(probe-blueprint.sh)이 모델 없는 갈래를 재고, `--write` 는 모델을 부르므로 관문에 안 넣는다',
  /* ⛔ **모델을 부른다** — 궤적 한 건에 한 번이다. 관문은 커밋마다·CI 마다 도는 자리라
     여기 넣으면 **돈이 조용히 나간다**(R145 가 못 박은 그 부류다). 기본이 `--write` 없이는
     모델을 안 부르게 돼 있지만, 그건 「관문에 넣어도 된다」는 뜻이 아니다 —
     넣으면 아무것도 안 뽑으면서 **재는 척만** 하게 된다(R155). */
  'observatory/extract.mjs':
    '모델을 부른다(궤적 한 건에 한 번) — 관문은 커밋마다 도는 자리라 넣으면 돈이 조용히 나간다. `--write` 없이는 안 부르지만 그러면 아무것도 안 뽑으면서 재는 척만 하게 된다',

  /* ⚠️⚠️ **사유가 바뀌었다**(R151). 예전 사유는 「혼자 못 돈다 — 위키 본문은 MCP 로만 읽히고
     스크립트의 손이 안 닿는다」였다. 위키를 **git 위키**로 옮기면서 그 전제가 사라졌다 —
     이제 스스로 `clone` 해서 **바이트로** 대조한다(R17 의 근거가 없어졌다).
     ⛔ 그런데 아직 관문에 못 넣는다. 사유가 **다르다**: 네트워크와 위키 초기화가 필요하다.
     낡은 사유를 그대로 두면 「아직도 MCP 때문」인 줄 안다 — 사유가 낡는 것도 결함이다. */
  /* ⛔ **은하가 있어야 뜻이 있다.** 이것은 은하 하나를 골라 그 저장소의 **진짜 build·test**
     를 돌린다(게이트). 관문은 우주 자신을 재는 자리라 어느 은하를 고를지 정할 수 없고,
     고르면 그 은하가 없는 기계에서 통째로 빨개진다.
     ⚠️ 이 항목은 **훑개를 이름 규칙에서 구조(shebang)로 바꾸자 드러났다**(R162) —
        예전 훑개는 `verify-*` 만 봐서 `verify.mjs` 를 **7년째 안 보고 있었다.** */
  'observatory/verify.mjs':
    '은하 하나를 골라 그 저장소의 진짜 build·test 를 돌린다 — 관문은 우주 자신을 재는 자리라 은하를 고를 수 없고, 고르면 그 은하가 없는 기계에서 통째로 빨개진다. `universe verify --galaxy <이름>` 으로 사람이 부른다',

  /* ⚠️ **「본문을 한 장도 못 받았다」 갈래(⚪ 3)는 손으로만 확인했다** — 등재를 못 한다.
     변이 틀은 **초록 기준선**을 요구하는데, 이 도구는 빈 위키를 주면 (옳게) ⚪ 로 죽고,
     초록을 만들려면 **발행본 사본을 픽스처로 얼려야** 한다 — 그 사본은 문서가 바뀌면 낡는다.
     ⛔ 낡는 픽스처를 심어 초록을 사는 것은 이 저장소가 계속 지워 온 그 거래다.
     ⇒ 실측만 적어 둔다: `node observatory/verify-wiki.mjs fixtures/empty-wiki` → **exit 3**. */
  /* ⚠️ **「낡았다 vs 손으로 고쳐졌다」 갈림은 손으로만 쟀다** — 등재를 못 한다.
     지금 위키가 **낡아 있어서**(어제 발행본) 이 도구의 기준선이 빨갛고, 변이 틀은 초록 기준선을
     요구한다(「기준선이 초록일 수 있는가」가 갈림점이다). 실측은 이렇다:
       날짜 비교를 끄면 → 「7장은 **날짜가 같은데도 다르다**」 · 켜면 → 「위키가 **낡았다**」.
     ⛔ 발행하면 초록이 되겠지만, **발행은 사람이 판단한다** — 초록을 사려고 밖으로 내보내지 않는다. */
  'observatory/verify-wiki.mjs':
    '이제 혼자 돈다(git 위키를 스스로 클론한다 · R151). 다만 **네트워크**가 필요하고 위키가 한 번은 만들어져 있어야 한다 — 갓 클론한 우주·오프라인 CI 에서는 「못 쟀다」로 조용히 지나가므로 관문에 넣으면 재는 척만 하게 된다. 위키가 서고 나서 다시 판단한다',
};

/**
 * **커밋 관문이 무엇을 도는가 — 훅에서 읽는다.**
 *
 * ⛔ 손으로 적은 목록은 낡는다. 이 저장소는 그걸로 두 번 데였다 —
 * `universe hooks --install` 의 안내가 넷을 적는데 훅은 다섯을 돌았고(R73),
 * **2026-09-08 에는 여섯 중 하나(`법칙 관측`)를 빠뜨렸다.** 두 번째는 더 나쁘다:
 * 낡음을 막으려고 「훅에서 읽는」 장치를 이미 만들어 뒀는데, 훑개가 `^run '` 이라
 * **줄 앞에 여백이 있는 호출을 못 봤다.** `법칙 관측` 은 CLI 를 못 찾으면 막는
 * `if/else` 안에 있어 들여쓰여 있다 — 즉 **가장 중요한 검사만** 안내에서 사라졌다.
 * ⇒ 훑개를 여백에 관대하게 만들고, 그 사실을 시험으로 못박는다(`lib/selftest.mjs`).
 */
export const hookLabels = (hookText) =>
  [...hookText.matchAll(/^\s*run\s+'([^']+)'/gm)].map((m) => m[1]);
