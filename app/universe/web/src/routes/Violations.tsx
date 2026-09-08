import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getGalaxies, getObservation } from '@api/client';
import type { ILawObservation, IObservation, IRuleObservation } from '@api/types';

import { CountBadge } from '@components/data-display/CountBadge';
import { LawReport } from '@components/data-display/LawReport';
import { ScanScope } from '@components/data-display/ScanScope';
import { ToolEcho } from '@components/data-display/ToolEcho';
import { ViolationRow } from '@components/data-display/ViolationRow';
import { ActionButton } from '@components/form-controls/ActionButton';
import { TextField } from '@components/form-controls/TextField';
import { ConsoleShell, InboxPanes } from '@components/layout/ConsoleShell';
import { DetailEmpty, DetailPane } from '@components/layout/DetailPane';
import { ListPane } from '@components/layout/ListPane';
import { SidebarNav, type ISidebarGroup } from '@components/layout/SidebarNav';
import { judgeRule } from '@lib/verdict';

import { Banner, CARD, CARD_NEXT, CODE, ContentPane, Field, HELP_TEXT, Pill, SECTION } from '@components/ui';

/**
 * **위반 목록과 처방** — 지금까지 터미널 출력에만 있던 것을 사람이 보는 자리.
 *
 * ── 4단으로 다시 잡았다 (2026-09-08) ────────────────────────────────────
 *   ① 레일 · ② **법칙**(+건수) · ③ 그 법칙이 켠 **규칙**(탭 + 검색) · ④ 위반한 자리와 처방
 * 세 단계로 파고든다: **법칙 → 규칙 → 자리.** 전에는 셋이 한 장에 이어 붙어 있어서,
 * 법칙 다섯 개를 지나야 마지막 규칙의 처방에 닿았다.
 *
 * ── ⛔⛔ 여기가 `0` 과 `⚪` 가 **나란히 보이는** 자리다 ──────────────────
 * 이 화면에는 **건수가 0인 규칙이 두 종류** 있다. 둘은 다른 사실이고, 도메인 타입이
 * 이미 그것을 갈라 놓았다(`RuleFiring`):
 *   · `silent-proven`   — 0건이다. 그리고 이 규칙은 **더러운 은하에서 무는 것이 증명됐다.**
 *                         ⇒ 여기 0건은 **「위반이 없다」**다. **`0` 을 찍는다.**
 *   · `silent-unproven` — 0건인데 이 규칙은 **한 번도 무는 것이 확인된 적이 없다.**
 *                         ⇒ **규칙이 약한 것인지 위반이 없는 것인지 모른다.** **`⚪` 를 찍는다.**
 * ⛔ 둘 다 `0` 으로 찍으면 「우리 규칙 20개 중 9개는 아무것도 안 잡는다」가
 *    「위반이 하나도 없다」로 보인다. 그게 이 저장소가 제일 무서워하는 초록불이다.
 * ⚠️ 그리고 **훑은 파일이 0개면 전부 ⚪ 다** — 그때는 어느 규칙도 물지 않은 게 아니라
 *    아무도 안 본 것이다(R162 가 그 사고였다).
 *
 * ── ⛔ 이 화면이 절대 하지 않는 것 ──────────────────────────────────────
 *  1. **「0건」을 「위반이 없다」로 그리지 않는다.** 분모(훑은 파일 수)를 늘 같은 문장에 둔다.
 *  2. **처방을 빠뜨리지 않는다.** 자리 · 코드 · 처방이 한 줄에 함께 있고, 안 오면 「안 왔다」고 적는다.
 *  3. **한 번도 발동 안 한 규칙을 감추지 않는다** — ③ 의 탭 하나가 통째로 그 자리다.
 *  4. **못 잰 것(⚪)을 초록으로 그리지 않는다.**
 *  5. ⛔ **「무시하고 계속」·「이번만 건너뛰기」가 없다.**
 */

const INTAKE = 'mx-auto max-w-shell px-6 pb-20 pt-7';
const PANE_TOP = 'border-b border-ui-line px-3 py-2.5 text-xs text-ui-ink-faint';
const RULE_ROW = 'flex w-full flex-col gap-1 border-b border-solid border-ui-line py-2.5 pr-3 text-left last:border-b-0';
const RULE_OFF = 'border-l-2 border-transparent bg-transparent pl-2.5 hover:bg-ui-surface';
const RULE_ON = 'border-l-2 border-ui-accent bg-ui-surface-raised pl-2.5';
const RULE_ID = 'font-mono text-label font-semibold';

/** 표본을 몇 건까지 받을 것인가의 기본값 — 관측소의 `--sample` 그대로. */
const SAMPLE_DEFAULT = '5';

/** `parseInt` 의 진법. ⚠️ 빼면 옛 브라우저에서 `010` 이 8로 읽힌다 — 그래서 이름을 붙여 둔다. */
const DECIMAL = 10;

/** 사람이 손으로 다시 칠 수 있는 명령. ⛔ 화면이 못 재도 **사람은 잴 수 있어야 한다.** */
const byHand = (galaxy: string, sample: string): string =>
  `node observatory/observe.mjs --galaxy ${galaxy} --sample ${sample}`;

/** 은하 이름을 안 들고 왔을 때의 기본값. ⛔ 이 화면은 이름 없이는 아무것도 못 잰다. */
const GALAXY_DEFAULT = 'console';

/** ③ 의 탭 셋 — 규칙을 **무엇으로 가르는가.** ⛔ 「전부 통과」 같은 넷째 탭을 더하지 마라. */
type RuleTab = 'all' | 'fired' | 'unproven';

/**
 * ⛔⛔ **이 함수 하나가 `0` 과 `⚪` 를 가른다.**
 *
 * `null` 을 돌려주면 화면에 `⚪` 가, 수를 돌려주면 그 수가 찍힌다(`CountBadge`).
 * ⚠️ **`?? 0` 으로 접지 마라** — 그 한 글자가 「모른다」를 「없다」로 바꾼다.
 */
const ruleCount = (rule: IRuleObservation, files: number): number | null => {
  /* 아무 파일도 안 봤다 — 이 규칙이 물었는지조차 모른다(R162 의 자리). */
  if (files === 0) return null;
  /* 물었다면 그 수는 **잰 수**다. */
  if (rule.firing === 'fired') return rule.count;
  /* 0건인데 **무는 것이 증명된** 규칙 — 이 0 은 「위반이 없다」다. */
  if (rule.firing === 'silent-proven') return rule.count;
  /* 0건인데 **한 번도 무는 것이 확인 안 된** 규칙 — 규칙이 약한 건지 위반이 없는 건지 모른다. */
  return null;
};

/** 법칙 하나의 수 — 못 쟀으면 `null`(⚪). ⛔ 0 으로 접지 않는다. */
const lawCount = (law: ILawObservation, files: number, unmeasured: string | null): number | null => {
  if (unmeasured !== null || files === 0) return null;
  return law.total;
};

export function Violations() {
  /**
   * 첫 화면(은하 목록)이 `?galaxy=<이름>` 으로 넘겨 준다.
   *
   * ⛔ **넘겨받았다고 자동으로 재지 않는다.** 열자마자 재면 화면은 「이 은하는 이렇다」를
   * 그리는데, 그건 사람이 고른 은하가 아니라 링크가 고른 은하다. 이름만 채우고 **재는 것은
   * 사람이 누른다** — 이 화면의 첫 상태는 언제나 ⚪ 「아직 재지 않았다」다.
   */
  const [params] = useSearchParams();
  /**
   * ⚠️ 기본값을 **안 넣는다**(전에는 `'console'` 이었다). 등재된 은하가 없을 수도 있고,
   * 그때 기본값이 들어 있으면 화면이 **없는 은하를 고른 것처럼** 보인다.
   * 주소로 들어온 `?galaxy=` 만 존중한다.
   */
  const [galaxy, setGalaxy] = useState(params.get('galaxy') ?? '');
  /**
   * 우주가 아는 은하 목록. ⛔ **못 읽었을 때 빈 목록으로 그리지 않는다** —
   * `null` 은 「아직 못 받았다」이고 `[]` 는 「정말 하나도 없다」다. 화면이 그 둘을 가른다.
   */
  const [list, setList] = useState<string[] | null>(null);

  useEffect(() => {
    void getGalaxies().then(
      /* ⛔ `unmeasured` 가 있으면 **목록을 못 만든 것**이다 — 빈 목록으로 접지 않는다(§8). */
      (came) => setList(came.unmeasured === null ? came.galaxies.map((one) => one.name) : null),
      () => setList(null),
    );
  }, []);
  const [sample, setSample] = useState(SAMPLE_DEFAULT);
  const [observed, setObserved] = useState<IObservation | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pickedLaw, setPickedLaw] = useState<string | null>(null);
  const [pickedRule, setPickedRule] = useState<string | null>(null);
  const [tab, setTab] = useState<RuleTab>('all');
  const [query, setQuery] = useState('');

  /**
   * ⛔ **고른 은하가 목록에 있어야 누를 수 있다.**
   * 전에는 `galaxy.trim() !== ''` 만 봤는데, 기본값(`console`)이 문자열로 들어 있어서
   * **등재된 은하가 하나도 없어도 버튼이 눌렸다.** 누르면 ⚪ 「그런 좌표가 없다」가 나오고,
   * 사람은 자기가 뭘 잘못했는지 찾는다 — ⛔ **못 누르게 하는 것이 답이다.**
   * ⚠️ 목록을 아직 못 받았을 때(`null`)는 막지 않는다 — 「못 받았다」와 「없다」는 다르고,
   *    못 받았다고 사람의 손을 묶으면 주소로 들어온 `?galaxy=` 를 못 쓴다.
   */
  const inList = list === null || list.includes(galaxy.trim());
  const canObserve = galaxy.trim() !== '' && inList && !busy;

  const askToObserve = (): void => {
    setBusy(true);
    setFailure(null);
    setPickedRule(null);
    void getObservation(galaxy.trim(), Number.parseInt(sample, DECIMAL) || 0).then(
      (came) => {
        setObserved(came);
        setPickedLaw(came.laws[0]?.law ?? null);
        setBusy(false);
      },
      (refused: Error) => {
        /* ⛔ 실패했는데 이전 관측을 남겨 두지 않는다 — 남기면 그것이 이 은하의 지금 상태로 보인다. */
        setObserved(null);
        setPickedLaw(null);
        setFailure(refused.message);
        setBusy(false);
      },
    );
  };

  const found = (observed?.laws ?? []).reduce((sum, law) => sum + law.total, 0);
  const files = observed?.scope.files ?? 0;

  const intake = (
    <div className={CARD}>
      <h2 className={SECTION}>은하를 골라 다시 잰다 — 판정은 관측소가 낸다</h2>
      {/**
        * ⚠️⚠️ **전에는 여기가 이름을 손으로 치는 칸이었다.**
        * 「`galaxies/<이름>.json` 의 이름입니다」라고 적어 놓고 **철자를 외우게** 했다 —
        * 이 콘솔의 전제(화면이 정본이다)와 어긋나고, 오타 하나면 **⚪ 「그런 좌표가 없다」**가
        * 뜨는데 사람은 자기가 틀린 건지 은하가 없는 건지 모른다.
        * ⇒ **우주가 아는 것만 고른다.** 목록은 `/api/galaxies` 가 준다.
        * ⛔ 등재된 은하가 **하나도 없으면 빈 칸을 그리지 않는다** — 「없다」를 그대로 말한다(§8).
        */}
      {list === null && <span className={HELP_TEXT}>은하 목록을 부르는 중…</span>}
      {list !== null && list.length === 0 && (
        <Banner tone="unknown">
          <strong>⚪ 고를 은하가 없다 — 「위반이 없다」가 아니다.</strong>
          <div className="mt-1.5">
            이 우주에 등재된 은하가 <strong>하나도 없습니다.</strong> 먼저 레일의{' '}
            <strong>「받아 오기」</strong> 나 <strong>「잴 저장소」</strong> 로 은하를 들이세요.
          </div>
        </Banner>
      )}
      {list !== null && list.length > 0 && (
        <Field
          label="은하"
          sub="등재된 것만"
          help="⛔ 이름을 치지 않습니다 — 우주가 아는 것만 고릅니다. 좌표가 있어야 목록에 뜹니다."
        >
          <select id="observe-galaxy" value={galaxy} onChange={(e) => setGalaxy(e.target.value)}>
            <option value="">고르세요</option>
            {list.map((one) => (
              <option key={one} value={one}>{one}</option>
            ))}
          </select>
        </Field>
      )}
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
  );

  /* ── ② 사이드바 — 법칙마다 건수. ⛔ 못 쟀으면 ⚪. ─────────────────────── */
  const sidebarGroups: ISidebarGroup[] = [
    {
      title: observed === null ? '법칙' : `법칙 — ${observed.galaxy}`,
      unmeasured:
        observed === null
          ? (failure ?? '아직 재지 않았다 — 오른쪽에서 은하를 골라 재라.')
          : observed.unmeasured,
      items: (observed?.laws ?? []).map((law) => ({
        id: law.law,
        label: law.title,
        count: lawCount(law, files, observed?.unmeasured ?? null),
        why: '훑은 파일이 0개이거나 도구가 못 쟀다 — 「위반이 없다」가 아니다.',
      })),
    },
  ];

  const sidebar = (
    <SidebarNav
      label="법칙"
      groups={sidebarGroups}
      selected={pickedLaw}
      onSelect={(id) => {
        setPickedLaw(id);
        setPickedRule(null);
      }}
    />
  );

  const law = (observed?.laws ?? []).find((one) => one.law === pickedLaw) ?? null;

  /* 아직 안 쟀다 — ③④ 를 그리지 않고 **재는 자리**만 넓게 쓴다. */
  if (observed === null || law === null) {
    return (
      <ConsoleShell sidebar={sidebar}>
        <ContentPane>
            <h1 className="text-title font-bold">위반 목록과 처방</h1>
            <p className="mb-4.5 mt-1 text-ui-ink-dim">
              건수는 언제나 <strong>분모(훑은 파일 수)</strong>와 함께 나옵니다 — 파일 0개를 훑은
              0건은 「위반이 없다」가 아니라 <strong>「안 봤다」</strong>입니다.
            </p>
            {/**
              * ⛔⛔ **셋을 갈라 말한다 — 브라우저에서 보고 고쳤다.**
              * 처음엔 「아직 재지 않았다」 하나로 뭉쳐 있었는데, `selfscan` 을 재 봤더니
              * **도구가 「못 쟀다」고 답했는데도 화면은 「아직 재지 않았다」**고 적었다.
              * 그 둘은 다른 사실이다: 앞은 **사람이 아직 안 누른 것**이고,
              * 뒤는 **눌렀고 · 도구가 돌았고 · 그런데 못 쟀다**는 것이다.
              * 뭉치면 「재 봤더니 못 쟀다」가 「아직 안 했네」로 읽혀 아무도 이유를 안 본다.
              */}
            {observed === null && failure === null && !busy && (
              <Banner tone="unknown">
                <strong>⚪ 아직 재지 않았다.</strong>
                <div className="mt-1.5">
                  여기 아무것도 없는 것은 <strong>「위반이 없다」가 아니다</strong> — 아직 안 잰
                  것이다. ⛔ 재기 전에는 이 화면이 초록을 그리지 않는다.
                </div>
              </Banner>
            )}

            {observed !== null && !busy && (
              <Banner tone="unknown">
                <strong>⚪ 쟀는데 못 쟀다 — 도구가 한 말 그대로입니다.</strong>
                {observed.unmeasured !== null && (
                  <div className="mt-1.5 whitespace-pre-wrap">{observed.unmeasured}</div>
                )}
                <div className="mt-1.5">
                  ⛔ 이것은 <strong>「아직 안 쟀다」와 다른 말이다</strong> — 눌렀고, 도구가
                  돌았고, 그런데 <strong>잴 수가 없었다.</strong> 그래서 왼쪽 법칙 목록에
                  <strong> 0 이 아니라 ⚪</strong> 가 떠 있다.
                </div>
                <div className="mt-1.5">
                  ⛔ 그리고 이것은 <strong>「위반이 없다」가 아니다.</strong> 몇 건인지는 아무도 모른다.
                </div>
              </Banner>
            )}

            {failure !== null && (
              <Banner tone="unknown">
                <strong>⚪ 못 쟀다 — 관측을 받지 못했습니다.</strong>
                <div className="mt-1.5 whitespace-pre-wrap">{failure}</div>
                <div className="mt-1.5">
                  ⛔ 이것은 <strong>「위반이 없다」도 「실패했다」도 아니다.</strong> 화면이 대신
                  그럴듯한 목록을 그리지 않는다 — 그러면 아무도 재지 않은 은하가 초록으로 보인다.
                </div>
                <div className="mt-1.5">
                  그동안 사람은 손으로 잴 수 있다. 우주 저장소 뿌리에서:
                  <div className="mt-1.5">
                    <code>{byHand(galaxy.trim() || GALAXY_DEFAULT, sample || SAMPLE_DEFAULT)}</code>
                  </div>
                </div>
              </Banner>
            )}

            {intake}
        </ContentPane>
      </ConsoleShell>
    );
  }

  /* ── ③ 규칙 목록 ────────────────────────────────────────────────────── */
  const inTab = (rules: IRuleObservation[]): IRuleObservation[] => {
    if (tab === 'fired') return rules.filter((one) => one.firing === 'fired');
    if (tab === 'unproven') return rules.filter((one) => one.firing === 'silent-unproven');
    return rules;
  };
  const shownRules = inTab(law.rules).filter((one) =>
    one.rule.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const rule = law.rules.find((one) => one.rule === pickedRule) ?? null;
  const samples = rule === null ? [] : law.samples.filter((one) => one.rule === rule.rule);
  /**
   * ⛔ 판정을 **한 번만** 부른다. 전에는 같은 자리에서 `judgeRule` 을 네 번 불렀는데,
   * 그러면 「표는 ⚪ 인데 문장은 초록」처럼 **한 배지 안에서 갈리는** 사고가 생길 자리가 넷이 된다.
   */
  const verdict = rule === null ? null : judgeRule(rule, observed.scope);

  return (
    <ConsoleShell sidebar={sidebar}>
      <InboxPanes
        list={
          <ListPane
            tabs={[
              { id: 'all', label: '전체', count: law.rules.length },
              {
                id: 'fired',
                label: '물었다',
                count: law.rules.filter((one) => one.firing === 'fired').length,
              },
              {
                /* ⛔⛔ 이 탭이 이 화면의 존재 이유다 — 「0건」과 「모른다」를 갈라 세는 자리. */
                id: 'unproven',
                label: '⚪ 증명 안 됨',
                count: law.rules.filter((one) => one.firing === 'silent-unproven').length,
              },
            ]}
            activeTab={tab}
            onTab={(next) => setTab(next as RuleTab)}
            query={query}
            onQuery={setQuery}
            searchLabel="규칙 id 로 거르기"
            hasRows={shownRules.length > 0}
            whenEmpty={
              query.trim() === '' ? (
                <>
                  이 탭에 <strong>0개</strong>다 — 이 법칙이 켠 규칙 {law.rules.length}개 중.
                </>
              ) : (
                <>
                  이 글자(<code>{query}</code>)로는 <strong>안 걸렸다</strong> — 이 탭에는{' '}
                  {inTab(law.rules).length}개가 있다.
                </>
              )
            }
          >
            {shownRules.map((one) => {
              const verdict = judgeRule(one, observed.scope);
              return (
                <button
                  key={one.rule}
                  type="button"
                  className={`${RULE_ROW} ${pickedRule === one.rule ? RULE_ON : RULE_OFF}`}
                  onClick={() => setPickedRule(one.rule)}
                >
                  <span className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate ${RULE_ID}`}>{one.rule}</span>
                    {/**
                     * ⛔⛔ **`0` 과 `⚪` 가 여기서 나란히 보인다.** 이 목록에는 건수가 0인 규칙이
                     * 두 종류 있고, 하나는 **숫자 `0`**(잰 0 — 위반이 없다)으로,
                     * 다른 하나는 **`⚪`**(무는 것이 증명된 적 없다 — 모른다)로 찍힌다.
                     * 가르는 것은 `ruleCount` 한 자리다.
                     */}
                    <CountBadge count={ruleCount(one, files)} why={verdict.why} />
                  </span>
                  <span className="flex flex-wrap items-center gap-1.25">
                    <Pill tone={verdict.tone}>{verdict.label}</Pill>
                  </span>
                  <span className="text-meta text-ui-ink-faint">{verdict.why}</span>
                </button>
              );
            })}
          </ListPane>
        }
        detail={
          rule === null || verdict === null ? (
            <div>
              <p className={PANE_TOP}>
                ⬅ 왼쪽에서 규칙을 고르면 여기에 <strong>위반한 자리와 처방</strong>이 뜹니다.
                아래는 이 법칙 전체입니다.
              </p>
              <div className="px-4.5 py-4">
                <ScanScope scope={observed.scope} found={found} />
                <LawReport law={law} scope={observed.scope} />
                <div className={CARD_NEXT}>
                  <h2 className={SECTION}>도구가 한 말 그대로</h2>
                  <p className={`mb-3.5 ${HELP_TEXT}`}>
                    「했습니다」는 주장이지 측정이 아니다 — 사람이{' '}
                    <code className={CODE}>손으로 다시</code> 칠 수 있어야 검증된다.
                  </p>
                  <ToolEcho
                    command={observed.tool.command}
                    exitCode={observed.tool.exitCode}
                    stdout={observed.tool.stdout}
                    stderr={observed.tool.stderr}
                  />
                </div>
                {intake}
              </div>
            </div>
          ) : (
            <DetailPane
              head={
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="font-mono text-xl font-bold">{rule.rule}</span>
                  <span className="text-meta text-ui-ink-faint">
                    {law.title} · 파일 {observed.scope.files}개를 훑었다
                  </span>
                </div>
              }
            >
              {/**
                * ⚠️ `Banner` 가 아니라 카드 + `Pill` 이다. `judgeRule` 의 표는 **배지용 어휘**
                * (`PillTone`)라서 배너의 어휘(`BannerTone`)와 칸이 다르다 — 타입이 그걸 막았다.
                * ⛔ 억지로 넓혀 맞추지 않았다. 둘이 다른 어휘인 데는 이유가 있다(`ui.tsx`).
                */}
              <div className={CARD}>
                <p className="flex flex-wrap items-baseline gap-2">
                  <Pill tone={verdict.tone}>{verdict.label}</Pill>
                  <span className="font-mono text-label font-semibold">{rule.rule}</span>
                </p>
                <p className="mt-1.5 text-meta text-ui-ink-dim">{verdict.why}</p>
                <p className="mt-1.5 text-meta text-ui-ink-dim">
                  ⛔ 건수는 분모와 함께만 읽는다:{' '}
                  <strong>
                    파일 {observed.scope.files}개 중 {rule.count}건
                  </strong>
                  .
                  {ruleCount(rule, files) === null && (
                    <>
                      {' '}그리고 이 수는 <strong>잰 수가 아니다</strong> — 위 문장이 이유다.
                      화면은 그래서 목록에 <strong>0 이 아니라 ⚪</strong> 를 찍었다.
                    </>
                  )}
                </p>
              </div>

              {samples.length === 0 ? (
                <DetailEmpty>
                  <strong>⚪ 이 규칙의 자리가 안 왔다.</strong>
                  <div className="mt-1.5">
                    표본을 요청하지 않았거나(<code>--sample 0</code>), 이 규칙이 이 은하에서
                    물지 않았다. ⛔ <strong>둘은 다른 사실이고, 이 화면은 지금 어느 쪽인지 모른다</strong> —
                    위 배지가 그 답을 갖고 있다.
                  </div>
                </DetailEmpty>
              ) : (
                samples.map((one) => <ViolationRow key={`${one.rule}|${one.where}`} sample={one} />)
              )}
            </DetailPane>
          )
        }
      />
    </ConsoleShell>
  );
}
