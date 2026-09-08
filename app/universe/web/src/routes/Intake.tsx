import { useEffect, useState } from 'react';

import { getBranches, getGalaxies, getGhOrgs, getRepos, postAdopt, postClone, readGalaxyDraft, writeGalaxyCoordinates } from '@api/client';
import type { IAdoptResult, IBranchList, ICloneResult, IGhOrgs, IRepoListResult } from '@api/types';

import { GhAuthPanel } from '@components/data-display/GhAuthPanel';
import { ActionButton } from '@components/form-controls/ActionButton';
import { TextField } from '@components/form-controls/TextField';
import { ConsoleShell } from '@components/layout/ConsoleShell';
import { SidebarNav, type ISidebarGroup } from '@components/layout/SidebarNav';
import { Banner, CARD, CARD_NEXT, CODE, ContentPane, HELP_TEXT, PageHead, SECTION } from '@components/ui';

/**
 * **첫 칸 — 저장소를 받아 와 은하로 들인다.**
 *
 * ── 왜 이 화면이 생겼나 ─────────────────────────────────────────────────
 * ⛔⛔ **서버에는 `POST /api/clones` 와 `POST /api/adopt` 가 있었는데 화면에서 부르는 곳이
 * 하나도 없었다**(실측: `grep -rn "api/clones\|api/adopt" web/src` → **0줄**).
 * 사용자의 계획은 「우주를 깔고 **화면을 띄우고 깃 주소를 입력하고**」로 시작하는데,
 * 그 첫 칸을 **CLI 를 아는 사람만** 밟을 수 있었다. 화면에 없으면 아무도 안 쓴다 —
 * 이 콘솔의 첫 화면이 이미 그 일을 겪었다(우주가 아는 은하가 화면에 아예 안 떴다).
 *
 * ── ⛔ 이 화면이 절대 하지 않는 여섯 가지 ───────────────────────────────
 *  1. ⛔⛔ **토큰 칸을 만들지 않는다.** 인증은 그 기계의 git 이 한다. 주소에 자격이 박히면
 *     그 값이 **인자**가 되어 셸 히스토리·프로세스 목록·서버 로그에 남는다. 서버가 그런 주소를
 *     400 으로 거절하고, 화면은 그 문장을 **그대로** 옮긴다.
 *  2. **도구가 한 말(`say`)을 요약하지 않는다.** 줄바꿈째로 그대로 싣는다 — 요약하는 순간
 *     화면의 말과 도구의 말이 갈리고, 갈린 뒤엔 어느 쪽이 사실인지 아무도 모른다.
 *  3. **`ok:false` 를 빨간 오류로 그리지 않는다.** 「그런 저장소가 없다」·「`TODO:` 가 남았다」는
 *     **결과**다 — 서버가 4xx 를 안 주는 것과 같은 이유다. ⛔ 로 시작하는 **안내**로 그린다.
 *  4. ⛔ **`killed:true` 를 ❌ 로 그리지 않는다.** 시간 제한에 끊긴 것은 「못 받았다」가 아니라
 *     **「못 쟀다」**(⚪)다. 큰 저장소는 5분을 넘긴다 — ❌ 로 그리면 사람이 **없는 실패**를 고치러 간다.
 *  5. ⛔ **`TODO:` 를 화면이 대신 채우지 않는다.** 태양계는 사람이 고른다(§9).
 *     자동으로 채우면 초안이 완성본 행세를 하고, 관문은 엉뚱한 것을 재게 된다.
 *  6. ⛔ **「무시하고 계속」·「TODO 무시하고 들이기」 갈래가 없다.** 넘길 수 있는 관문은 넘겨진다.
 *
 * ── ⓪ **주소를 외우게 하지 않는다**(레포 고르기) ────────────────────────
 * 사용자가 요구한 두 번째 길은 「**깃 로그인을 통해서 깃 레포를 선택**」이었다.
 * `GET /api/repos` 는 서버에 **있었는데 화면에서 부르는 곳이 0곳**이었다 — 즉 그 길은
 * **터미널을 아는 사람만** 밟을 수 있었다(콘솔 프로브가 「화면이 안 부르는 자리」로 세던 칸).
 *
 * ⛔⛔ 그런데 **로그인을 화면이 하지 않는다.** 여기서 「로그인」은 *이미 되어 있는 것을 쓴다*는
 *     뜻이다 — `gh auth login` 은 사람이 자기 터미널에서 한 번 하고, 콘솔은 그 결과를 **읽기만**
 *     한다. 화면에 자격을 받는 칸을 만들면 그 값이 네트워크·서버 로그·프로세스 목록을 탄다.
 *     ⇒ **칸을 안 만들었다.** 로그인이 안 됐으면 도구가 그렇게 말하고 화면은 그 말을 옮긴다.
 * ⛔ **잘린 목록을 전부인 척하지 않는다.** `gh` 는 기본으로 위에서 몇 개만 가져온다 —
 *    `truncated` 면 화면이 **먼저** 그 사실을 말한다. 안 말하면 「내 저장소가 없다」로 읽히고,
 *    그 사람은 **화면이 고장 난 줄 알고** 주소를 직접 넣을 생각을 안 한다(§8 — 분모를 지고 다닌다).
 * ⛔ **못 쟀다(⚪)와 비었다(0)를 같은 그림으로 그리지 않는다.** `gh` 가 없어서 못 읽은 것과
 *    이 계정에 저장소가 없는 것은 **다른 사실**이고, 사람이 갈 곳도 다르다.
 * ⛔ **고른다고 바로 받아 오지 않는다.** 고르는 것은 주소를 칸에 넣는 데서 끝난다 —
 *    한 번의 실수 클릭이 5분짜리 내려받기가 되면 안 된다.
 *
 * ── ⭐ 들인 뒤에 **다시 물어본다** ──────────────────────────────────────
 * 도구가 「들였다」고 말해도 화면은 그것만 믿지 않는다 — `getGalaxies()` 를 **다시 불러서**
 * 그 이름이 실제로 목록에 올라왔는지 확인한다. 「했습니다」는 주장이고, 목록에 뜨는 것이 측정이다.
 */

/** ⛔ 셋뿐이다. 「건너뛰기」 같은 네 번째 칸을 여기 더하지 마라. */
type IntakeStep = 'clone' | 'draft' | 'adopt';

const STEPS: { id: IntakeStep; label: string }[] = [
  { id: 'clone', label: '① 주소 입력' },
  { id: 'draft', label: '② 초안 확인' },
  { id: 'adopt', label: '③ 들이기' },
];

/** 도구가 한 말 — ⛔ 줄바꿈째로 **그대로**. */
const SAY = 'mt-1.5 max-h-code overflow-auto whitespace-pre-wrap rounded-control border border-ui-line bg-ui-surface-sunken p-2.5 font-mono text-xs leading-code';

export function Intake() {
  const [url, setUrl] = useState('');
  /**
   * ── 가지 ── ⚠️⚠️ **없어서 다른 코드를 잴 뻔한 칸이다.**
   * 안 주면 git 이 **원격의 기본 가지**를 받는다. 그런데 잴 대상이 `main` 이 아닌 경우가
   * 흔하다 — 이 우주의 실측 은하들부터가 작업 가지에 있다.
   * ⛔ 기본 가지를 받아 놓고 「이 저장소를 쟀다」고 말하면 **다른 코드를 잰 것**이다.
   * ⛔ 화면이 가지를 **짐작해서 고르지 않는다** — 안 고르면 안 고른 대로 두고,
   *    받은 뒤 도구가 **실제로 어느 가지인지 찍는다**(짐작 대신 실측).
   */
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<IBranchList | null>(null);
  const [askingBranches, setAskingBranches] = useState(false);

  /** 비워 두면 도구가 주소에서 이름을 딴다 — ⛔ 화면이 지어내지 않는다. */
  const [name, setName] = useState('');

  const [cloned, setCloned] = useState<ICloneResult | null>(null);
  const [adopted, setAdopted] = useState<IAdoptResult | null>(null);
  /**
   * ── 초안의 빈칸 ── ⚠️⚠️ **여기가 막혀 있었다.**
   * 전에는 이 화면이 「**파일을 열어 채운 뒤** ③으로 가세요」라고 말했다. ⛔ 터미널을 안 여는
   * 사람에게는 **거기서 끝**이다 — 받아 오기까지 화면으로 와 놓고 마지막 한 칸에서
   * 파일 편집기로 내보낸다. 이 제품의 전제(화면이 정본이다)와 정면으로 어긋난다.
   * ⇒ 「잴 저장소」 화면에 이미 있던 그 칸을 여기에도 낸다. 서버 자리는 같은 것을 쓴다.
   */
  const [blanks, setBlanks] = useState<string[] | null>(null);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  /** 요청의 모양이 틀렸거나(400) 서버가 도구를 못 불렀을 때(500)만 여기 담긴다. */
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<IntakeStep>('clone');

  /** 들인 뒤 **다시 물어본** 결과. ⛔ 도구의 말이 아니라 목록이 낸 답이다. */
  const [listed, setListed] = useState<string | null>(null);

  /** 이 기계의 git 이 아는 레포. ⛔ `null` 은 「없다」가 아니라 **「아직 안 물어봤다」**다. */
  const [repos, setRepos] = useState<IRepoListResult | null>(null);
  const [asking, setAsking] = useState(false);
  /**
   * ── 소유자 ── ⚠️⚠️ **없어서 데인 칸이다.**
   * `gh` 의 레포 목록은 소유자를 안 주면 **활성 계정 자신**을 본다. 그런데 계정이
   * **조직에만** 속해 있으면 자기 소유 레포는 0개다 — 실측으로 그렇게 나왔고,
   * 화면에는 그것이 「저장소가 없다」 또는 「비공개라 안 보이나」로 보였다.
   * ⛔ 셋(진짜 없다 · 스코프가 없다 · 소유자가 다르다)이 **똑같이 0으로 보이는** 그 사고(§8).
   * ⇒ 소유자를 바꿀 수 있게 하고, 조직 후보는 **`gh` 가 아는 것**을 눌러 넣는다.
   */
  const [owner, setOwner] = useState('');
  const [orgs, setOrgs] = useState<IGhOrgs | null>(null);


  /**
   * ⭐ **주소를 외우게 하지 않는다** — 이 기계의 git 이 이미 아는 것을 보여 주고 고르게 한다.
   *
   * ⛔ 여기서 **로그인을 시키지 않는다.** 로그인이 안 됐으면 도구가 그렇게 말하고,
   *    화면은 그 말을 옮기며 「그건 당신 터미널에서 한 번 하는 일」이라고 알려 준다.
   *    ⛔ 화면에 자격을 받는 칸을 만들면 그 값이 네트워크를 탄다 — 그래서 안 만든다.
   */
  useEffect(() => {
    /* ⛔ 실패해도 화면을 막지 않는다 — 조직은 **후보**이지 필수가 아니다. 손으로도 칠 수 있다. */
    void getGhOrgs().then(setOrgs, () => undefined);
  }, []);

  const askRepos = (): void => {
    setAsking(true);
    setRefused(null);
    /* ⛔ 묻는 순간 앞의 목록을 지운다 — 남겨 두면 그것이 지금 목록으로 읽힌다. */
    setRepos(null);
    void getRepos(undefined, owner.trim()).then(
      (came) => {
        setAsking(false);
        setRepos(came);
      },
      (failed: Error) => {
        setAsking(false);
        setRefused(failed.message);
      },
    );
  };

  const askBranches = (): void => {
    setAskingBranches(true);
    /* ⛔ 묻는 순간 앞의 목록을 지운다 — 남겨 두면 그것이 이 주소의 가지로 읽힌다. */
    setBranches(null);
    void getBranches(url.trim()).then(
      (came) => { setBranches(came); setAskingBranches(false); },
      (failed: Error) => {
        setBranches({ ok: false, branches: [], say: failed.message, exitCode: null });
        setAskingBranches(false);
      },
    );
  };

  const fetchRepo = (): void => {
    setBusy(true);
    setRefused(null);
    setAdopted(null);
    setListed(null);
    /* ⛔ 묻는 순간 앞의 결과를 지운다 — 남겨 두면 그것이 지금 상태로 읽힌다. */
    setCloned(null);
    void postClone(url.trim(), name.trim() === '' ? undefined : name.trim(), branch.trim() === '' ? undefined : branch.trim()).then(
      (came) => {
        setBusy(false);
        setCloned(came);
        /* 받아 왔고 초안까지 나왔을 때만 다음 칸으로 옮긴다. ⛔ 실패를 넘겨 보내지 않는다. */
        setStep(came.ok && came.draft !== null ? 'draft' : 'clone');
        /* ⭐ 초안이 나왔으면 **빈칸 자리를 바로 읽어 온다** — 사람이 파일을 열 이유가 없게. */
        setBlanks(null);
        setFilled({});
        setWriteNote(null);
        if (came.draft !== null) {
          void readGalaxyDraft(came.draft).then(
            (draft) => setBlanks(draft.todos.at),
            /* ⛔ 못 읽었으면 **빈 목록으로 그리지 않는다** — 「채울 게 없다」로 보인다(§8). */
            () => setBlanks(null),
          );
        }
      },
      (failed: Error) => {
        setBusy(false);
        setRefused(failed.message);
      },
    );
  };

  const adoptDraft = (draft: string): void => {
    setBusy(true);
    setRefused(null);
    setListed(null);
    setAdopted(null);
    void postAdopt(draft).then(
      (came) => {
        setBusy(false);
        setAdopted(came);
        if (!came.ok) return;
        /**
         * ⭐ **다시 물어본다** — 「들였다」는 주장이고, 목록에 뜨는 것이 측정이다.
         *
         * ⛔⛔ **이름을 안 줬으면 「확인했다」고 말하지 않는다.** 이름을 비워 두면 그것을
         * **도구가 주소에서 딴다** — 그래서 화면은 **무엇을 찾아야 하는지 모른다.**
         * 그때 목록에 은하가 하나 늘어난 것을 보고 「그게 방금 들인 것」이라고 말하면,
         * 그건 **재지 않고 짐작한 것**이다. 개수만 적고 어디서 확인하는지 알려 준다.
         */
        const asked = name.trim();
        void getGalaxies().then(
          (list) => {
            if (asked === '') {
              setListed(
                `목록을 다시 불렀다 — 지금 은하 ${list.galaxies.length}개다. `
                + '⚠️ 이름을 안 줘서 도구가 주소에서 땄다 — 화면은 그 이름을 모른다. '
                + '왼쪽 레일의 「은하」에서 눈으로 확인해라.',
              );
              return;
            }
            const found = list.galaxies.some((one) => one.name === asked);
            setListed(
              found
                ? `목록을 다시 불러서 확인했다 — 「${asked}」가 은하 ${list.galaxies.length}개 안에 있다.`
                : `⚠️ 목록을 다시 불렀는데 「${asked}」가 없다 — 은하 ${list.galaxies.length}개. `
                  + '도구는 들였다고 했는데 목록에 안 보인다. 둘 중 하나가 틀렸다.',
            );
          },
          (why: Error) =>
            setListed(`⚪ 목록을 다시 못 불렀다 — ${why.message} (들인 것이 실패했다는 뜻은 아니다.)`),
        );
      },
      (failed: Error) => {
        setBusy(false);
        setRefused(failed.message);
      },
    );
  };

  const sidebarGroups: ISidebarGroup[] = [
    {
      title: '저장소 받아 오기',
      /* ⛔ 단계는 **측정이 아니다** — 수 배지를 안 단다(`SidebarNav` 의 세 갈래). */
      items: STEPS.map((one) => ({ id: one.id, label: one.label })),
    },
  ];

  return (
    <ConsoleShell
      sidebar={
        <SidebarNav
          label="받아 오기 단계"
          groups={sidebarGroups}
          selected={step}
          onSelect={(id) => setStep(id as IntakeStep)}
        />
      }
    >
      <ContentPane>
        <PageHead
          eyebrow="우주 콘솔"
          title="저장소 받아 오기"
          sub="깃 주소를 주면 이 기계로 받아 와 좌표 초안을 만듭니다. ⛔ 토큰을 넣는 칸은 없습니다 — 인증은 이 기계의 git 이 합니다. 초안의 「TODO:」는 사람이 채웁니다."
        />

        {/**
          * ⭐ **깃 로그인이 이 화면의 첫 칸이다.** 받아 오기·레포 목록이 전부 이 기계의
          * `gh` 계정으로 도는데, 전에는 그 상태가 **화면 어디에도 안 보였다** —
          * 로그인이 안 돼 있으면 「받아 오지 못했다」만 뜨고 이유는 사람이 추측했다.
          * ⚠️ 그리고 계정이 둘이 되는 날(개인 · 회사 조직)에는 **어느 쪽으로 붙었는지**가
          *    받아 오는 결과를 바꾼다. 그래서 맨 위에 둔다.
          */}
        <GhAuthPanel />

        {/* ⛔ 요청의 모양이 틀린 것만 여기 온다 — 「받아 오지 못했다」는 결과라서 아래로 간다. */}
        {refused !== null && (
          <Banner tone="bad">
            <strong>⛔ 요청을 거절했다 — 서버가 쓴 문장 그대로입니다.</strong>
            <div className="mt-1.5 whitespace-pre-wrap">{refused}</div>
            <div className="mt-1.5">
              주소에 <strong>토큰이 박혀 있으면</strong> 서버가 여기서 끊습니다. 토큰을 빼고 주소만
              주세요 — 인증은 이 기계의 git 이 합니다.
            </div>
          </Banner>
        )}

        {busy && (
          <Banner tone="unknown">
            <strong>⚪ 도는 중 — 아직 아무 답도 안 왔다.</strong>
            <div className="mt-1.5">
              큰 저장소는 시간이 걸립니다. ⛔ 기다리는 동안 <strong>앞의 결과를 남겨 두지 않았다</strong> —
              남겨 두면 그것이 지금 상태로 읽힙니다.
            </div>
          </Banner>
        )}

        {/* ── ① 주소 입력 ──────────────────────────────────────────── */}
        {step === 'clone' && (
          <div className={CARD}>
            <h2 className={SECTION}>① 깃 주소 — 받는 규율은 도구가 안다</h2>

            {/* ⭐ 주소를 외우게 하지 않는다 — 이 기계의 git 이 아는 것을 고르게 한다. */}
            <div className="mb-3">
              <TextField
                id="repo-owner"
                label="소유자"
                sub="계정 또는 조직 — 비우면 지금 계정 자신"
                value={owner}
                placeholder="lunasoft-org 같은 조직 이름"
                help="⚠️ 비워 두면 활성 계정이 **자기 소유로** 가진 것만 봅니다. 레포가 조직 아래 있으면 그 목록은 0개입니다 — ⛔ 그건 「없다」가 아니라 **못 본 것**입니다."
                onChange={setOwner}
              />

              {/* ⭐ 조직 이름을 외우게 하지 않는다 — `gh` 가 아는 것을 눌러서 넣는다. */}
              {orgs !== null && orgs.ok && orgs.orgs.length > 0 && (
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className={HELP_TEXT}>이 계정이 속한 조직:</span>
                  {orgs.orgs.map((name) => (
                    <ActionButton key={name} disabled={asking || busy} onClick={() => setOwner(name)}>
                      {name}
                    </ActionButton>
                  ))}
                  <ActionButton disabled={asking || busy} onClick={() => setOwner('')}>
                    나 자신({orgs.account ?? '?'})
                  </ActionButton>
                </div>
              )}
              {orgs !== null && !orgs.ok && (
                <p className={HELP_TEXT}>
                  ⚪ 조직 후보를 못 읽었습니다 — <strong>조직이 없다는 뜻이 아닙니다.</strong>{' '}
                  이름을 직접 쳐도 됩니다.
                </p>
              )}

              <ActionButton disabled={asking || busy} onClick={askRepos}>
                {asking ? '물어보는 중…' : owner.trim() === '' ? '내 저장소 목록에서 고르기' : `${owner.trim()} 의 저장소 목록`}
              </ActionButton>
              {/**
                * ⚠️⚠️ **이 문단은 바뀌었다 — 화면이 스스로와 모순하고 있었다.**
                * 전에는 여기에 「⛔ 여기서 로그인하지 않습니다 … 그래서 **칸을 안 만들었습니다**」가
                * 적혀 있었다. 위에 로그인 칸(`GhAuthPanel`)이 생긴 뒤로 그 문장은 **거짓말**이다.
                * ⛔ 남겨 두면 사람은 두 문장 중 어느 쪽을 믿을지 매번 판단해야 한다.
                *
                * ⭐ 다만 그 문장이 지키려던 것은 **그대로 지킨다**: 로그인 자격(토큰)을
                *   **화면이 받지 않는다.** 위 칸도 토큰 입력란이 없다 — `gh` 가 브라우저에서
                *   받고, 이 콘솔은 **누구로 됐는지만 읽는다.**
                */}
              <p className={HELP_TEXT}>
                목록은 이 기계의 <code className={CODE}>gh</code> 가 <strong>이미</strong> 아는 계정으로
                옵니다 — 위 「깃 로그인」 칸이 그 계정을 말합니다. ⛔{' '}
                <strong>토큰을 넣는 칸은 어디에도 없습니다</strong> — 자격을 화면에서 받으면 그 값이
                네트워크와 서버 로그를 타고 흐릅니다.
              </p>
            </div>

            {repos !== null && !repos.ok && (
              <Banner tone="unknown">
                <strong>⚪ 목록을 못 쟀다 — 「저장소가 없다」가 아니다.</strong>
                <div className="mt-1.5">
                  ⛔ 이 둘은 <strong>다른 사실</strong>입니다. 여기서 빈 목록을 그리면 당신은
                  「내 저장소가 하나도 없다」를 믿게 됩니다 — 그건 아직 아무도 모릅니다.
                </div>
                {repos.say !== '' && <div className={SAY}>{repos.say}</div>}
                <div className="mt-1.5">
                  대개는 이 기계에 <code>gh</code> 로그인이 안 된 것입니다. 그건{' '}
                  <strong>사람이 자기 터미널에서 한 번</strong> 하는 일이고, 화면은 그걸 대신
                  못 합니다. 그동안에도 <strong>아래에 주소를 직접 넣으면 됩니다</strong> — 이 칸은
                  편의이지 유일한 길이 아닙니다.
                </div>
              </Banner>
            )}

            {repos !== null && repos.ok && repos.data !== null && (
              <div className="mb-3">
                <Banner tone={repos.data.truncated ? 'unknown' : 'ok'}>
                  {/**
                    * ⛔⛔ **전에는 여기가 `account` 를 찍었다 — 잰 것과 적은 것이 달랐다.**
                    * 소유자 칸이 생기기 전에는 소유자가 늘 활성 계정 자신이라 두 값이 같았고,
                    * 그래서 틀린 것이 **안 보였다.** 조직을 물어본 순간 화면은
                    * 「mjyu-louis — 30개」라고 적으면서 `lunasoft-org` 의 목록을 그렸다.
                    * ⇒ **누구의 목록인가**(owner)와 **누구의 눈으로 봤나**(account)를 **둘 다** 적는다.
                    *   ⚠️ 계정을 지우면 안 된다 — 같은 조직도 계정에 따라 보이는 것이 다르다.
                    */}
                  <strong>
                    {repos.data.owner ?? repos.data.account ?? '(소유자를 못 읽었다)'} 의 저장소{' '}
                    {repos.data.repos.length}개
                  </strong>
                  <div className="mt-1.5">
                    계정 <strong>{repos.data.account ?? '(못 읽었다)'}</strong> 의 눈으로 본 것입니다 —
                    스코프 <code className={CODE}>{repos.data.scopes ?? '못 읽음'}</code>.
                  </div>
                  {repos.data.truncated ? (
                    <div className="mt-1.5">
                      ⚠️ <strong>이게 전부가 아닙니다.</strong> 도구가 위에서{' '}
                      <strong>{repos.data.limit}개</strong>까지만 가져왔습니다 — 여기 없다고 해서
                      그 저장소가 없는 것이 아닙니다. ⛔ 안 보이면{' '}
                      <strong>아래에 주소를 직접 넣으세요.</strong>
                    </div>
                  ) : (
                    <div className="mt-1.5">
                      이 계정이 아는 것을 <strong>다 가져왔습니다</strong> — 잘리지 않았습니다.
                    </div>
                  )}
                </Banner>

                {repos.data.repos.length === 0 && (
                  <p className={HELP_TEXT}>
                    ⛔ 목록은 <strong>제대로 읽혔고</strong>, 그 안이 비어 있습니다 — 위의 ⚪
                    (못 쟀다)와 <strong>다른 사실</strong>입니다.
                  </p>
                )}

                <ul className="mt-2 max-h-code overflow-auto rounded-control border border-ui-line">
                  {repos.data.repos.map((one) => (
                    <li key={one.nameWithOwner} className="border-b border-ui-line last:border-b-0">
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 px-2.5 py-2 text-left hover:bg-ui-surface-sunken"
                        onClick={() => {
                          /* ⛔ 고르는 것은 **주소를 칸에 넣는 것까지**다. 바로 받아 오지 않는다 —
                             한 번의 실수 클릭이 5분짜리 내려받기가 되면 안 된다. */
                          setUrl(one.url);
                          /* ⛔ 저장소가 바뀌면 앞 저장소의 가지를 들고 있지 않는다. */
                          setBranch('');
                          setBranches(null);
                        }}
                      >
                        <span className="font-mono text-xs">{one.nameWithOwner}</span>
                        <span className={HELP_TEXT}>
                          {one.visibility}
                          {one.isFork ? ' · 포크' : ''}
                          {one.isArchived ? ' · 보관됨' : ''}
                          {one.description === '' ? '' : ` · ${one.description}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className={HELP_TEXT}>
                  ⛔ 고르면 <strong>아래 칸에 주소가 들어갈 뿐</strong>입니다 — 바로 받아 오지
                  않습니다. 받아 오는 것은 당신이 버튼을 눌러야 시작합니다.
                </p>
              </div>
            )}

            <TextField
              id="intake-url"
              label="깃 주소"
              sub="필수"
              mono
              value={url}
              placeholder="https://github.com/사용자/저장소.git"
              help="⛔ 토큰이 박힌 주소는 서버가 거절합니다 — 그 값이 인자가 되어 셸 히스토리·프로세스 목록·서버 로그에 남기 때문입니다. 인증은 이 기계의 git 이 합니다."
              onChange={setUrl}
            />
            {/* ── 가지 ── 주소가 정해져야 물어볼 수 있다. */}
            <div className="mb-3">
              <TextField
                id="intake-branch"
                label="가지"
                sub="선택 — 비우면 원격의 기본 가지"
                mono
                value={branch}
                placeholder="main · refactor-… · universe-trial"
                help="⚠️ 비워 두면 git 이 **원격의 기본 가지**를 받습니다 — ⛔ 우주가 고른 것이 아닙니다. 잴 대상이 작업 가지에 있으면 여기서 골라야 **그 코드를 잽니다.**"
                onChange={setBranch}
              />
              <ActionButton disabled={url.trim() === '' || askingBranches || busy} onClick={askBranches}>
                {askingBranches ? '물어보는 중…' : '이 주소의 가지 목록'}
              </ActionButton>

              {branches !== null && !branches.ok && (
                <Banner tone="unknown">
                  <strong>⚪ 가지를 못 쟀다 — 「가지가 없다」가 아니다.</strong>
                  <div className="mt-1.5 whitespace-pre-wrap">{branches.say}</div>
                </Banner>
              )}

              {branches !== null && branches.ok && (
                <>
                  <p className={`mt-1.5 ${HELP_TEXT}`}>
                    가지 <strong>{branches.branches.length}개</strong> — 눌러서 고르세요.
                    {branches.branches.length > 40 && ' ⚠️ 많습니다. 위 칸에 직접 쳐도 됩니다.'}
                  </p>
                  <div className="mt-1.5 grid max-h-code gap-1.5 overflow-y-auto rounded-control border border-ui-line bg-ui-surface-sunken p-1.5">
                    {branches.branches.map((one) => (
                      <button
                        key={one}
                        type="button"
                        className={`w-full rounded-control border px-3 py-2 text-left font-mono text-xs ${
                          one === branch.trim()
                            ? 'border-ui-accent bg-ui-surface-raised font-semibold'
                            : 'border-ui-line bg-ui-surface hover:border-ui-accent'
                        }`}
                        onClick={() => setBranch(one)}
                      >
                        {one}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <TextField
              id="intake-name"
              label="은하 이름"
              sub="선택 — 비우면 주소에서 딴다"
              mono
              value={name}
              placeholder="my-app"
              help="영소문자·숫자·하이픈만 됩니다. ⛔ 비워 두면 화면이 지어내지 않고 도구가 주소에서 땁니다."
              onChange={setName}
            />
            <ActionButton primary disabled={url.trim() === '' || busy} onClick={fetchRepo}>
              {busy
                ? '받아 오는 중…'
                : branch.trim() === ''
                  ? '이 주소를 받아 오기 — 기본 가지'
                  : `이 주소를 받아 오기 — ${branch.trim()}`}
            </ActionButton>
          </div>
        )}

        {/* 받아 온 결과 — ⛔ 실패도 **결과**라서 빨간 오류 박스가 아니다. */}
        {cloned !== null && (
          <div className={CARD_NEXT}>
            <h2 className={SECTION}>도구가 한 말 — 고쳐 적지 않았다</h2>

            {cloned.killed && (
              <Banner tone="unknown">
                <strong>⚪ 못 쟀다 — 시간 제한에 끊겼다.</strong>
                <div className="mt-1.5">
                  ⛔ 이것은 <strong>「받아 오지 못했다」가 아니다.</strong> 큰 저장소는 5분을 넘길 수
                  있습니다 — 끊긴 것이지 실패한 것이 아닙니다. ⛔ 없는 실패를 고치러 가지 마세요.
                </div>
              </Banner>
            )}

            {!cloned.ok && !cloned.killed && (
              <Banner tone="bad">
                <strong>⛔ 받아 오지 못했다 (종료코드 {cloned.exitCode ?? '없다'}).</strong>
                <div className="mt-1.5">
                  이것은 <strong>결과</strong>입니다 — 화면이 깨진 것이 아닙니다. 아래 도구의 말을
                  그대로 읽어 주세요.
                </div>
              </Banner>
            )}

            {cloned.ok && (
              <Banner tone="ok">
                <strong>✅ 받아 왔다.</strong>
                <div className="mt-1.5">
                  받아 온 자리: <code>{cloned.into ?? '(안 왔다)'}</code>
                </div>
                <div className="mt-1.5">
                  ⛔ 이것은 <strong>「이 저장소가 깨끗하다」가 아니다.</strong> 받아 왔을 뿐이고,
                  위반이 몇 건인지는 <strong>들인 뒤 다시 재야</strong> 압니다.
                </div>
              </Banner>
            )}

            <pre className={SAY}>{cloned.say === '' ? '(도구가 아무 말도 안 했다)' : cloned.say}</pre>
          </div>
        )}

        {/* ── ② 초안 확인 ──────────────────────────────────────────── */}
        {step === 'draft' && (
          <div className={CARD_NEXT}>
            <h2 className={SECTION}>② 좌표 초안 — 사람이 채울 자리가 남아 있다</h2>
            {cloned === null || cloned.draft === null ? (
              <Banner tone="unknown">
                <strong>⚪ 아직 초안이 없다.</strong>
                <div className="mt-1.5">
                  ①에서 저장소를 먼저 받아 오세요. ⛔ 여기 아무것도 없는 것은{' '}
                  <strong>「채울 것이 없다」가 아니다</strong> — 아직 안 만든 것입니다.
                </div>
              </Banner>
            ) : (
              <>
                <p className="text-label">
                  초안: <code className={CODE}>{cloned.draft}</code>
                </p>
                <Banner tone="warn">
                  <strong>⚠️ 초안에는 「TODO:」 가 남아 있다 — 사람이 채운다.</strong>
                  <div className="mt-1.5">
                    도구가 못 읽은 자리를 <code>TODO:</code> 로 남깁니다. ⛔{' '}
                    <strong>화면이 대신 채우지 않습니다</strong> — 짐작으로 채우면 초안이 완성본
                    행세를 하고, 관문은 엉뚱한 것을 재게 됩니다.
                  </div>
                  <div className="mt-1.5">
                    ⛔ 특히 <strong>태양계(별이 사는 폴더)는 사람이 고릅니다</strong> — 도구는
                    후보만 냅니다.
                  </div>
                </Banner>

                {/**
                  * ⚠️⚠️ **여기에 「파일을 열어 채우세요」가 적혀 있었다.**
                  * 받아 오기까지 화면으로 와 놓고 **마지막 한 칸에서 파일 편집기로 내보냈다** —
                  * 터미널을 안 여는 사람에게는 거기서 끝이다. ⛔ 화면이 정본이라는 전제가
                  * 그 한 줄에서 깨져 있었다. ⇒ 채우는 칸을 여기 낸다.
                  */}
                {blanks === null && (
                  <p className={HELP_TEXT}>
                    ⚪ 빈칸 목록을 아직 못 읽었습니다 — <strong>「채울 것이 없다」가 아닙니다.</strong>{' '}
                    초안 파일은 위 자리에 있습니다.
                  </p>
                )}

                {blanks !== null && blanks.length === 0 && (
                  <Banner tone="ok">
                    <strong>✅ 채울 자리가 없다 — 초안이 다 찼다.</strong>
                    <div className="mt-1.5">③으로 가서 은하로 들이세요.</div>
                  </Banner>
                )}

                {blanks !== null && blanks.length > 0 && (
                  <>
                    {blanks.map((where) => (
                      <TextField
                        key={where}
                        id={`blank-${where}`}
                        label={where}
                        sub="⛔ TODO — 도구가 못 읽은 자리"
                        mono
                        value={filled[where] ?? ''}
                        placeholder="여기는 사람만 안다"
                        onChange={(next) => setFilled({ ...filled, [where]: next })}
                      />
                    ))}

                    <ActionButton
                      primary
                      disabled={writing || blanks.some((w) => (filled[w] ?? '').trim() === '')}
                      onClick={() => {
                        if (cloned?.draft === null || cloned?.draft === undefined) return;
                        setWriting(true);
                        setWriteNote(null);
                        void writeGalaxyCoordinates(cloned.draft, filled).then(
                          (done) => {
                            setWriting(false);
                            setBlanks(done.remaining);
                            setWriteNote(
                              done.remaining.length === 0
                                ? `✅ 좌표에 적었다 — ${done.filled.length}곳. 남은 자리 0곳이다.`
                                : `✅ ${done.filled.length}곳을 적었다 — ⚠️ 아직 ${done.remaining.length}곳 남았다.`,
                            );
                          },
                          (failed: Error) => {
                            setWriting(false);
                            /* ⛔ 실패를 삼키지 않는다 — 서버가 쓴 문장 그대로 보여 준다. */
                            setWriteNote(`⛔ 못 적었다 — ${failed.message}`);
                          },
                        );
                      }}
                    >
                      {writing ? '적는 중…' : '좌표에 적기'}
                    </ActionButton>

                    {blanks.some((w) => (filled[w] ?? '').trim() === '') && (
                      <span className={`mt-1.5 ${HELP_TEXT}`}>
                        {blanks.filter((w) => (filled[w] ?? '').trim() === '').length}곳이 비어 있어 아직
                        적을 수 없습니다. ⛔ 건너뛰는 길은 만들지 않았습니다 — 비워 둔 좌표는 관문이{' '}
                        <strong>엉뚱한 것을 재게</strong> 합니다.
                      </span>
                    )}
                    {writeNote !== null && (
                      <span className={`mt-1.5 ${HELP_TEXT}`}>{writeNote}</span>
                    )}
                  </>
                )}

                <p className={HELP_TEXT}>
                  ⛔ 「TODO 를 무시하고 들이기」 갈래는 없습니다. 넘길 수 있는 관문은 넘겨집니다.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── ③ 들이기 ────────────────────────────────────────────── */}
        {step === 'adopt' && (
          <div className={CARD_NEXT}>
            <h2 className={SECTION}>③ 은하로 들인다 — 들이는 규율은 도구가 안다</h2>
            {cloned === null || cloned.draft === null ? (
              <Banner tone="unknown">
                <strong>⚪ 들일 초안이 없다.</strong>
                <div className="mt-1.5">
                  ①에서 저장소를 먼저 받아 오세요. ⛔ 이것은 <strong>「들일 것이 없다」가 아니라</strong>{' '}
                  아직 앞 칸을 안 밟은 것입니다.
                </div>
              </Banner>
            ) : (
              <>
                <p className="text-label">
                  들일 초안: <code className={CODE}>{cloned.draft}</code>
                </p>
                <p className={`mb-3.5 mt-1.5 ${HELP_TEXT}`}>
                  ⛔ 은하 이름은 <strong>도구가 초안에서 읽습니다</strong> — 화면이 정하지 않습니다.
                </p>
                <ActionButton primary disabled={busy} onClick={() => adoptDraft(cloned.draft ?? '')}>
                  {busy ? '들이는 중…' : '이 초안을 은하로 들이기'}
                </ActionButton>
              </>
            )}

            {adopted !== null && (
              <>
                {adopted.killed && (
                  <Banner tone="unknown">
                    <strong>⚪ 못 쟀다 — 시간 제한에 끊겼다.</strong>
                    <div className="mt-1.5">
                      ⛔ <strong>「못 들였다」가 아니다.</strong> 들어갔는지 아닌지 지금 화면은
                      모릅니다 — 왼쪽 레일의 「은하」에서 확인하세요.
                    </div>
                  </Banner>
                )}

                {/**
                  * ⛔⛔ 여기가 제일 오해받기 쉬운 자리다 — **실패가 아니라 결과**다.
                  *
                  * ⚠️ **표가 `bad`(빨강) 가 아니라 `warn`(호박) 인 것이 의도다.** 위의 「받아 오지
                  * 못했다」와 다른 색을 쓴다:
                  *   · 받아 오기 실패 = git 이 128 로 끝났다 — **잰 ❌**(그런 저장소가 없다).
                  *   · 들이기 `ok:false` = 「`TODO:` 가 7곳 남았다」 — **아직 할 일이 남은 것**이다.
                  * 이 저장소에는 이미 같은 자리가 있다: `BlankCounter` 가 「사람이 채울 자리 N곳」을
                  * `warn` 으로 그린다. 같은 뜻에 같은 색을 써야 사람이 한 번만 배운다.
                  * ⛔ 빨강으로 그리면 「내가 뭘 깨뜨렸나」로 읽히고, 사람은 **없는 버그**를 찾으러 간다.
                  */}
                {!adopted.ok && !adopted.killed && (
                  <Banner tone="warn">
                    <strong>⛔ 아직 들이지 못했다 — 초안에 남은 것이 있다.</strong>
                    <div className="mt-1.5">
                      이것은 <strong>오류가 아니라 결과</strong>입니다. 「<code>TODO:</code> 가 몇 곳
                      남았다」·「이미 있는 은하다」 같은 것이고, 고칠 것은 코드가 아니라{' '}
                      <strong>초안</strong>입니다.
                    </div>
                    <div className="mt-1.5">
                      ⛔ <strong>화면이 대신 채우지 않습니다.</strong> 아래 도구의 말이 어디를 채워야
                      하는지 말해 줍니다.
                    </div>
                  </Banner>
                )}

                {adopted.ok && (
                  <Banner tone="ok">
                    <strong>✅ 좌표를 두었다 · 목록에 올렸다.</strong>
                    <div className="mt-1.5">
                      {listed ?? '목록을 다시 부르는 중…'}
                    </div>
                    <div className="mt-1.5">
                      ⛔ 이것은 <strong>「이 은하가 깨끗하다」가 아니다.</strong> 들였을 뿐이고,
                      위반이 몇 건인지는 <strong>다시 재야</strong> 압니다 — 왼쪽 레일의 「위반」에서.
                    </div>
                  </Banner>
                )}

                <pre className={SAY}>{adopted.say === '' ? '(도구가 아무 말도 안 했다)' : adopted.say}</pre>
              </>
            )}
          </div>
        )}
      </ContentPane>
    </ConsoleShell>
  );
}
