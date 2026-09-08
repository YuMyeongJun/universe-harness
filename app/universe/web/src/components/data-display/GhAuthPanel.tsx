import { useEffect, useRef, useState } from 'react';

import { cancelGhLogin, getGh, startGhLogin } from '@api/client';
import type { IGhLoginState, IGhStatus } from '@api/types';
import { ActionButton } from '@components/form-controls/ActionButton';
import { Banner, CARD, CODE, HELP_TEXT, SECTION } from '@components/ui';

/**
 * **깃 로그인** — 안 돼 있으면 여기서 시킨다.
 *
 * ## ⛔⛔ 이 칸은 `bin/repos.mjs` 의 규율 하나를 **일부러 뒤집은 결과**다
 *
 * 그 도구는 이렇게 적어 두었다 — *「`gh auth login` 을 이 도구가 실행하지 않는다. 로그인은
 * 사람이 한다. 도구가 대신 로그인 화면을 띄우면, 사람은 **자기가 어느 계정으로 들어갔는지
 * 모른 채** 진행한다.」*
 *
 * ⇒ **금지는 뒤집혔지만 이유는 안 뒤집혔다.** 그래서 이 칸은 계정을 **못 놓치게** 그린다:
 *
 *  ① 로그인 **전에도** 지금 계정을 크게 적는다(안 돼 있으면 「안 돼 있다」를 크게).
 *  ② 끝난 **뒤에** 계정을 다시 적고, ⚠️ **바뀌었으면 바뀌었다고** 전/후를 함께 적는다.
 *  ③ ⛔ 스코프를 함께 적는다 — `repo` 가 없으면 **비공개 저장소가 통째로 안 보이는데**,
 *     그건 「저장소가 없다」로 보인다(§8 의 그 사고).
 *
 * ⚠️ 이것이 특히 중요한 때가 곧 온다: **개인 계정과 회사 조직 계정이 둘 다 있는 상태.**
 *    그때 「로그인됨」만 떠 있으면 남의 계정으로 레포를 받아 온다.
 *
 * ## ⛔ 이 칸이 하지 않는 것
 *
 *  · **토큰 칸을 두지 않는다.** 토큰을 화면으로 받으면 그 값이 로그·히스토리에 남는다.
 *  · **어느 계정으로 들어갈지 안 고른다.** 브라우저에서 사람이 고르고, 화면은 결과를 읽는다.
 *  · **일회용 코드를 가리지 않는다.** 그건 토큰이 아니고, 가리면 로그인을 못 끝낸다.
 */
const POLL_MS = 2000;

export function GhAuthPanel() {
  const [gh, setGh] = useState<IGhStatus | null>(null);
  const [login, setLogin] = useState<IGhLoginState>({ stage: 'idle' });
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const reread = (): void => {
    void getGh().then((status) => { setGh(status); setLogin(status.login); }, () => undefined);
  };

  useEffect(() => {
    reread();
    return () => { if (timer.current !== null) window.clearInterval(timer.current); };
  }, []);

  /** 기다리는 동안만 물어본다. ⛔ 늘 도는 폴링을 두지 않는다 — 아무도 안 보는 부하다. */
  useEffect(() => {
    if (login.stage !== 'waiting') {
      if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; }
      return;
    }
    timer.current = window.setInterval(reread, POLL_MS);
    return () => { if (timer.current !== null) window.clearInterval(timer.current); };
  }, [login.stage]);

  const start = (): void => {
    setBusy(true);
    void startGhLogin().then(
      (state) => { setLogin(state); setBusy(false); },
      (failed: Error) => { setLogin({ stage: 'failed', why: failed.message, say: '⚪ 못 쟀다 — 시작하지 못했다.' }); setBusy(false); },
    );
  };

  const stop = (): void => {
    void cancelGhLogin().then((state) => { setLogin(state); reread(); }, () => undefined);
  };

  if (gh === null) return null;

  return (
    <div className={CARD}>
      <h2 className={SECTION}>깃 로그인</h2>

      {!gh.installed && (
        <Banner tone="unknown">
          <strong>⚪ 못 쟀다 — 이 기계에 <code className={CODE}>gh</code>(GitHub CLI)가 없다.</strong>
          <div className="mt-1.5">
            <code className={CODE}>brew install gh</code> 로 깔고 나서 다시 열어라.
            ⛔ 화면이 대신 깔지 않는다 — 도구를 설치하는 것은 이 콘솔의 일이 아니다.
          </div>
        </Banner>
      )}

      {gh.installed && gh.loggedIn && login.stage !== 'waiting' && (
        <Banner tone="ok">
          {/* ⭐ **계정 이름이 제일 크다.** 「됐다」가 아니라 「누구로 됐다」가 이 칸의 답이다. */}
          <strong>✅ 로그인돼 있다 — 계정 {gh.account}</strong>
          <div className="mt-1.5">
            프로토콜 {gh.protocol ?? '모름'} · 스코프{' '}
            {gh.scopes.length === 0 ? '⚪ 못 읽었다' : gh.scopes.map((s) => <code key={s} className={`${CODE} mr-1`}>{s}</code>)}
          </div>
          {!gh.scopes.includes('repo') && (
            <div className="mt-1.5">
              ⚠️ 스코프에 <code className={CODE}>repo</code> 가 <strong>없다</strong> — 비공개 저장소는
              목록에 <strong>아예 안 온다.</strong> ⛔ 그건 「저장소가 없다」가 아니라 <strong>못 본 것</strong>이다.
            </div>
          )}
        </Banner>
      )}

      {gh.installed && !gh.loggedIn && login.stage !== 'waiting' && (
        <Banner tone="warn">
          <strong>⚠️ 로그인이 안 돼 있다.</strong>
          <div className="mt-1.5">
            받아 오기·레포 목록은 이 기계의 <code className={CODE}>gh</code> 가 아는 계정으로 돕니다.
          </div>
        </Banner>
      )}

      {login.stage === 'waiting' && (
        <Banner tone="warn">
          <strong>🔑 브라우저에서 끝내라 — 일회용 코드</strong>
          <div className="mt-1.5 text-title font-mono font-semibold tracking-eyebrow">{login.code}</div>
          <div className="mt-1.5">
            <a href={login.url} target="_blank" rel="noreferrer" className="underline">{login.url}</a>
            {' '}를 열고 위 코드를 넣으세요.
          </div>
          <div className="mt-1.5">
            지금 계정: <strong>{login.before ?? '없음'}</strong> —{' '}
            ⚠️ <strong>다른 계정으로 들어가면 그것이 이 기계의 계정이 됩니다.</strong>
          </div>
        </Banner>
      )}

      {login.stage === 'done' && (
        <Banner tone={login.switched ? 'warn' : 'ok'}>
          <strong>{login.say}</strong>
          {login.switched && (
            <div className="mt-1.5">
              ⛔ 이 줄을 그냥 넘기지 마세요 — <strong>{login.before} → {login.after}</strong> 로 바뀌었습니다.
              이후의 받아 오기·레포 목록은 <strong>{login.after}</strong> 가 보는 것만 나옵니다.
            </div>
          )}
        </Banner>
      )}

      {login.stage === 'failed' && (
        <Banner tone="unknown">
          <strong>{login.say}</strong>
          {login.why !== '' && <div className="mt-1.5 whitespace-pre-wrap text-xs">{login.why}</div>}
          <div className="mt-1.5">
            ⛔ 화면은 <strong>안 끝난 것을 끝난 것으로 접지 않습니다.</strong> 다시 시작하거나,
            터미널에서 <code className={CODE}>gh auth login</code> 을 직접 하세요.
          </div>
        </Banner>
      )}

      <div className="mt-2.5 flex gap-2.5">
        {login.stage !== 'waiting' && gh.installed && (
          <ActionButton primary={!gh.loggedIn} disabled={busy} onClick={start}>
            {busy ? '시작하는 중…' : gh.loggedIn ? '다른 계정으로 로그인' : '로그인하기'}
          </ActionButton>
        )}
        {login.stage === 'waiting' && <ActionButton onClick={stop}>그만두기</ActionButton>}
        <ActionButton disabled={busy} onClick={reread}>다시 읽기</ActionButton>
      </div>

      <span className={`mt-1.5 ${HELP_TEXT}`}>
        ⛔ 토큰을 화면에서 받지 않습니다 — 인증은 <code className={CODE}>gh</code> 가 합니다.
      </span>
    </div>
  );
}
