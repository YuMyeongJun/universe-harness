import { useEffect, useState } from 'react';

import { getRun, getRuns, postRun } from '@api/client';
import type { IJudgedRun, IRunCase, IRunListItem, IRunPayload, IRunReceipt } from '@api/types';
import { bucketOf, readRunPayload, RUN_BY_HAND } from '@lib/run-judge';

import { CaseListRow } from '@components/data-display/CaseListRow';
import { RunCaseRow } from '@components/data-display/RunCaseRow';
import { RunReportView } from '@components/data-display/RunReportView';
import { ToolEcho } from '@components/data-display/ToolEcho';
import { VerdictForm } from '@components/data-display/VerdictForm';
import { ActionButton } from '@components/form-controls/ActionButton';
import { JsonPasteField } from '@components/form-controls/JsonPasteField';
import { ConsoleShell, InboxPanes } from '@components/layout/ConsoleShell';
import { DetailPane } from '@components/layout/DetailPane';
import { ListPane } from '@components/layout/ListPane';
import { SidebarNav, type ISidebarGroup } from '@components/layout/SidebarNav';
import { Banner, CARD, CARD_NEXT, ContentPane, HELP_TEXT, SECTION } from '@components/ui';

/**
 * **주행 결과 — fail 목록과 판정.** 자동 테스트가 돈 뒤 사람이 보는 자리.
 *
 * ── 이 화면이 있는 이유 ──────────────────────────────────────────────────
 * 계획은 「테스터가 돌고 → fail 을 사람이 보고 → 고치거나 판단하고 → 다시 돈다」의 반복이다.
 * ⛔⛔ **그런데 그 반복의 종료 조건은 「fail 0」이 아니다.** fail 0 을 목표로 두면 가장 싼
 * 해법이 **단언을 무르게 하는 것**이 된다 — 셀렉터를 넓히거나 spec 을 빼면 초록이 된다.
 * ⇒ 이 화면이 세는 것은 **「판단하지 않은 fail」**이고, 그것이 0일 때만 끝났다고 말한다.
 *
 * ── 4단으로 다시 잡았다 (2026-09-08) ────────────────────────────────────
 * 전에는 위에서 아래로 이어진 **한 장 스크롤**이었다. 그래서 **증거(④)와 판정을 붙이는 자리가
 * 언제나 서로 다른 화면에** 있었고, 사람은 스크롤을 오르내리며 판단해야 했다.
 *   ① 레일 — 콘솔의 자리
 *   ② 주행 목록 — ⛔ **수 자리에 `0` 이 아니라 `⚪` 가 뜬다**(아래 참고)
 *   ③ 케이스 목록 — 탭(판단 안 함 · 전체 · ⚪ 못 쟀다) + 검색
 *   ④ 고른 케이스의 증거 **와 판정을 붙이는 자리**
 *
 * ── ⛔⛔ ② 의 수가 왜 `⚪` 인가 — 이 화면에서 제일 중요한 한 가지 ────────
 * 서버가 주행 목록에 **직접 적어 보내는 말**이다:
 *   「이 목록은 「끝났는가」를 말하지 않는다 — 그 답은 주행을 **열어 다시 재야** 나온다.」
 * ⇒ 목록만 보고는 **어느 주행에 판단 안 한 fail 이 몇 건인지 알 수 없다.**
 *   거기에 `0` 을 찍으면 「이 주행은 끝났다」는 **거짓말**이 된다.
 *   ⇒ 안 연 주행은 전부 **`⚪`**, 지금 연 주행만 **잰 수**가 뜬다.
 * ⛔ `verdictsRecorded`(적힌 판정 수)를 그 자리에 쓰지 않는다 — 그건 「적힌 수」이지
 *    「판단으로 세어진 수」가 아니다. 사유가 짧은 accepted 는 저장은 되되 안 세어진다.
 *
 * ── ⛔ 이 화면이 절대 하지 않는 것 ──────────────────────────────────────
 *  1. **`verdict === null` 인 fail 이 하나라도 있으면 「끝났다」고 말하지 않는다.**
 *  2. **판단은 셋뿐이다** — 고쳤다 · 테스트가 틀렸다 · 받아들인다(사유 필수).
 *  3. **전제가 안 서면 케이스를 ❌ 로 안 그린다 — 전부 ⚪ 다.**
 *  4. **건수를 분모 없이 적지 않는다.**
 *  5. ⛔ **「무시하고 계속」·「전부 통과 처리」·일괄 판정이 없다.** 탭에도, 목록에도, ④ 에도 없다.
 */

const INTAKE = 'mx-auto max-w-shell px-6 pb-20 pt-7';
const BUTTONS = 'flex flex-wrap gap-2.5';
const PANE_TOP = 'border-b border-ui-line px-3 py-2.5 text-xs text-ui-ink-faint';
const DETAIL_HEAD = 'flex flex-wrap items-baseline gap-2.5';

/** ③ 의 탭 셋. ⛔ 「전부 통과 처리」 같은 네 번째 탭을 여기 더하지 마라. */
type CaseTab = 'unjudged' | 'all' | 'unmeasured';

/** 목록 한 줄이 검색어에 걸리는가 — id 와 상태 글자만 본다(증거 본문까지 뒤지면 느리고 시끄럽다). */
const matches = (runCase: IRunCase, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return `${runCase.id} ${runCase.status} ${runCase.origin}`.toLowerCase().includes(needle);
};

export function RunReport() {
  /** 지금 화면이 그리고 있는 주행. ⛔ 이름을 `payload` 로 두지 않는다. */
  const [shownRun, setShownRun] = useState<IRunPayload | null>(null);
  /** 서버가 남긴 주행의 주소. `null` 이면 **판정을 붙일 자리가 없다**(도구 JSON 직접 그리기). */
  const [openId, setOpenId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<IRunReceipt | null>(null);
  /** ⛔ 실패를 빈 목록으로 삼키지 않는다 — 빈 목록은 「fail 이 없다」로 읽힌다. */
  const [refused, setRefused] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);

  /** ② 남아 있는 주행. `null` 이면 아직 못 받았다 — ⛔ 「주행이 없다」가 아니다. */
  const [runs, setRuns] = useState<IRunListItem[] | null>(null);
  const [runsNote, setRunsNote] = useState<string | null>(null);
  const [runsRefused, setRunsRefused] = useState<string | null>(null);

  const [tab, setTab] = useState<CaseTab>('unjudged');
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);

  const loadRuns = (): void => {
    void getRuns().then(
      (came) => {
        setRuns(came.runs);
        setRunsNote(came.note);
        setRunsRefused(null);
      },
      (failed: Error) => {
        setRuns(null);
        setRunsRefused(failed.message);
      },
    );
  };

  useEffect(loadRuns, []);

  /** ⛔ 실패했을 때 **이전 주행을 남겨 두지 않는다** — 남기면 그것이 지금 상태로 보인다. */
  const clear = (why: string | null): void => {
    setShownRun(null);
    setPickedId(null);
    setRefused(why);
  };

  const draw = (raw: unknown): void => {
    const read = readRunPayload(raw);
    if (read.payload === null) {
      clear(read.refused);
      return;
    }
    setShownRun(read.payload);
    setPickedId(null);
    setRefused(null);
  };

  /** 서버가 **다시 잰** 주행을 통째로 받는다. ⛔ 화면이 다시 세지 않는다. */
  const takeJudged = (judged: IJudgedRun): void => {
    setReceipt(judged);
    setOpenId(judged.id);
    if (judged.report === null) {
      clear(judged.unmeasured ?? '서버가 결과를 못 받았다 — 이유도 안 왔다.');
    } else {
      const keep = pickedId;
      draw(judged.report);
      /* 판정을 붙인 뒤에도 **보던 케이스에 그대로 머문다** — 튕겨 나가면 다음 건을 못 찾는다. */
      setPickedId(keep);
    }
    loadRuns();
  };

  /** 서버에 물린다 — 판정은 서버가 부른 **계약 도구**가 낸다. */
  const askServer = (): void => {
    setBusy(true);
    setReceipt(null);
    setOpenId(null);
    /* ⛔⛔ **묻는 순간 앞의 주행을 지운다.** 안 지우면 답을 기다리는 동안 화면에 남은 것이
       「지금 이 주행의 상태」로 읽힌다 — 브라우저에서 눌러 보고서야 보였다(실측). */
    clear(null);
    void postRun(pasted).then(
      (came) => {
        setBusy(false);
        setReceipt(came);
        setOpenId(came.id ?? null);
        if (came.report === null) {
          clear(came.unmeasured ?? '서버가 결과를 못 받았다 — 이유도 안 왔다.');
        } else {
          draw(came.report);
        }
        loadRuns();
      },
      (failed: Error) => {
        setBusy(false);
        setReceipt(null);
        setOpenId(null);
        clear(failed.message);
      },
    );
  };

  /** 서버를 못 띄웠을 때 — 도구가 이미 낸 JSON 을 그대로 그린다. */
  const drawPasted = (): void => {
    setReceipt(null);
    /* ⛔ 이 길에는 주소가 없다 — 판정을 붙일 자리도 없다. `VerdictForm` 이 그렇게 적는다. */
    setOpenId(null);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(pasted);
    } catch (broken) {
      clear(`붙여넣은 것이 JSON 이 아니다 — ${(broken as Error).message}`);
      return;
    }
    draw(parsed);
  };

  /** ② 열려 있는 주행을 서버에서 다시 받아 온다 — **다시 재서** 온다. */
  const openRun = (id: string): void => {
    setBusy(true);
    clear(null);
    void getRun(id).then(
      (came) => {
        setBusy(false);
        takeJudged(came);
      },
      (failed: Error) => {
        setBusy(false);
        setOpenId(null);
        clear(failed.message);
      },
    );
  };

  const empty = pasted.trim() === '';

  /* ── ② 사이드바 ─────────────────────────────────────────────────────── */
  const unjudgedIds = new Set((shownRun?.done.unjudged ?? []).map((one) => one.id));
  const sidebarGroups: ISidebarGroup[] = [
    {
      title: '남아 있는 주행',
      /* ⛔ 못 받았으면 **빈 목록으로 그리지 않는다** — 빈 목록은 「주행이 없다」로 읽힌다. */
      unmeasured: runsRefused === null ? null : `주행 목록을 못 받았다 — ${runsRefused}`,
      items: (runs ?? []).map((one) => ({
        id: one.id,
        label: `${one.id.slice(0, 8)} · ${one.receivedAt.slice(0, 16).replace('T', ' ')}`,
        /**
         * ⛔⛔ **여기가 `0` 이면 거짓말이다.** 열지 않은 주행은 판단 안 한 fail 이
         * 몇 건인지 **알 수 없다**(서버가 그렇게 적어 보낸다). 지금 연 것만 잰 수를 쓴다.
         */
        count: openId === one.id && shownRun !== null ? shownRun.done.unjudged.length : null,
        why: runsNote ?? '열어서 다시 재야 「판단 안 한 fail」이 몇 건인지 알 수 있다.',
      })),
    },
  ];

  /* ── ③ 리스트 ───────────────────────────────────────────────────────── */
  const cases = shownRun?.cases ?? [];
  const inBucket = (bucket: CaseTab): IRunCase[] => {
    if (bucket === 'all') return cases;
    return cases.filter(
      (one) => bucketOf(one, shownRun?.measurable ?? false, unjudgedIds) === bucket,
    );
  };
  const shownCases = inBucket(tab).filter((one) => matches(one, query));
  const picked = cases.find((one) => one.id === pickedId) ?? null;
  const reasons = new Map((shownRun?.done.unjudged ?? []).map((one) => [one.id, one.reason]));

  const sidebar = (
    <SidebarNav label="남아 있는 주행" groups={sidebarGroups} selected={openId} onSelect={openRun} />
  );

  /* 주행을 아직 안 열었다 — ③④ 를 그리지 않고 **물리는 자리**만 넓게 쓴다. */
  if (shownRun === null) {
    return (
      <ConsoleShell sidebar={sidebar}>
        <ContentPane>
            <h1 className="text-title font-bold">주행 결과 — 판단하지 않은 것부터</h1>
            <p className={`mb-4.5 mt-1 text-ui-ink-dim`}>
              ⛔ 이 루프의 종료 조건은 「fail 0」이 아니라 <strong>「판단하지 않은 fail 0」</strong>
              입니다 — fail 0 을 목표로 두면 가장 싼 해법이 단언을 무르게 하는 것이 됩니다.
            </p>
            {busy && (
              <Banner tone="unknown">
                <strong>⚪ 서버에 물리는 중 — 아직 아무 판정도 안 왔다.</strong>
                <div className="mt-1.5">
                  ⛔ 기다리는 동안 <strong>앞의 주행을 그대로 두지 않았다</strong> — 남겨 두면
                  그것이 지금 상태로 읽힌다.
                </div>
              </Banner>
            )}

            {refused !== null && (
              <Banner tone="unknown">
                <strong>⚪ 못 쟀다 — 주행 결과를 화면에 못 물렸다.</strong>
                <div className="mt-1.5 whitespace-pre-wrap">{refused}</div>
                <div className="mt-1.5">
                  ⛔ 이것은 <strong>「fail 이 없다」도 「전부 통과」도 아니다.</strong> 잴 수가
                  없었던 것이다.
                </div>
                <div className="mt-1.5">
                  사람은 손으로 잴 수 있다: <code>{RUN_BY_HAND}</code>
                </div>
              </Banner>
            )}

            {!busy && refused === null && (
              <Banner tone="unknown">
                <strong>⚪ 아직 아무 주행도 안 열렸다.</strong>
                <div className="mt-1.5">
                  여기 아무것도 없는 것은 <strong>「fail 이 없다」가 아니다.</strong> 왼쪽에서
                  남아 있는 주행을 고르거나, 아래에 새 결과를 물리세요.
                </div>
                <div className="mt-1.5">
                  ⛔ 왼쪽 목록의 수가 전부 <strong>⚪</strong> 인 것도 같은 이유다 — 열어서
                  <strong> 다시 재야</strong> 판단 안 한 fail 이 몇 건인지 안다.
                </div>
              </Banner>
            )}

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
                첫 번째는 <code>POST /api/runs</code> 로 보내고 서버가 계약 도구를 부릅니다. 서버를
                안 띄웠으면 ⚪ 로 적힙니다 — 화면이 대신 결과를 지어내지 않습니다. 그때는 사람이
                손으로 잴 수 있습니다: <code>{RUN_BY_HAND}</code> — 그 출력을 붙여 넣고 두 번째
                버튼을 누르세요.
                <br />
                ⛔ 두 번째 길에는 <strong>주소가 없어서 판정을 붙일 수 없다</strong> — 판정을
                적으려면 첫 번째로 물리세요.
              </p>
            </div>
        </ContentPane>
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell sidebar={sidebar}>
      <InboxPanes
        list={
          <ListPane
            tabs={[
              /* ⛔ 이 셋은 **잰 수**다 — 주행을 열었으니 세어져 있다. ② 의 ⚪ 와 다른 자리다. */
              { id: 'unjudged', label: '판단 안 함', count: inBucket('unjudged').length },
              { id: 'all', label: '전체', count: cases.length },
              { id: 'unmeasured', label: '⚪ 못 쟀다', count: inBucket('unmeasured').length },
            ]}
            activeTab={tab}
            onTab={(next) => setTab(next as CaseTab)}
            query={query}
            onQuery={setQuery}
            searchLabel="케이스 id·상태로 거르기"
            hasRows={shownCases.length > 0}
            whenEmpty={
              query.trim() === '' ? (
                <>
                  이 탭에 <strong>0건</strong>이다 — 전체 {cases.length}건 중.
                  <div className="mt-1.5">
                    ⛔ 이것은 <strong>잰 0</strong>이다(못 쟀다가 아니다). 다만 「끝났다」는
                    뜻은 아니다 — 다른 탭을 보라.
                  </div>
                </>
              ) : (
                <>
                  이 글자(<code>{query}</code>)로는 <strong>안 걸렸다.</strong>
                  <div className="mt-1.5">
                    ⛔ 「0건」이 아니다 — 이 탭에는 {inBucket(tab).length}건이 있고, 검색이 가린
                    것이다.
                  </div>
                </>
              )
            }
          >
            {shownCases.map((one) => (
              <CaseListRow
                key={one.id}
                runCase={one}
                measurable={shownRun.measurable}
                bucket={bucketOf(one, shownRun.measurable, unjudgedIds)}
                selected={pickedId === one.id}
                onSelect={() => setPickedId(one.id)}
              />
            ))}
          </ListPane>
        }
        detail={
          picked === null ? (
            <div>
              <p className={PANE_TOP}>
                ⬅ 왼쪽에서 케이스를 고르면 여기에 <strong>증거와 판정을 붙이는 자리</strong>가
                뜹니다. 아래는 이 주행 전체입니다.
              </p>
              <div className="px-4.5 py-4">
                <RunReportView payload={shownRun} />
                {receipt !== null && (
                  <div className={CARD_NEXT}>
                    <h2 className={SECTION}>도구가 한 말 그대로</h2>
                    <p className={`mb-3.5 ${HELP_TEXT}`}>
                      「했습니다」는 주장이지 측정이 아니다 — 사람이 손으로 다시 칠 수 있어야
                      검증된다. 서버가 읽은 모양: <strong>{receipt.shape}</strong>.
                    </p>
                    <ToolEcho
                      command={receipt.tool.command}
                      exitCode={receipt.tool.exitCode}
                      stdout={receipt.tool.stdout}
                      stderr={receipt.tool.stderr}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <DetailPane
              head={
                <div className={DETAIL_HEAD}>
                  <span className="font-mono text-xl font-bold">{picked.id}</span>
                  <span className="text-meta text-ui-ink-faint">
                    전체 {cases.length}건 중 한 건 — 판단 안 한 fail{' '}
                    {shownRun.done.unjudged.length}건
                  </span>
                </div>
              }
            >
              <RunCaseRow
                runCase={picked}
                measurable={shownRun.measurable}
                unjudgedReason={reasons.get(picked.id) ?? null}
              />
              <VerdictForm
                caseId={picked.id}
                current={picked.verdict}
                /* ⛔ 상태를 넘긴다 — fail 이 아니면 칸 자체를 안 그린다(그 이유는 그 파일에). */
                status={picked.status}
                runId={openId}
                onJudged={takeJudged}
              />
            </DetailPane>
          )
        }
      />
    </ConsoleShell>
  );
}
