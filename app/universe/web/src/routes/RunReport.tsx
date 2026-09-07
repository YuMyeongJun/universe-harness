import { useState } from 'react';
import { Link } from 'react-router-dom';

import { postRun } from '@api/client';
import type { IRunPayload, IRunReceipt } from '@api/types';
import { readRunPayload, RUN_BY_HAND } from '@lib/run-judge';

import { RunReportView } from '@components/data-display/RunReportView';
import { ToolEcho } from '@components/data-display/ToolEcho';
import { ActionButton } from '@components/form-controls/ActionButton';
import { JsonPasteField } from '@components/form-controls/JsonPasteField';
import { Banner, HELP_TEXT, PageHead, Shell } from '@components/ui';

/**
 * **주행 결과 — fail 목록과 판정.** 자동 테스트가 돈 뒤 사람이 보는 자리.
 *
 * ── 이 화면이 있는 이유 ──────────────────────────────────────────────────
 * 계획은 「테스터가 돌고 → fail 을 사람이 보고 → 고치거나 판단하고 → 다시 돈다」의 반복이다.
 * ⛔⛔ **그런데 그 반복의 종료 조건은 「fail 0」이 아니다.** fail 0 을 목표로 두면 가장 싼
 * 해법이 **단언을 무르게 하는 것**이 된다 — 셀렉터를 넓히거나 spec 을 빼면 초록이 된다.
 * ⇒ 이 화면이 맨 위에서 세는 것은 **「판단하지 않은 fail」**이고, 그것이 0일 때만 끝났다고 말한다.
 *
 * ── ⛔ 이 화면이 절대 하지 않는 여섯 가지 ────────────────────────────────
 *  1. **`verdict === null` 인 fail 이 하나라도 있으면 「끝났다」고 말하지 않는다.**
 *  2. **판정은 셋뿐이다** — 고쳤다 · 테스트가 틀렸다 · 받아들인다(사유 필수).
 *     ⛔ 사유 없는 「받아들인다」는 판단이 아니라 **치운 것**이고, 그 판정은 계약이 한다(최소 30자).
 *  3. **전제가 안 서면 케이스를 ❌ 로 그리지 않는다 — 전부 ⚪ 다.** 세션이 죽어 로그인 페이지를
 *     잰 주행은 제품 결함이 아니다. 그걸 fail 목록에 올리면 **사람이 엉뚱한 데를 판다.**
 *  4. **구현에서 뽑은 TC 를 「검증됨」으로 세지 않는다.** 정의상 통과하는 TC 다 — 갈라 그린다.
 *  5. **건수를 분모 없이 적지 않는다** — 「fail 3건」이 아니라 「42건 중 fail 3건」.
 *  6. ⛔ **「무시하고 계속」·「전부 통과 처리」 버튼을 만들지 않는다.** 넘길 수 있는 관문은 넘겨진다.
 *
 * ── 두 갈래로 받는다 ────────────────────────────────────────────────────
 *  · **서버에 물린다**(`POST /api/runs`) — 서버가 계약 도구를 부르고, 화면은 그 답을 그린다.
 *    ⭐ 판정은 **한 자리에서만** 난다. 화면도 서버도 다시 세지 않는다.
 *  · **이미 도구가 낸 JSON 을 그대로 그린다** — 서버를 안 띄웠을 때의 길이다.
 *    ⛔ 어느 쪽도 **화면이 결과를 지어내지 않는다** — 못 받으면 ⚪ 라고 적는다.
 */
const CARD = 'rounded-card border border-ui-line bg-ui-surface p-4';
const CARD_NEXT = 'mt-3.5 rounded-card border border-ui-line bg-ui-surface p-4';
const SECTION = 'mb-3.5 mt-0 text-label font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
const BUTTONS = 'flex flex-wrap gap-2.5';

export function RunReport() {
  /** 지금 화면이 그리고 있는 주행. ⛔ 이름을 `payload` 로 두지 않는다 — 무엇을 담았는지가 아니라 **무엇을 위한 것인지**가 이름이다. */
  const [shownRun, setShownRun] = useState<IRunPayload | null>(null);
  /** 서버를 거쳤을 때만 있다 — 도구를 어떻게 불렀는지 사람이 다시 칠 수 있어야 한다. */
  const [receipt, setReceipt] = useState<IRunReceipt | null>(null);
  /** ⛔ 실패를 빈 목록으로 삼키지 않는다 — 빈 목록은 「fail 이 없다」로 읽힌다. */
  const [refused, setRefused] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);

  /** ⛔ 실패했을 때 **이전 주행을 남겨 두지 않는다** — 남기면 그것이 지금 상태로 보인다. */
  const clear = (why: string | null): void => {
    setShownRun(null);
    setRefused(why);
  };

  const draw = (raw: unknown): void => {
    const read = readRunPayload(raw);
    if (read.payload === null) {
      clear(read.refused);
      return;
    }
    setShownRun(read.payload);
    setRefused(null);
  };

  /** 서버에 물린다 — 판정은 서버가 부른 **계약 도구**가 낸다. */
  const askServer = (): void => {
    setBusy(true);
    setReceipt(null);
    /* ⛔⛔ **묻는 순간 앞의 주행을 지운다.** 안 지우면 답을 기다리는 동안 화면에 남은 것이
       「지금 이 주행의 상태」로 읽힌다 — 브라우저에서 눌러 보고서야 보였다(실측). */
    clear(null);
    void postRun(pasted).then(
      (came) => {
        setReceipt(came);
        /**
         * ⛔ 결과가 아예 안 왔을 때만 목록을 안 그린다. **「못 쟀다」는 그릴 것이 있다** —
         * 전제가 안 선 주행의 케이스는 전부 ⚪ 이고, 그 ⚪ 목록을 사람이 봐야
         * 「무엇이 안 재졌는지」를 안다. 빈 화면은 「fail 이 없다」로 읽힌다.
         */
        if (came.report === null) {
          clear(came.unmeasured ?? '서버가 결과를 못 받았다 — 이유도 안 왔다.');
        } else {
          draw(came.report);
        }
        setBusy(false);
      },
      (failed: Error) => {
        setReceipt(null);
        clear(failed.message);
        setBusy(false);
      },
    );
  };

  /** 서버를 못 띄웠을 때 — 도구가 이미 낸 JSON 을 그대로 그린다. */
  const drawPasted = (): void => {
    setReceipt(null);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(pasted);
    } catch (broken) {
      clear(`붙여넣은 것이 JSON 이 아니다 — ${(broken as Error).message}`);
      return;
    }
    draw(parsed);
  };

  const empty = pasted.trim() === '';

  return (
    <Shell>
      <PageHead
        eyebrow="우주 콘솔"
        title="주행 결과 — 판단하지 않은 것부터"
        sub="자동 테스트가 돈 뒤 사람이 보는 자리입니다. ⛔ 이 루프의 종료 조건은 「fail 0」이 아니라 「판단하지 않은 fail 0」입니다 — fail 0 을 목표로 두면 가장 싼 해법이 단언을 무르게 하는 것이 됩니다."
      />

      <p className={`mb-4.5 ${HELP_TEXT}`}>
        <Link to="/">← 우주가 아는 은하</Link> · <Link to="/violations">위반 목록과 처방 →</Link>
      </p>

      <div className={CARD}>
        <h2 className={SECTION}>주행 결과를 물린다 — 판정은 계약 도구가 낸다</h2>
        <JsonPasteField
          id="run-json"
          label="주행 결과 JSON"
          sub="계약 모양(preconditions[]·cases[]) 또는 Playwright 리포트(suites[])"
          value={pasted}
          placeholder='{ "preconditions": [...], "cases": [...] }'
          help="모양이 다르면 화면은 ⚪ 로 물러나고 이유를 적습니다 — 빈 주행으로 접지 않습니다."
          onChange={setPasted}
        />
        <div className={BUTTONS}>
          <ActionButton primary disabled={empty || busy} onClick={askServer}>
            {busy ? '서버에 물리는 중…' : '서버에 물려 판정 받기'}
          </ActionButton>
          <ActionButton disabled={empty || busy} onClick={drawPasted}>
            이미 tc-run 이 낸 JSON 이면 그대로 그리기
          </ActionButton>
        </div>
        <p className={`mt-3.5 ${HELP_TEXT}`}>
          첫 번째는 <code>POST /api/runs</code> 로 보내고 서버가 계약 도구를 부릅니다. 서버를 안
          띄웠으면 ⚪ 로 적힙니다 — 화면이 대신 결과를 지어내지 않습니다. 그때는 사람이 손으로 잴 수
          있습니다: <code>{RUN_BY_HAND}</code> — 그 출력을 붙여 넣고 두 번째 버튼을 누르세요.
        </p>
      </div>

      {busy && (
        <Banner tone="unknown">
          <strong>⚪ 서버에 물리는 중 — 아직 아무 판정도 안 왔다.</strong>
          <div className="mt-1.5">
            ⛔ 기다리는 동안 <strong>앞의 주행을 그대로 두지 않았다</strong> — 남겨 두면 그것이 지금
            상태로 읽힌다.
          </div>
        </Banner>
      )}

      {shownRun === null && refused === null && !busy && (
        <Banner tone="unknown">
          <strong>⚪ 아직 아무 주행도 안 물렸다.</strong>
          <div className="mt-1.5">
            여기 아무것도 없는 것은 <strong>「fail 이 없다」가 아니다</strong> — 아직 아무것도 안 물린
            것이다. ⛔ 물리기 전에는 이 화면이 초록을 그리지 않는다.
          </div>
        </Banner>
      )}

      {refused !== null && (
        <Banner tone="unknown">
          <strong>⚪ 못 쟀다 — 주행 결과를 화면에 못 물렸다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{refused}</div>
          <div className="mt-1.5">
            ⛔ 이것은 <strong>「fail 이 없다」도 「전부 통과」도 아니다.</strong> 잴 수가 없었던 것이다.
          </div>
          <div className="mt-1.5">
            사람은 손으로 잴 수 있다: <code>{RUN_BY_HAND}</code>
          </div>
        </Banner>
      )}

      {/**
       * ⛔ 서버의 `unmeasured` 를 여기서 **따로 또 적지 않는다.** 브라우저에서 보고 뺐다 —
       * 같은 문장이 두 번 찍혔다: 목록이 있으면 `DoneVerdict` 가 「도구가 한 말 그대로」로 싣고,
       * 목록이 없으면 위의 ⚪ 배너가 그 문장이다. **같은 말을 두 번 하면 읽는 사람이 둘을
       * 다른 말로 읽는다.**
       */}
      {receipt !== null && receipt.notes.length > 0 && (
        <Banner tone="warn">
          <strong>서버가 덧붙인 말 — 고쳐 적지 않았다</strong>
          {receipt.notes.map((note) => (
            <div key={note} className="mt-1.5 whitespace-pre-wrap">
              {note}
            </div>
          ))}
        </Banner>
      )}

      {shownRun !== null && <RunReportView payload={shownRun} />}

      {receipt !== null && (
        <div className={CARD_NEXT}>
          <h2 className={SECTION}>도구가 한 말 그대로</h2>
          <p className={`mb-3.5 ${HELP_TEXT}`}>
            「했습니다」는 주장이지 측정이 아니다 — 사람이 손으로 다시 칠 수 있어야 검증된다. 서버가
            읽은 모양: <strong>{receipt.shape}</strong>.
          </p>
          <ToolEcho
            command={receipt.tool.command}
            exitCode={receipt.tool.exitCode}
            stdout={receipt.tool.stdout}
            stderr={receipt.tool.stderr}
          />
        </div>
      )}
    </Shell>
  );
}
