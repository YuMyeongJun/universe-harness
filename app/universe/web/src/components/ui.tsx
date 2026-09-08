import type { ReactNode } from 'react';



/**
 * 콘솔의 작은 조각들.
 *
 * ⚠️ **클래스 문자열을 합칠 때는 한 속성을 두 번 적지 마라.** tailwind 는 클래스가 적힌
 * 순서가 아니라 **CSS 출력 순서**로 이긴다. `mt-1` 뒤에 `mt-4.5` 를 붙여도 뭐가 이길지
 * 호출부만 봐서는 알 수 없다. 그래서 아래 상수들은 여백처럼 호출부가 덮고 싶어 하는
 * 속성을 **일부러 빼 두었다**(`SUB` 의 위쪽 여백, `HELP_TEXT` 의 여백).
 */

/** 보조 설명 글자. 위쪽 여백은 호출부가 준다 — 자리마다 다르다. */
export const HELP_TEXT = 'block text-xs text-ui-ink-faint';

/** 제목 아래 설명 문단. 위쪽 여백은 호출부가 준다(`mt-1` 이 기본, 0 인 자리가 있다). */
export const SUB = 'mb-5.5 text-ui-ink-dim';

/**
 * ── 카드 한 장 ──
 *
 * ⚠️ **이 문자열은 원래 여섯 곳에 똑같이 적혀 있었다**(`GalaxySelect`·`GalaxyCard`·
 * `Violations`·`RunReport`·`DomainSelect`·`RunTally`). 여섯 벌이 있으면 테마를 바꿀 때
 * 다섯 곳만 고치고 한 곳을 놓치는 날이 오고, 그날 화면은 **반만 새 테마**가 된다.
 * ⇒ 한 자리로 모았다. 지금 우주 테마를 입히면서 실제로 그 일이 생길 뻔했다.
 *
 * ⛔ **카드를 반투명으로 만들지 않았다.** 성운이 카드 뒤로 비치면 예쁘지만, 그러면
 * 카드 위 글자의 대비가 **성운의 위치에 따라 달라진다** — 스크롤 위치마다 다른 값이라
 * 잴 수가 없다. 이 화면은 사람이 판정을 붙이는 자리다. 잴 수 없는 대비는 안 쓴다.
 * (`_space.css` 가 「장식은 판정을 안 나른다」로 못 박은 것의 같은 편이다.)
 */
export const CARD = 'rounded-card border border-ui-line bg-ui-surface p-4';

/** 바로 앞 카드에 이어 붙는 카드 — 위 여백만 다르다. */
export const CARD_NEXT = `mt-3.5 ${CARD}`;

/** 카드 안의 구획 제목. 대문자 눈썹으로 본문과 갈린다. */
export const SECTION = 'mb-3.5 mt-0 text-label font-semibold uppercase tracking-eyebrow text-ui-ink-faint';

/**
 * 카드 **안쪽**의 하위 구획 제목 — 한 단 작고, 위 여백이 있다.
 * ⚠️ `SECTION` 과 크기·여백이 **일부러 다르다.** 카드 밖 구획과 카드 안 구획이 같은
 * 크기면 어느 것이 어느 것에 속하는지가 안 보인다 — 위계는 크기 차이로만 선다.
 */
export const SUBSECTION = 'mb-2.5 mt-4.5 text-xs font-semibold uppercase tracking-eyebrow text-ui-ink-faint';

/** 인라인 코드 — 자리(파일·경로·명령)를 나른다. */
export const CODE = 'rounded-chip bg-ui-surface-sunken px-1.25 py-px font-mono text-xs';

/**
 * **한 칸짜리 본문** — `ConsoleShell` **안쪽**에 놓는 글 읽는 칸.
 *
 * ⚠️ 바깥(`ConsoleShell`)은 화면 높이에 못 박혀 **안 구른다.** 여기서 `overflow-y-auto` 를
 * 안 주면 본문이 길 때 **잘려서 안 보인다** — 4단으로 바꾸며 실제로 그렇게 잘렸다.
 *
 * ⚠️ 이 조각은 원래 `Shell` 이었고 **자기가 레일까지 그렸다.** 다섯 라우트가 전부
 * `ConsoleShell` 을 직접 쓰게 되면서 그 일이 없어졌는데, 지우는 대신 **안쪽 껍질**로 남겼다 —
 * 지웠으면 똑같은 두 줄(`overflow-y-auto` + `max-w-shell`)이 **다섯 군데에 복사**된다.
 * ⛔ 그 복사가 실제로 생겨 있었다(다섯 벌). 한 자리로 모은다.
 */
export function ContentPane({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 overflow-y-auto narrow:overflow-visible">
      <div className="mx-auto max-w-shell px-6 pb-20 pt-7">{children}</div>
    </div>
  );
}

/**
 * ── 궤도 ── 구획을 가르는 선. 가운데가 밝고 양 끝이 바탕으로 사라진다.
 *
 * ⛔ **뜻을 나르지 않는다** — 판정도, 상태도, 경고도 아니다. 이 선이 통째로 사라져도
 * 화면이 하는 말은 하나도 안 줄어야 한다(`_space.css` 와 같은 계약).
 * ⚠️ 그래서 `aria-hidden` 이다. 스크린리더가 「구분선」을 읽어 줄 이유가 없다 —
 * 위계는 제목(`<h1>`·`<h2>`)이 이미 지고 있고, 이건 그것을 **눈으로 한 번 더** 말할 뿐이다.
 * ⛔ `<hr>` 을 안 쓴 이유가 그것이다. `<hr>` 은 의미상 「주제가 바뀐다」인데, 이 선은
 *    제목이 이미 말한 것을 되풀이할 뿐이라 보조기기에 두 번 들릴 이유가 없다.
 */
export function OrbitRule({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`h-px w-full bg-orbit ${className}`} />;
}

export function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-3">
        <span className="text-xs uppercase tracking-eyebrow text-ui-ink-faint">{eyebrow}</span>
      </div>
      <h1 className="text-title font-bold">{title}</h1>
      {/* 제목과 본문 사이의 궤도 — 화면 한 장이 어디서 시작하는지를 눈으로 말한다. */}
      <OrbitRule className="mt-3" />
      {sub && <p className={`mt-3.5 ${SUB}`}>{sub}</p>}
    </div>
  );
}

export function Field({
  label,
  sub,
  help,
  children,
}: {
  label: string;
  sub?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.25 flex items-baseline gap-2">
        <span className="text-label font-semibold">{label}</span>
        {sub && <span className="text-xs text-ui-ink-faint">{sub}</span>}
      </div>
      {children}
      {help && <span className={`mt-1 ${HELP_TEXT}`}>{help}</span>}
    </div>
  );
}

/**
 * 빈 자리.
 *
 * ⚠️ 테두리가 **점선**인 것은 우연이 아니다 — 이 콘솔에서 점선은 한 가지 뜻이다:
 * **「여기 있어야 할 것이 없다」.** ⚪ 못 쟀다 배지·배너도 같은 점선을 쓴다(아래).
 * 두 자리가 같은 뜻에 같은 모양을 쓰면 사람은 한 번만 배우면 된다.
 * ⛔ 그러니 「빈 상태를 예쁘게」 실선으로 바꾸지 마라. 그 순간 점선의 뜻이 흐려진다.
 */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-ui-line p-8.5 text-center text-ui-ink-dim">
      {children}
    </div>
  );
}

/**
 * ── 접는 자리 ──
 *
 * ⛔⛔ **판정과 경고는 절대 접지 않는다.** 이 콘솔의 문장은 길고, 길다고 지우면
 * 「왜 그렇게 판정했나」가 화면에서 사라진다 — 그건 이 저장소의 규율을 어기는 것이다.
 * 그래서 **지우는 대신 접는다.** 다만 접히는 것은 **참고 자료**(좌표 · 경로 · 명령 ·
 * 도구가 덧붙인 말)뿐이고, ⚠️ · ⛔ · ⚪ 로 시작하는 줄은 **접는 자리 밖에** 둔다.
 * ⇒ 접힌 채로도 「무엇이 문제인가」는 **언제나 보인다.**
 *
 * ⚠️ `<details>` 를 쓴다 — 직접 만든 여닫이가 아니다. 키보드로 열리고, 보조기기가
 * 「펼침/접힘」을 읽어 주고, 브라우저 찾기(⌘F)가 **접힌 안쪽까지 찾아서 펼쳐 준다.**
 * ⛔ `useState` 로 만든 여닫이는 그 셋을 전부 잃는다. 특히 마지막 것이 크다 —
 *    사람이 파일명으로 검색하는 화면에서 접힌 내용이 검색에 안 걸리면 없는 것과 같다.
 */
const SUMMARY = 'cursor-pointer list-none text-meta text-ui-ink-faint hover:text-ui-ink-dim';

export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mt-3.5">
      {/* ⚠️ `marker:hidden` 이 아니라 `list-none` 이다 — 사파리는 marker 를 그렇게 안 지운다. */}
      <summary className={SUMMARY}>▸ {label}</summary>
      <div className="mt-2.5">{children}</div>
    </details>
  );
}

/** 배너 안의 인라인 `code` 는 바탕을 깐다 — 원래 `.banner code` 셀렉터가 하던 일이다. */
const BANNER_CODE = '[&_code]:rounded-chip [&_code]:bg-ui-shade/30 [&_code]:px-1.25 [&_code]:py-px';

/**
 * ⛔⛔ **판정 어휘는 셋이 아니라 넷이 그려진다** — ✅ · ❌ · ⚠️(경고) · ⚪ **못 쟀다.**
 * `unknown` 을 warn 이나 bad 로 접으면 「못 쟀다」가 「실패했다」로 보이고,
 * ok 로 접으면 「안 봤다」가 「위반이 없다」로 보인다. 둘 다 이 저장소가 데인 자리다.
 */
export type BannerTone = 'ok' | 'warn' | 'bad' | 'unknown';

/**
 * ── 신호를 색 하나에 안 맡긴다 ──
 *
 * ⛔⛔ 실측(2026-09-08): 바꾸기 전 네 신호의 **면**은 카드 위에서 대비가
 * 1.00~1.06 이었다 — 사실상 **안 보였다.** 테두리도 1.24~2.45 로 흐렸다.
 * 즉 넷을 갈라 주는 채널이 사실상 **글자색 하나**였고, 색을 못 보는 사람에게는
 * **한 채널도 없었다.** 이모지(✅❌⚪)는 문장 안에 있어서 배지 모양을 안 바꾼다.
 *
 * ⇒ 채널을 **셋**으로 늘렸다. 색 하나가 죽어도 나머지가 남는다:
 *   ① 색   — 면·테두리 대비를 전부 올렸다(`_palette.css` 의 표).
 *   ② 굵기 — 왼쪽에 **두꺼운 신호 기둥**(`border-l-4`). 목록을 세로로 훑을 때
 *            색을 읽기 전에 기둥이 먼저 보인다.
 *   ③ 모양 — ⚪ 만 **점선**이다. 「끊긴 선 = 재다 만 것」이고, 빈 자리(`Empty`)와
 *            같은 모양이라 뜻이 한 벌로 묶인다.
 *
 * ⛔ ⚪ 에 기둥을 안 주는 것이 아니라 **점선 기둥**을 준다. 기둥을 빼면 ⚪ 만 들여쓰기가
 *    달라져서 목록에서 줄이 어긋나 보이고, 그러면 사람이 「이건 다른 종류의 UI」로 읽는다.
 *    같은 자리에 **끊긴 기둥**이 서 있어야 「같은 목록의 못 잰 칸」으로 읽힌다.
 */
const BANNER_TONE: Record<BannerTone, string> = {
  ok: 'border-solid border-tone-ok-line bg-tone-ok-face text-tone-ok-ink',
  warn: 'border-solid border-tone-warn-line bg-tone-warn-face text-tone-warn-ink',
  bad: 'border-solid border-tone-bad-line bg-tone-bad-face text-tone-bad-ink',
  unknown: 'border-dashed border-tone-unknown-line bg-tone-unknown-face text-tone-unknown-ink',
};

/** 모든 배너가 함께 갖는 모양 — 왼쪽 신호 기둥이 여기 있다. */
const BANNER_SHAPE = 'mb-4.5 rounded-card border border-l-4 px-3.5 py-3';

export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return <div className={`${BANNER_SHAPE} ${BANNER_CODE} ${BANNER_TONE[tone]}`}>{children}</div>;
}

/**
 * 상태 배지.
 *
 * ⚠️ 글자색은 **면(`tone-*-face`)이 아니라 신호 원색(`ui-ok` …)** 이다. 배너와 다른 짝인데,
 * 원래 그렇게 그려져 있었다 — 배지는 작아서 더 밝은 글자가 아니면 안 읽힌다.
 */
/**
 * ⚠️ `auto`(자동수집)와 `unknown`(⚪ 못 쟀다)은 **다른 말**이다 — 색이 비슷해도 합치지 마라.
 * `auto` 는 「기계가 넣었다」이고 `unknown` 은 「아무도 모른다」다.
 * ⛔ 그래서 모양도 갈랐다: `auto` 는 실선(기계가 **넣긴 넣었다**),
 *    `unknown` 은 점선(**아무것도 안 들어왔다**). 회색 두 개를 눈으로 가를 수단이 생긴다.
 */
/**
 * ⚠️ **어휘가 둘이라 이름도 둘이다.** `Fill`(filled·partial·stub)은 「얼마나 채워졌나」이고,
 * 판정 신호는 `ok`·`warn`·`bad` 다. 「좌표가 없다」를 `stub`(=골격만) 이라고 부르면
 * 읽는 사람이 **다른 뜻으로 읽는다.**
 * ⛔ 그렇다고 클래스 문자열을 두 벌 적지 않는다 — 두 자리가 갈리면 색만 고쳐지는 날이 온다.
 *    ⇒ 값은 **아래 한 벌**이고, `Fill` 이름은 그 한 벌을 **가리키기만** 한다.
 *
 * ⚠️⚠️ **이 타입은 `@api/types` 에 있었다.** 거기 있던 이유는 서버가 보내던
 * `IDomainSummary.fill`(형제 저장소의 도메인 문서가 얼마나 찼나) 때문인데, 그 저장소를
 * 끊으면서 **그 payload 가 없어졌다.** 지금 이 이름을 쓰는 곳은 `CommandList` 의
 * `tone="filled"` **하나**다 — 즉 서버가 보내는 모양이 아니라 **화면의 어휘**다.
 * ⇒ 쓰는 자리로 옮겼다. `@api/types` 에 남겨 두면 「서버가 이걸 보내나?」를 묻게 된다.
 */
type Fill = 'filled' | 'partial' | 'stub';

export type PillTone = Fill | 'ok' | 'warn' | 'bad' | 'auto' | 'unknown';

const PILL_SIGNAL = {
  ok: 'border-solid border-tone-ok-line bg-tone-ok-face text-ui-ok',
  warn: 'border-solid border-tone-warn-line bg-tone-warn-face text-ui-warn',
  bad: 'border-solid border-tone-bad-line bg-tone-bad-face text-ui-bad',
  auto: 'border-solid border-ui-line bg-ui-surface-raised text-ui-ink-dim',
  unknown: 'border-dashed border-tone-unknown-line bg-tone-unknown-face text-tone-unknown-ink',
} as const;

const PILL_TONE: Record<PillTone, string> = {
  ...PILL_SIGNAL,
  filled: PILL_SIGNAL.ok,
  partial: PILL_SIGNAL.warn,
  stub: PILL_SIGNAL.bad,
};

const PILL_SHAPE = 'whitespace-nowrap rounded-pill border px-2.25 py-0.75 text-xs font-semibold';

export function Pill({
  tone,
  className = '',
  children,
}: {
  tone: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={`${PILL_SHAPE} ${PILL_TONE[tone]} ${className}`}>{children}</span>;
}

/**
 * ── 수치 한 칸 ──
 *
 * ⛔⛔ **전에는 판정이 여기서 뭉개졌다.** `RunTally` 가 「✅ 통과 · ❌ 실패 · ⚪ 못 쟀다」를
 * 나란히 놓는데, 세 칸이 **완전히 같은 회색 상자**였다. 세 수를 가르는 것이 상자 안의
 * 이모지 한 글자뿐이었다는 뜻이고, 그건 「한눈에 갈라진다」가 아니다 —
 * 특히 **제일 큰 글자(수)가 셋 다 같은 색**이라 훑는 눈에는 셋이 한 덩어리로 들어왔다.
 *
 * ⇒ 칸이 **자기 신호를 입는다.** `tone` 을 안 주면 예전과 똑같은 중립 칸이다
 *   (분모·전체처럼 **판정이 아닌 수**는 중립이어야 한다 — 거기 색을 칠하면
 *   「전체 42건」이 좋은 소식인지 나쁜 소식인지 화면이 거짓으로 말하게 된다).
 */
export type TileTone = 'ok' | 'bad' | 'unknown';

const TILE_SHAPE = 'min-w-24 rounded-card border px-4 py-2.5';
const TILE_NEUTRAL = 'border-solid border-ui-line bg-ui-surface';

const TILE_TONE: Record<TileTone, string> = {
  ok: 'border-solid border-tone-ok-line bg-tone-ok-face',
  bad: 'border-solid border-tone-bad-line bg-tone-bad-face',
  unknown: 'border-dashed border-tone-unknown-line bg-tone-unknown-face',
};

/** 수 자체의 색 — 상자 색과 **짝으로** 움직인다. 하나만 바꾸면 대비가 조용히 무너진다. */
const TILE_FIGURE: Record<TileTone, string> = {
  ok: 'text-ui-ok',
  bad: 'text-ui-bad',
  unknown: 'text-tone-unknown-ink',
};

export function Tile({ reading, label, tone }: { reading: number | string; label: string; tone?: TileTone }) {
  return (
    <div className={`${TILE_SHAPE} ${tone === undefined ? TILE_NEUTRAL : TILE_TONE[tone]}`}>
      <span className={`block text-xl font-bold ${tone === undefined ? '' : TILE_FIGURE[tone]}`}>
        {reading}
      </span>
      <span className="text-xs text-ui-ink-faint">{label}</span>
    </div>
  );
}
