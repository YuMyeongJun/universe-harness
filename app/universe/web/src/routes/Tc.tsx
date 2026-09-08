import { useState } from 'react';

import { getTcTemplate, postTcRun } from '@api/client';
import type { ITcRunResult, ITcTemplateResult } from '@api/types';

import { ActionButton } from '@components/form-controls/ActionButton';
import { ConsoleShell } from '@components/layout/ConsoleShell';
import { SidebarNav, type ISidebarGroup } from '@components/layout/SidebarNav';
import { Banner, CARD, CARD_NEXT, ContentPane, HELP_TEXT, PageHead, SECTION, Tile } from '@components/ui';

/**
 * **TC 칸 — 양식을 내려받고, 채운 것을 올려서 돌린다.**
 *
 * 사용자가 요구한 여섯 중 마지막이다:
 * 「**TC 만 있다면 TC 를 업로드해서 자동수행, TC 양식은 다운로드**받게 하고」.
 *
 * ── 왜 이 화면이 생겼나 ─────────────────────────────────────────────────
 * ⛔⛔ TC 도구(`qa/dist/tc/cli.js`)는 **있었는데 서버에 자리가 아예 없었다**
 * (실측: 서버 라우트 22개 중 `tc` 를 부르는 것 **0개**). 즉 사용자가 요구한 두 칸이
 * 통째로 **터미널 전용**이었다 — 이 제품의 전제(`docs/09-console-first.md`)와 정면으로 어긋난다.
 *
 * ── ⛔⛔ 이 화면이 절대 하지 않는 것 ────────────────────────────────────
 *  1. ⛔⛔ **「돌릴 명령」 칸을 만들지 않는다.** 도구에는 `--run "<명령>"` 이 있다.
 *     그 칸을 화면에 열면 이 콘솔은 **원격 명령 실행기**가 된다 — 브라우저를 여는 사람이
 *     서버 기계에서 아무 명령이나 돌릴 수 있게 된다. 서버도 그 플래그를 **안 만들었다.**
 *  2. ⛔ **판정을 화면이 다시 계산하지 않는다.** 「끝났는가」·「검증 분모」·「판단이 판단인가」는
 *     `qa/src/run/` 이 안다. 화면이 다시 세면 두 자리가 조용히 갈리고, 갈린 뒤엔 화면이
 *     「통과」라고 말하는데 관문은 빨간불인 상태가 된다.
 *  3. ⛔ **양식을 화면이 짜지 않는다.** 칸 이름은 계약에서 온다 — 화면이 짜면 계약이 바뀐 날
 *     옛 칸을 나눠 주고, 채워 온 사람이 거부당하며 **자기가 틀린 줄 안다.**
 *  4. ⛔ **「전제 없이 돌리기」 갈래를 만들지 않는다.** 전제 양식을 빼면 「전제 0개」가 되고
 *     도구가 ⚪ 3 으로 답한다 — 그게 옳다. 넘길 수 있는 관문은 넘겨진다.
 *
 * ── ⛔⛔ 세 갈래를 두 갈래로 접지 않는다 (이 화면의 존재 이유) ──────────
 * 도구의 계약은 **셋**이다:
 *   `0` 끝났다 — ⛔ 「fail 0」이 아니라 **「판단하지 않은 fail 0」**이다.
 *   `1` ❌ 판단하지 않은 fail 이 있다.
 *   `3` ⚪ **못 쟀다** — 전제가 안 섰거나 · 검증 분모가 0이거나 · 양식을 못 읽었다.
 * ⛔ 3 을 ❌ 로 그리면 사람은 **없는 실패**를 고치러 가고, 진짜 구멍
 *    (아무것도 검증하지 않는 TC)은 그대로 남는다(§8 — 0 은 무죄가 아니다).
 */

type TcStep = 'template' | 'upload';

const STEPS: { id: TcStep; label: string }[] = [
  { id: 'template', label: '① 양식 내려받기' },
  { id: 'upload', label: '② 채운 것 올리기' },
];

const SAY = 'mt-1.5 max-h-code overflow-auto whitespace-pre-wrap rounded-control border border-ui-line bg-ui-surface-sunken p-2.5 font-mono text-xs leading-code';

/** 도구가 낸 보고에서 **읽히는 것만** 꺼낸다. ⛔ 없으면 지어내지 않고 `null` 이다. */
interface IReadStats {
  total: number | null;
  denominator: number | null;
  /**
   * **왜 못 쟀는지.** ⛔⛔ 여기가 이 화면에서 제일 중요한 칸이다.
   *
   * ⚠️ 처음에 `unmeasuredReason` **하나만** 읽었다가 실제로 데였다: 전제를 안 올리고 돌리면
   * 도구는 `unmeasurableBecause: ['전제가 0개 선언됐다 …']` 로 **분명히 말하는데**
   * 화면에는 「⚪ 못 쟀다」만 뜨고 **이유가 한 줄도 안 보였다.**
   * ⛔ 이유 없는 ⚪ 는 사람을 아무 데도 못 가게 한다 — 「못 쟀다」만 알고 「왜」를 모르면
   *    할 수 있는 게 없다. ⇒ 도구가 이유를 **어느 칸에 담든** 전부 모은다.
   */
  why: string[];
  /**
   * **판단하지 않은 fail — 어느 것이 왜인가.**
   *
   * ⚠️ 처음엔 「❌ 판단하지 않은 fail 이 있다」만 그렸다. 그건 **사람을 아무 데도 못 가게 한다** —
   * 몇 건인지도, 어느 케이스인지도, 무엇이 모자란지도 모른 채 화면을 닫게 된다.
   * 도구는 다 말하고 있었다(예: 「accepted 인데 사유가 20자다(최소 30자).
   * 사유 없는 accepted 는 판단이 아니라 **치운 것**이다」). ⇒ 그대로 싣는다.
   */
  unjudged: { id: string; reason: string }[];
  /** 도구가 「이건 안 쟀다」고 **스스로 적은 것**. ⛔ 지우지 않는다 — 이게 §8 의 그 줄이다. */
  notMeasured: string | null;
}

const readReport = (report: unknown): IReadStats => {
  const it = report as {
    stats?: { total?: unknown };
    verification?: { denominator?: unknown };
    unmeasuredReason?: unknown;
    unmeasurableBecause?: unknown;
    done?: { unjudged?: unknown };
    notMeasured?: unknown;
  } | null;
  /* ⛔ 「수가 아니면 0」이 아니라 **`null`**이다 — 0 은 「없다」고, `null` 은 「못 읽었다」다. */
  const countOrUnread = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const why: string[] = [];
  /* 바로 끊겼을 때(양식을 못 읽었다 …)는 한 줄로 온다. */
  if (typeof it?.unmeasuredReason === 'string' && it.unmeasuredReason !== '') {
    why.push(it.unmeasuredReason);
  }
  /* 돌긴 돌았는데 잰 것이 아닐 때(전제 0개 · 분모 0 …)는 목록으로 온다. */
  if (Array.isArray(it?.unmeasurableBecause)) {
    for (const one of it.unmeasurableBecause) if (typeof one === 'string') why.push(one);
  }
  const unjudged: { id: string; reason: string }[] = [];
  if (Array.isArray(it?.done?.unjudged)) {
    for (const one of it.done.unjudged) {
      const row = one as { id?: unknown; reason?: unknown };
      /* ⛔ 없는 칸을 지어내지 않는다 — 못 읽었으면 그렇게 적는다. */
      unjudged.push({
        id: typeof row.id === 'string' ? row.id : '(id 를 못 읽었다)',
        reason: typeof row.reason === 'string' ? row.reason : '(사유를 못 읽었다)',
      });
    }
  }
  return {
    total: countOrUnread(it?.stats?.total),
    denominator: countOrUnread(it?.verification?.denominator),
    why,
    unjudged,
    notMeasured: typeof it?.notMeasured === 'string' ? it.notMeasured : null,
  };
};

export function Tc() {
  const [step, setStep] = useState<TcStep>('template');
  const [format, setFormat] = useState<'tsv' | 'csv'>('tsv');
  const [template, setTemplate] = useState<ITcTemplateResult | null>(null);
  const [asking, setAsking] = useState(false);

  const [cases, setCases] = useState<{ name: string; text: string } | null>(null);
  const [pre, setPre] = useState<{ name: string; text: string } | null>(null);
  const [ran, setRan] = useState<ITcRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const fetchTemplate = (): void => {
    setAsking(true);
    setRefused(null);
    /* ⛔ 묻는 순간 앞의 것을 지운다 — 남겨 두면 그것이 지금 양식으로 읽힌다. */
    setTemplate(null);
    void getTcTemplate(format).then(
      (came) => {
        setAsking(false);
        setTemplate(came);
      },
      (why: Error) => {
        setAsking(false);
        setRefused(why.message);
      },
    );
  };

  /**
   * 브라우저에서 파일로 내린다.
   * ⛔ 내용을 화면이 만들지 않는다 — **서버가 도구를 돌려 준 글자 그대로**를 담는다.
   */
  const download = (name: string, text: string): void => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
    URL.revokeObjectURL(href);
  };

  const pick = (
    file: File | undefined,
    put: (v: { name: string; text: string } | null) => void,
  ): void => {
    if (file === undefined) {
      put(null);
      return;
    }
    void file.text().then(
      (text) => put({ name: file.name, text }),
      (why: Error) => setRefused(`파일을 못 읽었습니다: ${why.message}`),
    );
  };

  const run = (): void => {
    if (cases === null) return;
    setBusy(true);
    setRefused(null);
    /* ⛔ 돌리는 순간 앞의 판정을 지운다 — 남으면 묵은 판정이 지금 판정으로 읽힌다. */
    setRan(null);
    void postTcRun({
      cases: cases.text,
      casesName: cases.name,
      ...(pre === null ? {} : { preconditions: pre.text, preconditionsName: pre.name }),
    }).then(
      (came) => {
        setBusy(false);
        setRan(came);
      },
      (why: Error) => {
        setBusy(false);
        setRefused(why.message);
      },
    );
  };

  const sidebarGroups: ISidebarGroup[] = [
    {
      title: 'TC',
      /* ⛔ 단계는 측정이 아니다 — 수 배지를 안 단다. */
      items: STEPS.map((one) => ({ id: one.id, label: one.label })),
    },
  ];

  const read = ran === null ? null : readReport(ran.report);

  return (
    <ConsoleShell
      sidebar={
        <SidebarNav
          label="TC 단계"
          groups={sidebarGroups}
          selected={step}
          onSelect={(id) => setStep(id as TcStep)}
        />
      }
    >
      <ContentPane>
        <PageHead
          eyebrow="우주 콘솔"
          title="TC — 양식과 자동수행"
          sub="TC 만 있어도 됩니다. 양식을 내려받아 채우고, 그대로 올리면 이 자리에서 돌립니다. ⛔ 모델을 부르지 않습니다 — 양식도 판정도 도구가 합니다."
        />

        {refused !== null && (
          <Banner tone="bad">
            <strong>⛔ 요청을 거절했다 — 서버가 쓴 문장 그대로입니다.</strong>
            <div className="mt-1.5 whitespace-pre-wrap">{refused}</div>
          </Banner>
        )}

        {/* ── ① 양식 내려받기 ────────────────────────────────────────── */}
        {step === 'template' && (
          <div className={CARD}>
            <h2 className={SECTION}>① 양식 — 칸 이름은 계약에서 온다</h2>
            {/* ⛔ `flex` 안에서 폭을 안 잡으면 셀렉트가 **줄 전체로 늘어나고** 라벨과 버튼 글자가
                두 줄로 깨진다 — 실제로 그렇게 나왔다. 늘어나는 것은 아무것도 없어야 한다. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="shrink-0 whitespace-nowrap text-xs text-ui-ink-dim" htmlFor="tc-format">
                형식
              </label>
              <select
                id="tc-format"
                className="w-40 shrink-0 rounded-control border border-ui-line bg-ui-surface-sunken px-2 py-1.5 font-mono text-xs"
                value={format}
                onChange={(e) => setFormat(e.target.value === 'csv' ? 'csv' : 'tsv')}
              >
                <option value="tsv">TSV — 탭</option>
                <option value="csv">CSV — 쉼표</option>
              </select>
              <span className="shrink-0 whitespace-nowrap">
                <ActionButton primary disabled={asking} onClick={fetchTemplate}>
                  {asking ? '만드는 중…' : '양식 만들기'}
                </ActionButton>
              </span>
            </div>
            <p className={HELP_TEXT}>
              ⛔ 엑셀로 채운다면 <strong>「CSV UTF-8」로 내보내세요</strong> — 도구는{' '}
              <code>.xlsx</code> 를 못 읽습니다(그건 zip 입니다). ⛔ 머리 줄의 칸 이름을 고치면
              거부됩니다. 그게 조용히 갈리는 것보다 낫습니다.
            </p>

            {template !== null && !template.ok && (
              <Banner tone="unknown">
                <strong>⚪ 양식을 못 만들었다 — 「양식이 없다」가 아니다.</strong>
                <div className="mt-1.5">
                  ⛔ 여기서 <strong>빈 양식을 내주지 않았습니다.</strong> 빈 양식을 받은 사람은
                  그걸 채워서 올리고, 그때 거부당하며 <strong>자기가 틀린 줄 압니다.</strong>
                </div>
                {template.say !== '' && <div className={SAY}>{template.say}</div>}
              </Banner>
            )}

            {template !== null && template.ok && (
              <div className={CARD_NEXT}>
                <h2 className={SECTION}>내려받을 것 — {template.files.length}개</h2>
                <Banner tone="warn">
                  <strong>⛔ 둘 다 받으세요.</strong>
                  <div className="mt-1.5">
                    전제 양식을 빼고 채우면 「전제 <strong>0개</strong>」가 되고, 그건{' '}
                    <strong>통과가 아니라 ⚪ 못 쟀다</strong>입니다 — 아무것도 검증하지 않은 채
                    초록불처럼 보이는 것을 막으려고 그렇게 돼 있습니다.
                  </div>
                </Banner>
                <ul className="flex flex-col gap-2">
                  {template.files.map((one) => (
                    <li key={one.name} className="flex items-center gap-2">
                      <span className="shrink-0 whitespace-nowrap">
                        <ActionButton onClick={() => download(one.name, one.text)}>
                          {one.name} 내려받기
                        </ActionButton>
                      </span>
                      <span className={HELP_TEXT}>{one.text.split('\n').length}줄</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── ② 채운 것 올리기 ───────────────────────────────────────── */}
        {step === 'upload' && (
          <div className={CARD}>
            <h2 className={SECTION}>② 채운 양식 — 올리면 그대로 돌린다</h2>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-ui-ink-dim" htmlFor="tc-cases">
                케이스 양식 <span className="font-normal text-ui-ink-faint">필수</span>
              </label>
              <input
                id="tc-cases"
                type="file"
                accept=".tsv,.csv,.txt"
                className="block w-full text-xs"
                onChange={(e) => pick(e.target.files?.[0], setCases)}
              />
              <span className={HELP_TEXT}>
                {cases === null ? '아직 안 골랐습니다.' : `${cases.name} · ${String(cases.text.split('\n').length)}줄`}
              </span>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-ui-ink-dim" htmlFor="tc-pre">
                전제 양식 <span className="font-normal text-ui-ink-faint">안 올리면 ⚪ 못 쟀다로 끝난다</span>
              </label>
              <input
                id="tc-pre"
                type="file"
                accept=".tsv,.csv,.txt"
                className="block w-full text-xs"
                onChange={(e) => pick(e.target.files?.[0], setPre)}
              />
              <span className={HELP_TEXT}>
                {pre === null
                  ? '⛔ 안 올리면 「전제 0개」가 되고, 그건 통과가 아니라 못 쟀다(⚪)입니다.'
                  : `${pre.name} · ${String(pre.text.split('\n').length)}줄`}
              </span>
            </div>

            <ActionButton primary disabled={cases === null || busy} onClick={run}>
              {busy ? '도는 중…' : '올린 TC 를 돌리기'}
            </ActionButton>

            <p className={HELP_TEXT}>
              ⛔ <strong>여기에 「돌릴 명령」 칸은 없습니다.</strong> 그 칸을 열면 이 콘솔이
              브라우저를 여는 사람의 <strong>원격 명령 실행기</strong>가 됩니다. 브라우저 주행은
              은하가 선언한 축으로 돕니다 — 사람이 타이핑하는 것이 아닙니다.
            </p>
          </div>
        )}

        {busy && (
          <Banner tone="unknown">
            <strong>⚪ 도는 중 — 아직 아무 답도 안 왔다.</strong>
          </Banner>
        )}

        {/* ── 판정 — ⛔ 세 갈래를 둘로 접지 않는다 ────────────────────── */}
        {ran !== null && read !== null && (
          <div className={CARD_NEXT}>
            <h2 className={SECTION}>판정 — 도구가 낸 것을 그대로</h2>

            {ran.unmeasured && (
              <Banner tone="unknown">
                <strong>⚪ 못 쟀다 (종료코드 {ran.exitCode ?? '없다'}).</strong>
                <div className="mt-1.5">
                  ⛔ 이것은 <strong>실패가 아닙니다.</strong> 전제가 안 섰거나 · 검증 분모가
                  0이거나 · 양식을 못 읽은 것입니다. ⛔ 없는 실패를 고치러 가지 마세요 —
                  대신 <strong>왜 못 쟀는지</strong>를 보세요.
                </div>
                {read.why.length > 0 ? (
                  <div className={SAY}>{read.why.join('\n')}</div>
                ) : (
                  /* ⛔ 이유를 못 읽었으면 **그것도 말한다.** 조용히 비워 두면 화면이
                     「이유가 없다」고 말하는 셈이 된다 — 도구는 말했는데 화면이 못 읽은 것이다. */
                  <div className="mt-1.5">
                    ⚠️ <strong>왜 못 쟀는지를 이 화면이 못 읽었습니다</strong> — 도구가 안 말한 것과
                    다릅니다. 아래 도구의 말을 그대로 읽어 주세요.
                  </div>
                )}
              </Banner>
            )}

            {!ran.unmeasured && !ran.ok && (
              <Banner tone="bad">
                <strong>
                  ❌ 판단하지 않은 fail {read.unjudged.length > 0 ? `${String(read.unjudged.length)}건` : ''} (종료코드{' '}
                  {ran.exitCode ?? '없다'}).
                </strong>
                <div className="mt-1.5">
                  ⛔ 「고쳐라」가 아니라 <strong>「판단해라」</strong>입니다 — 받아들일 것인지
                  고칠 것인지는 사람이 정합니다.
                </div>
                {/* ⛔ 어느 것이 왜인지를 **반드시** 싣는다. 안 실으면 사람은 갈 곳이 없다. */}
                {read.unjudged.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {read.unjudged.map((one) => (
                      <li key={one.id} className="rounded-control border border-tone-bad-line px-2.5 py-1.5">
                        <span className="font-mono text-xs font-bold">{one.id}</span>
                        <span className="ml-2 text-xs">{one.reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1.5">
                    ⚠️ <strong>어느 케이스인지를 이 화면이 못 읽었습니다</strong> — 아래 도구의
                    말을 그대로 읽어 주세요.
                  </div>
                )}
              </Banner>
            )}

            {ran.ok && (
              <Banner tone="ok">
                <strong>✅ 끝났다.</strong>
                <div className="mt-1.5">
                  ⛔ 이것은 <strong>「fail 0」이 아닙니다.</strong> 「<strong>판단하지 않은</strong>{' '}
                  fail 0」입니다 — 받아들이기로 한 fail 은 그대로 남아 있습니다.
                </div>
              </Banner>
            )}

            <div className="flex flex-wrap gap-2">
              <Tile reading={read.total ?? '⚪'} label="케이스" />
              <Tile
                reading={read.denominator ?? '⚪'}
                label="검증 분모"
                tone={read.denominator === 0 ? 'unknown' : undefined}
              />
            </div>
            <p className={HELP_TEXT}>
              ⛔ <strong>분모가 0이면 통과가 아닙니다.</strong> 아무것도 검증하지 않은 것이고,
              그때 도구는 ⚪ 로 끝납니다 — 초록불로 보이지 않게 하려고 그렇게 돼 있습니다.
            </p>

            {/* ⭐ 도구가 **스스로 「이건 안 쟀다」고 적은 것.** ⛔ 지우지 않는다 —
                이걸 안 보여 주면 화면이 「다 쟀다」고 말하는 셈이 된다(§8). */}
            {read.notMeasured !== null && (
              <p className={HELP_TEXT}>
                ⚠️ <strong>이 판정이 안 재는 것</strong>: {read.notMeasured}
              </p>
            )}

            {ran.say !== '' && <div className={SAY}>{ran.say}</div>}
          </div>
        )}
      </ContentPane>
    </ConsoleShell>
  );
}
