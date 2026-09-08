import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

/**
 * ① **아이콘 레일** — 콘솔의 자리들. **이동은 여기서만 한다.**
 *
 * ── ⛔ 이 목록을 내가 짓지 않았다 ────────────────────────
 * 다섯 칸은 **`App.tsx` 의 라우트에서 그대로 왔다.** 화면에 없는 자리를 레일에 세우면
 * 그건 **막다른 길**이고, 이 저장소에서 막다른 길은 「화면이 거짓말한다」와 같은 말이다.
 * ⚠️⚠️ **「설정」을 안 만들었다** — 이 콘솔에 설정 화면이 없다. 칸을 채우려고 없는 화면을
 * 그리거나, 아무도 안 쓸 화면을 새로 짓는 것 둘 다 「거짓 칸」이다. 생기는 날 한 줄 더한다.
 *
 * ⭐ **「받아 오기」가 맨 위인 것은 그것이 첫 칸이기 때문이다.** 사용자의 계획은
 * 「우주를 깔고 화면을 띄우고 **깃 주소를 입력하고**」로 시작한다 — 아무 은하도 없는 사람이
 * 이 콘솔을 처음 열면 **여기서 시작해야** 한다. ⛔ 이 칸은 「없는 화면을 채운 것」이 아니다:
 * 서버의 `POST /api/clones`·`/api/adopt` 가 이미 있었고, **화면만 없었다.**
 *
 * ── ⛔ 본문의 링크 줄을 지우고 이리로 모았다 (2026-09-08) ─
 * 전에는 화면마다 본문 한복판에 맨 텍스트 링크가 떠 있었다:
 *   `← 우주가 아는 은하 · 위반 목록과 처방 보기 → — 무엇이 위반인지…`
 * ⛔ **레일이 이미 같은 곳을 가리키고 있었다** — 같은 이동이 두 벌이면 사람은 어느 쪽이
 * 정본인지 매번 고른다. 게다가 링크 뒤에 설명 문장이 매달려 **줄이 어디서 끝나는지**도 안 보였다.
 * ⇒ 이동은 **레일 한 곳**이 진다. 링크에 붙어 있던 설명은 각 화면의 **소개 문단**으로 옮겼다.
 * ⚠️ 예외는 `/d/:domain` 의 「← 도메인 목록」 하나뿐이다 — 그건 이동이 아니라 **되돌아가기**이고,
 *    레일에는 그 자리가 없다(도메인 **안**의 화면이라서).
 *
 * ── ⚠️ 이모지를 버리고 인라인 SVG 로 갔다 ────────────────
 * 전에는 이모지(🌌🔭🛰📓)였는데 **기계마다 다른 그림체로 그려진다** — 애플·윈도·안드로이드가
 * 각자 자기 글꼴로 그리고, 넷이 서로 다른 화풍이라 **레일 하나가 네 가지 그림체**가 됐다.
 * ⇒ 같은 굵기·같은 격자(24)로 그린 선 아이콘 다섯으로 통일한다. 색은 `currentColor` 라
 *   글자와 **언제나 같은 색**으로 움직인다(둘이 갈릴 자리를 안 만든다).
 * ⛔ 아이콘 라이브러리를 안 들여왔다 — 이 저장소는 공개 MIT 이고 아이콘 세트는 자기 라이선스를
 *   달고 온다. 다섯 개짜리 선 그림에 의존성과 라이선스를 지고 갈 이유가 없다.
 */

/** 모든 아이콘이 같은 격자·같은 굵기를 쓴다 — 하나만 달라도 레일이 어긋나 보인다. */
const svg = (path: ReactNode): ReactNode => (
  <svg
    aria-hidden="true"
    fill="none"
    height="22"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
    width="22"
  >
    {path}
  </svg>
);

interface IRailStop {
  to: string;
  icon: ReactNode;
  label: string;
  /** 마우스를 올렸을 때의 한 줄. 레일 글자가 짧아서 뜻을 다 못 담는다. */
  hint: string;
}

/** ⛔ `App.tsx` 의 라우트와 **짝이 맞아야 한다.** 없는 곳을 가리키면 막다른 길이다. */
const STOPS: IRailStop[] = [
  {
    to: '/intake',
    /* 받아 오기 — 밖에서 안으로 들어오는 것. */
    icon: svg(
      <>
        <path d="M12 3v11" />
        <path d="M8 10.5 12 14.5 16 10.5" />
        <path d="M4 17v2.5h16V17" />
      </>,
    ),
    label: '받아 오기',
    hint: '깃 주소를 받아 저장소를 들인다 — 여기가 첫 칸이다',
  },
  {
    to: '/',
    /* 은하 — 중심 하나에 기울어진 원반. */
    icon: svg(
      <>
        <circle cx="12" cy="12" r="2.5" />
        <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-24 12 12)" />
      </>,
    ),
    label: '은하',
    hint: '우주가 아는 은하 — 등재 · 좌표 · 기준선',
  },
  {
    to: '/violations',
    /* 관측 — 들여다보는 것. */
    icon: svg(
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21" />
      </>,
    ),
    label: '위반',
    hint: '관측 — 법칙별 위반과 처방',
  },
  {
    to: '/runs',
    /* 주행 — 지나간 자취. */
    icon: svg(
      <>
        <path d="M3 18 9 7l4 7 3-4 5 8" />
        <circle cx="9" cy="7" r="1.5" />
      </>,
    ),
    label: '주행',
    hint: '주행 결과 — 판단하지 않은 fail 부터',
  },
  {
    to: '/tc',
    /* TC — 표를 주고 표를 받는다. */
    icon: svg(
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M4 10h16M10 5v14" />
      </>,
    ),
    label: 'TC',
    hint: '양식 내려받기 · 채운 것 올려서 돌리기',
  },
  {
    to: '/domains',
    /* 도메인 — 적어 둔 것. */
    icon: svg(
      <>
        <path d="M6 3h7l5 5v13H6z" />
        <path d="M13 3v5h5" />
        <path d="M9.5 13h5M9.5 17h5" />
      </>,
    ),
    label: '도메인',
    hint: '잴 저장소 고르기 · 도메인 지식',
  },
];

const RAIL = 'flex h-full flex-col items-stretch gap-0.75 border-r border-ui-line bg-ui-surface-sunken py-3.5';
/**
 * ⚠️ 왼쪽 테두리와 여백을 **두 껍질이 똑같이** 적는다. 한쪽에만 적으면 고른 칸에서
 * 아이콘이 좌우로 튄다(같은 속성을 두 자리에서 주지 않는다 — `ui.tsx` 의 규율).
 */
const STOP = 'flex flex-col items-center gap-1 border-l-2 border-solid py-2 pl-0.5 pr-1 text-center no-underline';
const STOP_OFF = 'border-transparent bg-transparent text-ui-ink-faint hover:bg-ui-surface hover:text-ui-ink-dim';
/**
 * ⛔ **고른 칸을 「파란 면」으로 말하지 않는다.** 이 콘솔에서 채워진 파랑은
 * **누르는 것**(기본 버튼)의 색이라, 레일까지 파란 면이면 「지금 여기」와 「눌러라」가 같은 색이 된다.
 * ⇒ 뜻을 **왼쪽 굵은 막대 + 밝은 글자**가 지고, 면은 한 단만 뜬다.
 */
const STOP_ON = 'border-ui-accent bg-ui-surface font-semibold text-ui-ink';
const LABEL = 'text-xs';

export function NavRail() {
  return (
    /**
     * ⚠️ `<nav>` 다 — `<div>` 가 아니다. 보조기기가 「길잡이」로 건너뛸 수 있어야 한다.
     * ⚠️ `aria-label` 이 있어야 한 화면에 `<nav>` 가 둘일 때 갈린다(사이드바도 nav 다).
     */
    <nav aria-label="콘솔의 자리" className={RAIL}>
      {STOPS.map((stop) => (
        <NavLink
          key={stop.to}
          to={stop.to}
          end={stop.to === '/'}
          title={stop.hint}
          className={({ isActive }) => `${STOP} ${isActive ? STOP_ON : STOP_OFF}`}
        >
          {stop.icon}
          <span className={LABEL}>{stop.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
