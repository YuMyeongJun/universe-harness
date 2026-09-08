import { useState } from 'react';

import { makeGalaxyDraft, writeGalaxyCoordinates } from '@api/client';
import type { IGalaxyDraftResult } from '@api/types';
import { BlankCounter } from '@components/data-display/BlankCounter';
import { CandidateNote } from '@components/data-display/CandidateNote';
import { CommandList } from '@components/data-display/CommandList';
import { ToolEcho } from '@components/data-display/ToolEcho';
import { ActionButton } from '@components/form-controls/ActionButton';
import { FolderPicker } from '@components/form-controls/FolderPicker';
import { TextField } from '@components/form-controls/TextField';
import { ConsoleShell } from '@components/layout/ConsoleShell';
import { Banner, CARD, CARD_NEXT, CODE, ContentPane, HELP_TEXT, PageHead, SECTION } from '@components/ui';


/**
 * S1 · **잴 저장소 고르기** — 무엇을 잴 것인지 여기서 정한다.
 *
 * ── ⭐ 이 파일은 `DomainSelect.tsx` 였다 ──────────────────
 * 한 파일 안에 **두 개가 섞여** 있었다: 우주 자신의 「잴 저장소 고르기」와,
 * **형제 폴더의 남의 저장소**(`qa-workflow-v2-main`)에서 읽어 온 「도메인」 목록.
 * 화면 제목은 전부터 「잴 저장소 고르기」였는데 **왼쪽 사이드바와 아래 절반이 남의 것**이었고,
 * 그 사실을 배너 하나가 겨우 붙들고 있었다(⚠️ 여기 「도메인」은 우주의 은하가 아니다).
 * ⇒ 남의 것을 걷어내고 이름을 실제 하는 일에 맞췄다. **사이드바가 사라진 것**도 그래서다 —
 *   거기 있던 것이 전부 도메인 목록이었고, ⛔ **빈 사이드바를 그리지 않는다**
 *   (`ConsoleShell` 의 규율: 빈 칸은 「여기 뭔가 있어야 하는데 없다」로 읽힌다).
 *
 * 로컬 폴더를 받아 서버가 `bin/galaxy.mjs` 를 돌리고, 화면은 그 **좌표 초안**을 보여 준다.
 *
 * ⛔⛔ 이 화면이 하지 않는 것 — 넷 다 「초안이 완성본 행세를 하는」 같은 사고다:
 *   1. **짐작해서 채우지 않는다.** 도구의 `TODO:` 는 눈에 띄게 보여 주고, **개수는 도구가 센 것**을 그대로 옮긴다.
 *   2. **태양계를 대신 고르지 않는다.** 후보만 보여 주고 사람이 고른다(관측 법칙 §9).
 *   3. **없는 명령을 있는 것처럼 보이지 않는다.** 없으면 「없다 — 그 축은 안 재진다」고 적는다.
 *   4. **「무시하고 계속」·「이번만 건너뛰기」가 없다.** 넘길 수 있는 관문은 넘겨진다.
 *
 * ⚠️ git 저장소 주소 · gh 로그인 · AI Key 는 **이번 조각이 아니다**(로컬 폴더까지다).
 * 만들지 않았다 — 만들면 재지 않은 것이 늘어난다.
 */
export function RepoSelect() {
  const [repoDir, setRepoDir] = useState('');
  const [galaxyName, setGalaxyName] = useState('');
  const [drafted, setDrafted] = useState<IGalaxyDraftResult | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const blanks = drafted?.todos.at ?? [];
  const typed = blanks.filter((where) => (filled[where] ?? '').trim() !== '').length;
  const canDraft = repoDir.trim() !== '' && galaxyName.trim() !== '' && busy === null;

  const askForDraft = (): void => {
    setBusy('draft');
    setDraftError(null);
    setWriteNote(null);
    void makeGalaxyDraft(galaxyName.trim(), repoDir.trim()).then(
      (made) => {
        setDrafted(made);
        setFilled({});
        setBusy(null);
      },
      (failed: Error) => {
        /* ⛔ 실패했는데 이전 초안을 남겨 두지 않는다 — 남기면 그것이 이 폴더의 초안인 줄 안다. */
        setDrafted(null);
        setDraftError(failed.message);
        setBusy(null);
      },
    );
  };

  const askToWrite = (): void => {
    if (drafted === null || drafted.id === null) { return; }
    setBusy('write');
    setWriteNote(null);
    void writeGalaxyCoordinates(drafted.id, filled).then(
      (done) => {
        setWriteNote(`✅ 좌표에 적었다 — ${done.written}`);
        setBusy(null);
      },
      (failed: Error) => {
        setWriteNote(`⚪ 아직 화면에서 못 적는다 — ${failed.message}`);
        setBusy(null);
      },
    );
  };

  return (
    <ConsoleShell>
      <ContentPane>
      <PageHead
        eyebrow="우주 콘솔"
        title="잴 저장소 고르기"
        sub="로컬 폴더를 지정하면 서버가 그 저장소를 읽어 좌표 초안을 만듭니다. 초안은 초안입니다 — 도구가 못 읽은 자리는 사람이 채웁니다."
      />

      {/**
        * ⚠️⚠️ **전에는 여기가 경로를 손으로 치는 칸이었다.**
        * 「/Users/나/Documents/GitHub/내-앱」을 예시로 띄워 놓고 사람이 받아쓰게 했는데,
        * 그건 **터미널에서 `pwd` 를 칠 줄 아는 사람만** 밟을 수 있는 칸이다 —
        * 이 콘솔의 전제(「화면이 정본이다」)와 정면으로 어긋난다.
        * ⇒ 서버가 훑고 사람이 **고른다.** 브라우저 폴더 선택기를 못 쓰는 이유는
        *   `FolderPicker` 머리말에 있다(절대 경로를 안 준다 — 규격이다).
        */}
      <div className={CARD}>
        <FolderPicker value={repoDir} onPick={setRepoDir} />
        <TextField
          id="galaxy-name"
          label="은하 이름"
          sub="좌표 파일 이름이 됩니다"
          value={galaxyName}
          placeholder="my-app"
          help="이 이름이 그대로 파일 경로가 되므로, 우주 밖으로 새지 않게 서버가 한 번 더 검사합니다."
          onChange={setGalaxyName}
        />
        <ActionButton primary disabled={!canDraft} onClick={askForDraft}>
          {busy === 'draft' ? '읽는 중…' : '이 저장소를 읽어 좌표 초안 만들기'}
        </ActionButton>
      </div>

      {draftError && (
        <Banner tone="bad">
          <strong>❌ 요청이 거절됐습니다 — 초안을 못 만들었습니다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{draftError}</div>
          <div className="mt-1.5">
            ⛔ 화면은 대신 그럴듯한 초안을 그리지 않습니다 —{' '}
            <strong>못 만든 것은 못 만든 것</strong>입니다.
          </div>
        </Banner>
      )}

      {drafted && (
        <div className="mt-5">
          {/* ⛔ 서버가 박아 준 한 줄을 **고쳐 적지 않는다** — 「초안」이라는 말이 여기서 사라지면 안 된다. */}
          <Banner tone={drafted.complete ? 'ok' : 'warn'}>{drafted.summary}</Banner>

          {drafted.unmeasured !== null && (
            <Banner tone="warn">
              <strong>⚪ 못 쟀다 — 도구가 한 말 그대로입니다.</strong>
              <div className="mt-1.5 whitespace-pre-wrap">{drafted.unmeasured}</div>
            </Banner>
          )}

          {drafted.drafted && (
            <BlankCounter todos={drafted.todos} complete={drafted.complete} typed={typed} />
          )}

          {drafted.candidates && (
            <div className={CARD}>
              <h2 className={SECTION}>읽어낸 실행 명령어</h2>
              <CommandList
                commands={drafted.candidates.commands}
                missing={drafted.candidates.missingCommands}
              />
            </div>
          )}

          {drafted.candidates && (
            <div className={CARD_NEXT}>
              <h2 className={SECTION}>도구가 보여만 준 후보 — 사람이 고른다</h2>
              <CandidateNote
                label="태양계 후보"
                candidates={drafted.candidates.solarSystems}
                raw={drafted.candidates.solarSystemsRaw}
              />
              <CandidateNote label="워크스페이스 후보" candidates={drafted.candidates.workspaces} />
            </div>
          )}

          {blanks.length > 0 && (
            <div className={CARD_NEXT}>
              <h2 className={SECTION}>사람이 채울 자리 — 도구가 못 읽었다</h2>
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

              <ActionButton primary disabled={busy !== null || typed < blanks.length} onClick={askToWrite}>
                {busy === 'write' ? '적는 중…' : '좌표에 적기'}
              </ActionButton>

              {typed < blanks.length && (
                <span className={`mt-1.5 ${HELP_TEXT}`}>
                  {blanks.length - typed}곳이 비어 있어 아직 적을 수 없습니다. ⛔ 건너뛰는 길은
                  만들지 않았습니다 — 비워 둔 좌표는 관문이 <strong>엉뚱한 것을 재게</strong> 합니다.
                </span>
              )}
              {writeNote && <span className={`mt-1.5 ${HELP_TEXT}`}>{writeNote}</span>}
              {drafted.tool.out !== null && (
                <span className={`mt-1.5 ${HELP_TEXT}`}>
                  초안 파일: <code className={CODE}>{drafted.tool.out}</code> — 커밋되지 않는
                  자리입니다. 화면에서 못 적는 동안은 이 파일을 열어 <code className={CODE}>TODO:</code>{' '}
                  를 채우면 됩니다.
                </span>
              )}
            </div>
          )}

          <div className={CARD_NEXT}>
            <h2 className={SECTION}>도구가 한 말 그대로</h2>
            <ToolEcho
              command={drafted.tool.command}
              exitCode={drafted.tool.exitCode}
              stdout={drafted.tool.stdout}
              stderr={drafted.tool.stderr}
            />
          </div>
        </div>
      )}

      </ContentPane>
    </ConsoleShell>
  );
}
