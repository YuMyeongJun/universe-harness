import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDomains, getHealth, makeGalaxyDraft, writeGalaxyCoordinates, type IHealth } from '@api/client';
import { FILL_LABEL, type IDomainSummary, type IGalaxyDraftResult } from '@api/types';
import { BlankCounter } from '@components/data-display/BlankCounter';
import { CandidateNote } from '@components/data-display/CandidateNote';
import { CommandList } from '@components/data-display/CommandList';
import { ToolEcho } from '@components/data-display/ToolEcho';
import { ActionButton } from '@components/form-controls/ActionButton';
import { TextField } from '@components/form-controls/TextField';
import { Banner, Empty, HELP_TEXT, PageHead, Pill, Shell, SUB } from '@components/ui';

const kb = (n: number): string => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

/** 목록 한 줄 — 본문(1fr)과 배지(auto). 줄 전체가 링크라 `<a>` 에 직접 그린다. */
const DOMAIN_ROW = [
  'grid grid-cols-entry items-center gap-3.5',
  'w-full rounded-card border border-ui-line bg-ui-surface px-4 py-3.5',
  'text-left text-inherit no-underline hover:border-ui-accent',
].join(' ');

const CARD = 'rounded-card border border-ui-line bg-ui-surface p-4';
const CARD_NEXT = 'mt-3.5 rounded-card border border-ui-line bg-ui-surface p-4';
const SECTION = 'mb-3.5 mt-0 text-label font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
const CODE = 'rounded-chip bg-ui-surface-sunken px-1.25 py-px font-mono text-xs';

/**
 * S1 · **잴 저장소 고르기** — 무엇을 잴 것인지 여기서 정한다.
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
export function DomainSelect() {
  const [domains, setDomains] = useState<IDomainSummary[] | null>(null);
  const [health, setHealth] = useState<IHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [repoDir, setRepoDir] = useState('');
  const [galaxyName, setGalaxyName] = useState('');
  const [drafted, setDrafted] = useState<IGalaxyDraftResult | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void getHealth().then(setHealth, () => undefined);
    void getDomains().then(
      (loaded) => setDomains(loaded.domains),
      (failed: Error) => setError(failed.message),
    );
  }, []);

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
    <Shell>
      <PageHead
        eyebrow="우주 콘솔"
        title="잴 저장소 고르기"
        sub="로컬 폴더를 지정하면 서버가 그 저장소를 읽어 좌표 초안을 만듭니다. 초안은 초안입니다 — 도구가 못 읽은 자리는 사람이 채웁니다."
      />

      <p className={`mb-4.5 ${HELP_TEXT}`}>
        <Link to="/">← 우주가 아는 은하</Link> · <Link to="/violations">위반 목록과 처방 보기 →</Link>{' '}
        — 무엇이 위반인지, 무엇을 고쳐야 하는지. 건수는 언제나{' '}
        <strong>훑은 파일 수와 함께</strong> 나온다.
      </p>

      {/**
       * ⛔⛔ **이 화면의 「도메인」은 은하가 아니다.** 없으면 다음 사람이 그걸 은하로 안다.
       *
       * 아래 「이미 실측 중인 도메인」 목록은 `/api/domains` 가 **형제 폴더의 남의 저장소**
       * (`qa-workflow-v2-main`)에서 읽어 온 것이고, 우주의 은하 명부
       * (`universe.config.json` · `galaxies/` · `galaxies.local/`)와는 **아무 관계가 없다.**
       * 실제로 이 화면이 첫 화면이던 동안 **우주가 아는 은하 5개가 화면에 아예 안 떴다.**
       */}
      <Banner tone="warn">
        <strong>⚠️ 여기 「도메인」은 우주의 은하가 아니다.</strong>
        <div className="mt-1.5">
          아래 목록은 <strong>형제 폴더의 남의 저장소</strong>(<code>qa-workflow-v2-main</code>)에서
          읽어 온 도메인 지식 문서다 — <code>universe.config.json</code> 과 <code>galaxies/</code> 가
          아는 <strong>은하와는 아무 관계가 없다.</strong> 우주가 아는 은하는{' '}
          <Link to="/">첫 화면</Link>에 있다.
        </div>
        <div className="mt-1.5">
          ⛔ 이 화면을 <strong>없애지 않았다</strong> — 도메인 지식 수집이 여기로 들어간다. 다만
          이 줄이 없으면 다음 사람이 <strong>이것을 은하로 읽는다.</strong>
        </div>
      </Banner>

      <div className={CARD}>
        <TextField
          id="repo-dir"
          label="로컬 폴더 경로"
          sub="필수"
          mono
          value={repoDir}
          placeholder="/Users/나/Documents/GitHub/내-앱"
          help="이 폴더의 package.json 을 서버가 읽습니다. ⚠️ git 저장소 주소 · gh 로그인 · AI Key 는 이 자리가 아닙니다 — 아직 로컬 폴더까지입니다."
          onChange={setRepoDir}
        />
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

      <div className="mt-8.5">
        <h2 className={SECTION}>이미 실측 중인 도메인 — 형제 저장소에서 읽어 온 것</h2>

        {error && (
          <Banner tone="bad">
            <strong>지식 저장소를 찾지 못했습니다.</strong>
            <div className="mt-1.5 whitespace-pre-wrap">{error}</div>
          </Banner>
        )}

        {health && health.ok && (
          <p className={`mt-1 text-meta ${SUB}`}>
            지식 저장소: <code className={CODE}>{health.workflowRoot}</code>
          </p>
        )}

        {domains === null && !error && <Empty>불러오는 중…</Empty>}

        <div className="grid gap-2.5">
          {(domains ?? []).map((summary) => (
            <Link key={summary.domain} to={`/d/${summary.domain}`} className={DOMAIN_ROW}>
              <span>
                <span className="block font-semibold">
                  {summary.title}{' '}
                  <span className="font-normal text-ui-ink-faint">{summary.domain}</span>
                </span>
                <span className="mt-0.5 block text-meta text-ui-ink-dim">
                  문서 {summary.docs}개 · {kb(summary.bytes)} · LNB 폴더 {summary.lnbFolders}개
                  {summary.tbdDocs > 0 && ` · 미작성 표시 ${summary.tbdDocs}건`}
                </span>
              </span>
              <Pill tone={summary.fill}>{FILL_LABEL[summary.fill]}</Pill>
            </Link>
          ))}
        </div>
      </div>
    </Shell>
  );
}
