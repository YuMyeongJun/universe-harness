import { Link } from 'react-router-dom';

import type { IGalaxyEntry } from '@api/types';

import {
  cannotObserve,
  judgeGalaxyBaseline,
  judgeGalaxyCommands,
  judgeGalaxyLaws,
  judgeGalaxyPath,
  judgeGalaxyState,
  type IGalaxyVerdict,
} from '@lib/verdict';

import { CommandList } from '@components/data-display/CommandList';
import { Banner, CARD_NEXT, CODE, Disclosure, Pill, SUBSECTION } from '@components/ui';

/**
 * 은하 하나 — **우주가 아는 것 그대로 한 장.**
 *
 * ── ⛔ 이 조각이 절대 하지 않는 것 ────────────────────────────────────────
 *  1. **초록을 그리지 않는다.** 목록이 아는 것은 「등재됐나 · 좌표가 있나 · 경로가 있나 ·
 *     기준선이 있나」뿐이고 그중 어느 것도 **「위반이 없다」가 아니다.** 판정은
 *     `@lib/verdict` 한 자리가 낸다 — 여기서 색을 고르지 않는다.
 *  2. **빼지 않는다.** `no-coordinate` · `not-registered` 도 **같은 목록에 실린다.**
 *     ⚠️ 실측(R121): 좌표를 만들고 목록에 안 올렸더니 관측이 「아무것도 안 재고 초록불」을 냈다.
 *     조용히 빼면 「원래 없었다」와 구별이 안 된다.
 *  3. **빈칸을 두지 않는다.** 없는 명령·없는 법칙·없는 기준선은 **없다고 적는다.**
 *     빈칸은 「그 축이 초록」으로 읽힌다.
 *  4. **서버가 쓴 문장을 고쳐 적지 않는다.** `problem` 과 `notes` 는 **그대로** 나른다 —
 *     고쳐 적는 순간 화면의 말과 도구의 말이 갈리고, 갈린 뒤엔 어느 쪽이 사실인지 아무도 모른다.
 *  5. ⛔ **「무시하고 계속」·「이번만 건너뛰기」가 없다.** 넘길 수 있는 관문은 넘겨진다.
 */
const HEAD = 'flex flex-wrap items-baseline justify-between gap-2';
const BADGES = 'mt-3 flex flex-wrap gap-2';
const WHY = 'mt-1.5 text-meta text-ui-ink-dim';
const META = 'mt-1.5 text-meta text-ui-ink-faint';
const GO = 'mt-3.5 inline-block rounded-control border border-ui-line px-3.75 py-2.25 no-underline';

export interface IGalaxyCardProps {
  entry: IGalaxyEntry;
}

export function GalaxyCard({ entry }: IGalaxyCardProps) {
  const state = judgeGalaxyState(entry.state);
  /**
   * ⛔ **배지를 늘어놓기만 하지 않는다.** 배지 옆에 왜 그런지가 없으면 사람은 색만 보고
   * 지나간다 — 그리고 ⚪ 회색은 「별일 없음」처럼 보인다. 그래서 이유를 같이 싣는다.
   */
  const axes: IGalaxyVerdict[] = [
    judgeGalaxyPath(entry),
    judgeGalaxyBaseline(entry),
    judgeGalaxyLaws(entry),
    judgeGalaxyCommands(entry),
  ];
  const blocked = cannotObserve(entry);

  return (
    <div className={CARD_NEXT}>
      <div className={HEAD}>
        <span className="text-label font-semibold">{entry.name}</span>
        <Pill tone={state.tone}>
          {state.mark} {state.label}
        </Pill>
      </div>
      <p className={WHY}>{state.why}</p>

      {/* ⛔ 설명이 없으면 「없다」고 적는다 — 빈 줄은 사람이 안 본다. */}
      <p className={META}>
        {entry.description ?? '⚪ 좌표에 설명이 없다 — 이 은하가 무엇인지 화면은 모른다.'}
      </p>

      {/* ⛔ 서버가 ⛔ 로 말한 것은 **건수·배지보다 먼저** 크게 말한다. */}
      {entry.problem !== null && (
        <Banner tone="bad">
          <strong>⛔ 말해야 하는 것 — 서버가 쓴 문장 그대로입니다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{entry.problem}</div>
        </Banner>
      )}

      <div className={BADGES}>
        {axes.map((axis) => (
          <Pill key={axis.label} tone={axis.tone}>
            {axis.mark} {axis.label}
          </Pill>
        ))}
      </div>
      {axes.map((axis) => (
        <p key={axis.label} className={WHY}>
          <strong>
            {axis.mark} {axis.label}
          </strong>{' '}
          — {axis.why}
        </p>
      ))}

      {/**
       * ── 참고 자료 ──
       *
       * ⛔⛔ **접는 것이 판정을 가리면 안 된다.** 처음엔 좌표·경로·명령 셋을 **한 덩어리로**
       * 접었는데, 브라우저에서 여섯 은하를 전부 눌러 보니 **접는 칸이 한 번도 안 떴다** —
       * 「빠진 게 하나라도 있으면 안 접는다」는 가드에 `없는 명령` 이 매번 걸렸기 때문이다
       * (실측: 여섯 은하 전부 `missingCommands` 가 ⚪ 이거나 54~68개).
       * ⇒ 덩어리를 **둘로 갈랐다.** 좌표·경로는 여섯 전부 채워져 있어 접히고,
       *   명령 목록은 **언제나 펼친 채**로 둔다 — 거기가 ⛔·⚪ 가 사는 자리다.
       *
       * ⚠️ 「가드를 느슨하게 해서 접히게 하자」로 가지 않았다. 그건 접기를 위해
       *    판정을 숨기는 것이고, 순서가 거꾸로다.
       */}
      {(() => {
        /* 좌표와 경로가 **셋 다 있을 때만** 접는다 — 하나라도 없으면 그 자리가 ⛔·⚪ 다. */
        const placesKnown =
          entry.coordinate.file !== null && entry.path !== null && entry.appDir !== null;

        const places = (
          <>
            <p className={META}>
              좌표:{' '}
              {entry.coordinate.file === null ? (
                <strong>⛔ 없다</strong>
              ) : (
                <>
                  <code className={CODE}>{entry.coordinate.file}</code>
                  {entry.coordinate.local && ' — 커밋되지 않는 명부(절대 경로가 사는 자리)'}
                </>
              )}
            </p>
            <p className={META}>
              경로:{' '}
              {entry.path === null ? <strong>⚪ 모른다</strong> : <code className={CODE}>{entry.path}</code>}
              {' · '}
              훑을 자리(<code className={CODE}>appDir</code>):{' '}
              {entry.appDir === null ? <strong>⚪ 모른다</strong> : <code className={CODE}>{entry.appDir}</code>}
            </p>
          </>
        );

        return placesKnown ? <Disclosure label="좌표 · 경로 (둘 다 있다)">{places}</Disclosure> : places;
      })()}

      {/**
       * ⛔ **명령 목록은 접지 않는다.** 없는 명령은 ⚪ 로 **안 재지는 축**이고,
       * 접으면 그 축이 「초록」으로 읽힌다 — 빈칸으로 두는 것과 같은 사고다.
       * 문장은 좌표에 적힌 것 그대로다.
       */}
      {entry.coordinate.found && (
        <>
          <h3 className={SUBSECTION}>좌표에 선언된 명령 — 없는 것은 없다고 적는다</h3>
          <CommandList commands={entry.commands} missing={entry.missingCommands} />
        </>
      )}

      {entry.notes.length > 0 && (
        <>
          <h3 className={SUBSECTION}>서버가 덧붙인 말 — 고쳐 적지 않았다</h3>
          {entry.notes.map((note) => (
            <p key={note} className="mb-1.5 whitespace-pre-wrap text-meta text-ui-ink-dim">
              {note}
            </p>
          ))}
        </>
      )}

      {/**
       * ⛔ **못 잰다는 것을 링크를 조용히 지워서 말하지 않는다.** 지우면 사람은 왜 없는지
       * 모르고, 「이 은하는 볼 게 없나 보다」로 읽는다. 이유를 적는다.
       */}
      {blocked === null ? (
        <Link className={GO} to={`/violations?galaxy=${encodeURIComponent(entry.name)}`}>
          이 은하를 재러 가기 →
        </Link>
      ) : (
        <p className={WHY}>
          <strong>{blocked}</strong> 그래서 이 은하는 지금 <strong>재러 갈 수 없다.</strong> ⛔ 이것은
          「위반이 없다」가 아니라 <strong>「못 잰다」</strong>다.
        </p>
      )}
    </div>
  );
}
