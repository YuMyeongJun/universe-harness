import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getGalaxies } from '@api/client';
import type { IGalaxyList } from '@api/types';

import { GalaxyCard } from '@components/data-display/GalaxyCard';
import { Banner, HELP_TEXT, PageHead, Shell } from '@components/ui';

/**
 * S0 · **우주가 아는 은하** — 콘솔의 첫 화면.
 *
 * ── 왜 이 화면이 첫 화면이 됐나 ──────────────────────────────────────────
 * 전에는 첫 화면이 **형제 폴더의 남의 저장소**(`qa-workflow-v2-main`)에서 읽어 온 「도메인」
 * 목록이었다. 그래서 **우주가 아는 은하 5개가 화면에 아예 안 떴다** — 그중 하나
 * (`whitehole`)는 파일 1,000개가 넘는 진짜 저장소다. 화면에 없으면 아무도 안 본다.
 * ⚠️ 옛 화면을 **지우지 않았다** — `/domains` 로 그대로 갈 수 있다(없애면 그쪽이 깨진다).
 *
 * ── ⛔ 이 화면이 절대 하지 않는 다섯 가지 ────────────────────────────────
 *  1. **초록을 그리지 않는다.** 목록이 아는 것은 「등재됐나 · 좌표가 있나 · 경로가 있나 ·
 *     기준선이 있나」뿐이다. 그중 어느 것도 「위반이 없다」가 아니다 — 지금 몇 건인지는
 *     다시 재야(`observe`) 안다.
 *  2. **한쪽에만 있는 것을 빼지 않는다.** 등재됐는데 좌표가 없는 것(`no-coordinate`)도,
 *     좌표는 있는데 등재가 안 된 것(`not-registered`)도 **같은 목록에 실어** ⛔ 로 말한다.
 *     ⚠️ 실측(R121): 좌표를 만들고 목록에 안 올렸더니 관측이 「아무것도 안 재고 초록불」을 냈다.
 *  3. **못 읽었을 때 빈 목록을 그리지 않는다.** 빈 화면은 「은하가 없다」로 읽힌다 —
 *     그건 「못 읽었다」와 다른 말이다. 서버가 준 `unmeasured` 문장을 ⚪ 로 적는다.
 *  4. **기준선이 없으면 「아직 안 쟀다」다.** ✅ 로도 「위반 0」으로도 만들지 않는다.
 *  5. ⛔ **「무시하고 계속」·「이번만 건너뛰기」 버튼이 없다.** 넘길 수 있는 관문은 넘겨진다.
 */

const CARD = 'rounded-card border border-ui-line bg-ui-surface p-4';
const SECTION = 'mb-3.5 mt-8.5 text-label font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
const CODE = 'rounded-chip bg-ui-surface-sunken px-1.25 py-px font-mono text-xs';
const META = 'mt-1.5 text-meta text-ui-ink-faint';

/** 사람이 손으로 다시 칠 수 있는 명령. ⛔ 화면이 못 받아도 **사람은 볼 수 있어야 한다.** */
const BY_HAND = 'curl -s http://127.0.0.1:8788/api/galaxies';

export function GalaxySelect() {
  const [list, setList] = useState<IGalaxyList | null>(null);
  /** ⛔ 실패를 빈 목록으로 삼키지 않는다 — 삼키면 「은하가 없다」로 보인다. */
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    void getGalaxies().then(setList, (failed: Error) => setRefused(failed.message));
  }, []);

  const galaxies = list?.galaxies ?? [];
  const registered = galaxies.filter((g) => g.registered).length;
  const strays = galaxies.length - registered;

  return (
    <Shell>
      <PageHead
        eyebrow="우주 콘솔"
        title="우주가 아는 은하"
        sub="universe.config.json 의 목록과 galaxies.local/ · galaxies/ 의 좌표를 맞대어 본 것입니다. ⛔ 한쪽에만 있는 것도 목록에 그대로 싣습니다 — 조용히 빼면 「원래 없었다」와 구별이 안 됩니다."
      />

      <p className={`mb-4.5 ${HELP_TEXT}`}>
        <Link to="/violations">위반 목록과 처방 보기 →</Link> · <Link to="/domains">잴 저장소 고르기 · 도메인 지식 →</Link>
      </p>

      {/* ⛔ 아직 안 온 것을 「없다」로 그리지 않는다. */}
      {list === null && refused === null && (
        <Banner tone="unknown">
          <strong>⚪ 아직 못 받았다 — 불러오는 중입니다.</strong>
          <div className="mt-1.5">
            여기 아무것도 없는 것은 <strong>「은하가 없다」가 아니다.</strong>
          </div>
        </Banner>
      )}

      {refused !== null && (
        <Banner tone="unknown">
          <strong>⚪ 못 쟀다 — 은하 목록을 받지 못했습니다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{refused}</div>
          <div className="mt-1.5">
            ⛔ 화면은 대신 빈 목록을 그리지 않는다 — 빈 목록은 <strong>「은하가 없다」</strong>로
            읽히고, 그건 <strong>「못 받았다」</strong>와 다른 말이다.
          </div>
          <div className="mt-1.5">
            그동안 사람은 손으로 볼 수 있다: <code>{BY_HAND}</code>
          </div>
        </Banner>
      )}

      {list !== null && list.unmeasured !== null && (
        <Banner tone="unknown">
          <strong>⚪ 못 쟀다 — 서버가 한 말 그대로입니다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{list.unmeasured}</div>
          <div className="mt-1.5">
            아래 목록이 비어 있더라도 <strong>그것은 「은하가 없다」가 아니다.</strong>
          </div>
        </Banner>
      )}

      {/* ⛔ 어긋난 자리는 **맨 위에**. 아래로 밀면 카드 다섯 장 뒤에 숨는다. */}
      {list !== null && list.problems.length > 0 && (
        <Banner tone="bad">
          <strong>⛔ 목록과 좌표가 어긋난 자리 {list.problems.length}건 — 서버가 쓴 문장 그대로입니다.</strong>
          {list.problems.map((problem) => (
            <div key={problem} className="mt-1.5 whitespace-pre-wrap">
              {problem}
            </div>
          ))}
        </Banner>
      )}

      {list !== null && (
        <div className={CARD}>
          <p className="text-label">
            <strong>
              은하 {galaxies.length}개 — 등재 {registered}개 · 좌표만 있는 것 {strays}개
            </strong>
          </p>
          <p className={META}>
            목록의 정본: <code className={CODE}>{list.configFile}</code>
            {list.registered === null
              ? ' — ⚪ 그 배열을 못 읽었다(「은하가 0개」가 아니다).'
              : ` 의 galaxies 배열 ${list.registered.length}개.`}
          </p>
          {/* ⛔⛔ 이 화면에서 제일 오해받기 쉬운 한 줄이다. 숫자만 두면 초록으로 읽힌다. */}
          <p className={META}>
            ⛔ 이 수는 <strong>잰 결과가 아니다.</strong> 「은하가 몇 개 있나」이지 「위반이 몇
            건인가」가 아니다 — 지금 값은 은하마다 <strong>다시 재야</strong> 안다.
          </p>
        </div>
      )}

      {list !== null && list.unmeasured === null && galaxies.length === 0 && (
        <Banner tone="warn">
          <strong>⚠️ 목록은 읽혔는데 은하가 0개다.</strong>
          <div className="mt-1.5">
            이건 <strong>잰 0</strong>이다(못 읽은 것이 아니다). 다만 그 뜻은 「깨끗하다」가
            아니라 <strong>「관측이 아무것도 안 잰다」</strong>이다.
          </div>
        </Banner>
      )}

      {galaxies.length > 0 && (
        <>
          <h2 className={SECTION}>은하마다 — 빼지 않고 전부</h2>
          {galaxies.map((entry) => (
            <GalaxyCard key={entry.name} entry={entry} />
          ))}
        </>
      )}
    </Shell>
  );
}
