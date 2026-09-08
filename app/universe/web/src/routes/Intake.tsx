import { useState } from 'react';

import { getGalaxies, postAdopt, postClone } from '@api/client';
import type { IAdoptResult, ICloneResult } from '@api/types';

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
  /** 비워 두면 도구가 주소에서 이름을 딴다 — ⛔ 화면이 지어내지 않는다. */
  const [name, setName] = useState('');

  const [cloned, setCloned] = useState<ICloneResult | null>(null);
  const [adopted, setAdopted] = useState<IAdoptResult | null>(null);
  /** 요청의 모양이 틀렸거나(400) 서버가 도구를 못 불렀을 때(500)만 여기 담긴다. */
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<IntakeStep>('clone');

  /** 들인 뒤 **다시 물어본** 결과. ⛔ 도구의 말이 아니라 목록이 낸 답이다. */
  const [listed, setListed] = useState<string | null>(null);

  const fetchRepo = (): void => {
    setBusy(true);
    setRefused(null);
    setAdopted(null);
    setListed(null);
    /* ⛔ 묻는 순간 앞의 결과를 지운다 — 남겨 두면 그것이 지금 상태로 읽힌다. */
    setCloned(null);
    void postClone(url.trim(), name.trim() === '' ? undefined : name.trim()).then(
      (came) => {
        setBusy(false);
        setCloned(came);
        /* 받아 왔고 초안까지 나왔을 때만 다음 칸으로 옮긴다. ⛔ 실패를 넘겨 보내지 않는다. */
        setStep(came.ok && came.draft !== null ? 'draft' : 'clone');
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
              {busy ? '받아 오는 중…' : '이 주소를 받아 오기'}
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
                  <div className="mt-1.5">
                    파일을 열어 채운 뒤 ③으로 가세요. 남아 있으면 ③이{' '}
                    <strong>몇 곳이 남았는지 말해 줍니다</strong>.
                  </div>
                </Banner>
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
