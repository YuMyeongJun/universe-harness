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
  { scope: 'universe', label: '열거 감사', file: 'observatory/verify-enumeration.mjs' },
  { scope: 'universe', label: '처방 감사', file: 'observatory/verify-fix.mjs' },
  { scope: 'universe', needsEngine: true, label: '더러운 은하', file: 'fixtures/messy-galaxy/generate.mjs', args: ['--check'] },
  { label: '부품 시험', file: 'lib/selftest.mjs' },
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
  { scope: 'universe', needsEngine: true, label: '문서의 지금 상태', file: 'observatory/render-facts.mjs', args: ['--check'] },
  { scope: 'universe', needsEngine: true, label: '발동 증명 명부', file: 'observatory/render-proven.mjs', args: ['--check'] },
  { scope: 'universe', label: '말뭉치 감사', file: 'observatory/verify-corpora.mjs' },
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
  /* ⚠️⚠️ **사유가 바뀌었다**(R151). 예전 사유는 「혼자 못 돈다 — 위키 본문은 MCP 로만 읽히고
     스크립트의 손이 안 닿는다」였다. 위키를 **git 위키**로 옮기면서 그 전제가 사라졌다 —
     이제 스스로 `clone` 해서 **바이트로** 대조한다(R17 의 근거가 없어졌다).
     ⛔ 그런데 아직 관문에 못 넣는다. 사유가 **다르다**: 네트워크와 위키 초기화가 필요하다.
     낡은 사유를 그대로 두면 「아직도 MCP 때문」인 줄 안다 — 사유가 낡는 것도 결함이다. */
  'observatory/verify-wiki.mjs':
    '이제 혼자 돈다(git 위키를 스스로 클론한다 · R151). 다만 **네트워크**가 필요하고 위키가 한 번은 만들어져 있어야 한다 — 갓 클론한 우주·오프라인 CI 에서는 「못 쟀다」로 조용히 지나가므로 관문에 넣으면 재는 척만 하게 된다. 위키가 서고 나서 다시 판단한다',
};
