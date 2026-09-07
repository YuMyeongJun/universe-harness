import { useState } from 'react';
import { Link } from 'react-router-dom';

import { getObservation } from '@api/client';
import type { IObservation } from '@api/types';

import { LawReport } from '@components/data-display/LawReport';
import { ScanScope } from '@components/data-display/ScanScope';
import { ToolEcho } from '@components/data-display/ToolEcho';
import { ActionButton } from '@components/form-controls/ActionButton';
import { TextField } from '@components/form-controls/TextField';
import { Banner, HELP_TEXT, PageHead, Shell } from '@components/ui';

/**
 * **위반 목록과 처방** — 지금까지 터미널 출력에만 있던 것을 사람이 보는 자리.
 *
 * 사용자의 최종 계획은 「우주를 이용해 코드의 품질을 자동으로 향상시키는 것」이고,
 * 그 첫걸음은 **무엇이 위반인지 사람이 보는 것**이다. 고칠 수 있으려면 먼저 보여야 한다.
 *
 * ── ⛔ 이 화면이 절대 하지 않는 다섯 가지 ────────────────────────────────
 *  1. **「0건」을 「위반이 없다」로 그리지 않는다.** 분모(훑은 파일 수)를 늘 같은 문장에 둔다.
 *     훑은 파일이 0개면 그 0건은 **「안 봤다」**이고, 그때는 법칙마다 ⚪ 로 그린다(`@lib/verdict`).
 *  2. **처방을 빠뜨리지 않는다.** 자리 · 코드 · 처방이 한 줄에 함께 있고, 처방이 안 오면
 *     「안 왔다」고 적는다. 건수만 있고 표본이 0건이면 그것도 ⚪ 로 적는다(R94).
 *  3. **한 번도 발동 안 한 규칙을 감추지 않는다.** 「위반이 없다」와 「규칙이 약하다」를 갈라 말한다(§8).
 *  4. **못 잰 것(⚪)을 초록으로 그리지 않는다.** 기준선이 없다 · 은하가 이 기계에 없다 ·
 *     서버가 아직 이 자리를 모른다 — 전부 ✅ 가 아니고, ❌ 도 아니다. 색을 따로 뒀다.
 *  5. ⛔ **「무시하고 계속」·「이번만 건너뛰기」 버튼이 없다.** 넘길 수 있는 관문은 넘겨진다.
 *
 * ⚠️ **서버에 이 자리가 아직 없다**(`app/universe/server/` 는 다른 손이 잡고 있다).
 * 그래서 눌러 보면 404 가 오고, 화면은 그것을 **⚪ 못 쟀다**로 그리면서 **사람이 손으로 칠 수
 * 있는 명령**을 함께 준다. ⛔ 실패를 삼키고 그럴듯한 목록을 그리지 않는다 —
 * 그러면 아무도 재지 않은 은하가 초록으로 보인다.
 */

const CARD = 'rounded-card border border-ui-line bg-ui-surface p-4';
const CARD_NEXT = 'mt-3.5 rounded-card border border-ui-line bg-ui-surface p-4';
const SECTION = 'mb-3.5 mt-0 text-label font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
const CODE = 'rounded-chip bg-ui-surface-sunken px-1.25 py-px font-mono text-xs';

/** 표본을 몇 건까지 받을 것인가의 기본값 — 관측소의 `--sample` 그대로. */
const SAMPLE_DEFAULT = '5';

/** `parseInt` 의 진법. ⚠️ 빼면 옛 브라우저에서 `010` 이 8로 읽힌다 — 그래서 이름을 붙여 둔다. */
const DECIMAL = 10;

/** 사람이 손으로 다시 칠 수 있는 명령. ⛔ 화면이 못 재도 **사람은 잴 수 있어야 한다.** */
const byHand = (galaxy: string, sample: string): string =>
  `node observatory/observe.mjs --galaxy ${galaxy} --sample ${sample}`;

export function Violations() {
  const [galaxy, setGalaxy] = useState('console');
  const [sample, setSample] = useState(SAMPLE_DEFAULT);
  const [observed, setObserved] = useState<IObservation | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canObserve = galaxy.trim() !== '' && !busy;

  const askToObserve = (): void => {
    setBusy(true);
    setFailure(null);
    void getObservation(galaxy.trim(), Number.parseInt(sample, DECIMAL) || 0).then(
      (came) => {
        setObserved(came);
        setBusy(false);
      },
      (refused: Error) => {
        /* ⛔ 실패했는데 이전 관측을 남겨 두지 않는다 — 남기면 그것이 이 은하의 지금 상태로 보인다. */
        setObserved(null);
        setFailure(refused.message);
        setBusy(false);
      },
    );
  };

  const found = (observed?.laws ?? []).reduce((sum, law) => sum + law.total, 0);

  return (
    <Shell>
      <PageHead
        eyebrow="우주 콘솔"
        title="위반 목록과 처방"
        sub="은하를 다시 재서 무엇이 위반인지, 그리고 무엇을 고쳐야 하는지 봅니다. 건수는 언제나 분모(훑은 파일 수)와 함께 나옵니다 — 파일 0개를 훑은 0건은 「위반이 없다」가 아니라 「안 봤다」입니다."
      />

      <p className={`mb-4.5 ${HELP_TEXT}`}>
        <Link to="/">← 잴 저장소 고르기</Link>
      </p>

      <div className={CARD}>
        <TextField
          id="observe-galaxy"
          label="은하 이름"
          sub="필수"
          mono
          value={galaxy}
          placeholder="console"
          help="galaxies/<이름>.json 의 이름입니다. 이 기계에 그 좌표가 없으면 화면은 ⚪ 「못 쟀다」로 적습니다 — 「위반이 없다」로 적지 않습니다."
          onChange={setGalaxy}
        />
        <TextField
          id="observe-sample"
          label="표본 수"
          sub="관측소의 --sample"
          mono
          value={sample}
          placeholder={SAMPLE_DEFAULT}
          help="⚠️ 0 이면 표본이 하나도 안 옵니다 — 건수는 있는데 자리도 처방도 없습니다. 그 상태를 화면은 ⚪ 로 적습니다."
          onChange={setSample}
        />
        <ActionButton primary disabled={!canObserve} onClick={askToObserve}>
          {busy ? '재는 중…' : '이 은하를 다시 재기'}
        </ActionButton>
      </div>

      {observed === null && failure === null && !busy && (
        <Banner tone="unknown">
          <strong>⚪ 아직 재지 않았다.</strong>
          <div className="mt-1.5">
            여기 아무것도 없는 것은 <strong>「위반이 없다」가 아니다</strong> — 아직 안 잰 것이다.
            위에서 은하를 골라 재라. ⛔ 재기 전에는 이 화면이 초록을 그리지 않는다.
          </div>
        </Banner>
      )}

      {failure !== null && (
        <Banner tone="unknown">
          <strong>⚪ 못 쟀다 — 화면에서 재는 자리가 아직 없다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{failure}</div>
          <div className="mt-1.5">
            ⛔ 이것은 <strong>❌ 「위반이 없다」도 「실패했다」도 아니다.</strong> 서버에{' '}
            <code>/api/observations/…</code> 가 아직 없어서 <strong>잴 수가 없었다.</strong>{' '}
            화면이 대신 그럴듯한 목록을 그리지 않는다 — 그러면 아무도 재지 않은 은하가 초록으로 보인다.
          </div>
          <div className="mt-1.5">
            그동안 사람은 손으로 잴 수 있다. 우주 저장소 뿌리에서:
            <div className="mt-1.5">
              <code>{byHand(galaxy.trim() || 'console', sample || SAMPLE_DEFAULT)}</code>
            </div>
          </div>
        </Banner>
      )}

      {observed !== null && (
        <div className="mt-5">
          {/* ⛔ 못 잰 이유가 있으면 **건수보다 먼저** 말한다. 뒤에 두면 숫자가 먼저 읽힌다. */}
          {observed.unmeasured !== null && (
            <Banner tone="unknown">
              <strong>⚪ 못 쟀다 — 도구가 한 말 그대로입니다.</strong>
              <div className="mt-1.5 whitespace-pre-wrap">{observed.unmeasured}</div>
              <div className="mt-1.5">
                아래 수치가 있더라도 <strong>그것은 잰 수가 아니다.</strong>
              </div>
            </Banner>
          )}

          <ScanScope scope={observed.scope} found={found} />

          {observed.notes.length > 0 && (
            <div className={CARD_NEXT}>
              <h2 className={SECTION}>도구가 덧붙인 말 — 고쳐 적지 않았다</h2>
              {observed.notes.map((note) => (
                <p key={note} className="mb-1.5 whitespace-pre-wrap text-meta text-ui-ink-dim">
                  {note}
                </p>
              ))}
            </div>
          )}

          {observed.laws.length === 0 && (
            <Banner tone="unknown">
              <strong>⚪ 이 은하가 켠 법칙이 하나도 안 왔다.</strong>
              <div className="mt-1.5">
                무엇으로 쟀는지 모른다 — <strong>「위반이 없다」로 읽지 마라.</strong> 좌표의{' '}
                <code>laws</code> 를 보라.
              </div>
            </Banner>
          )}

          {observed.laws.map((law) => (
            <LawReport key={law.law} law={law} scope={observed.scope} />
          ))}

          <div className={CARD_NEXT}>
            <h2 className={SECTION}>도구가 한 말 그대로</h2>
            <p className={`mb-3.5 ${HELP_TEXT}`}>
              「했습니다」는 주장이지 측정이 아니다 — 사람이 <code className={CODE}>손으로 다시</code>{' '}
              칠 수 있어야 검증된다.
            </p>
            <ToolEcho
              command={observed.tool.command}
              exitCode={observed.tool.exitCode}
              stdout={observed.tool.stdout}
              stderr={observed.tool.stderr}
            />
          </div>
        </div>
      )}
    </Shell>
  );
}
