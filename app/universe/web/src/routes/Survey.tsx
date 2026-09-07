import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { IScanResult } from '../api/client';
import {
  applyEmit,
  closeBrowser,
  getDomains,
  getProvenance,
  getSurvey,
  openBrowser,
  previewEmit,
  putSurvey,
  resetSurvey,
  scan,
} from '../api/client';
import {
  KIND_LABEL,
  STATUS_LABEL,
  type IEmitFile,
  type IProgress,
  type ISurvey,
  type ISurveyItem,
  type ItemKind,
  type ItemStatus,
} from '../api/types';
import { Banner, Empty, Field, PageHead, Tile } from '../components/ui';

type Step = 1 | 2 | 3 | 4;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: '① 진입점' },
  { n: 2, label: '② 자동 수집' },
  { n: 3, label: '③ 사람이 교정' },
  { n: 4, label: '④ 지식 생성' },
];

const KINDS: ItemKind[] = ['lnb', 'account', 'flow', 'term', 'issue'];

export function Survey() {
  const { domain = '' } = useParams<{ domain: string }>();
  const [step, setStep] = useState<Step>(1);
  const [survey, setSurvey] = useState<ISurvey | null>(null);
  const [progress, setProgress] = useState<IProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<IScanResult['scanned'] | null>(null);
  const [files, setFiles] = useState<IEmitFile[] | null>(null);
  const [overwrite, setOverwrite] = useState<string[]>([]);
  const [written, setWritten] = useState<{ written: string[]; skipped: { path: string; why: string }[] } | null>(null);
  const [title, setTitle] = useState(domain);
  const [open, setOpenFile] = useState<string | null>(null);
  const [provNote, setProvNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void getSurvey(domain).then(
      (r) => {
        setSurvey(r.survey);
        setProgress(r.progress);
      },
      (e: Error) => setError(e.message),
    );
  }, [domain]);

  useEffect(load, [load]);

  // 문서 제목 기본값은 도메인의 **한글 이름**이다. 매번 손으로 치게 하지 않는다.
  useEffect(() => {
    void getDomains().then(
      (r) => {
        const hit = r.domains.find((d) => d.domain === domain);
        if (hit) setTitle(hit.title);
      },
      () => undefined,
    );
  }, [domain]);

  const run = async <T,>(tag: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(tag);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const save = async (patch: Partial<ISurvey>): Promise<void> => {
    const r = await run('save', () => putSurvey(domain, patch));
    if (r) {
      setSurvey(r.survey);
      setProgress(r.progress);
    }
  };

  const setItem = (id: string, patch: Partial<ISurveyItem>): void => {
    if (!survey) return;
    const items = survey.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    setSurvey({ ...survey, items });
  };

  const counts = useMemo(() => {
    const items = survey?.items ?? [];
    return {
      total: items.length,
      done: items.filter((i) => i.status === 'confirmed' || i.status === 'corrected').length,
      open: items.filter((i) => i.status === 'unmeasured').length,
      rejected: items.filter((i) => i.status === 'rejected').length,
    };
  }, [survey]);

  if (!survey) {
    return (
      <div className="wrap">
        {error ? <Banner tone="bad">{error}</Banner> : <Empty>불러오는 중…</Empty>}
        <Link to="/" className="btn btn--ghost">← 도메인 목록</Link>
      </div>
    );
  }

  const e = survey.entry;
  const entryReady = e.baseUrl.trim() !== '' || e.loginUrl.trim() !== '';

  return (
    <div className="wrap">
      <Link to="/" className="btn btn--ghost btn--sm" style={{ marginBottom: 14, display: 'inline-block' }}>
        ← 도메인 목록
      </Link>
      <PageHead
        eyebrow={`실측 · ${domain}`}
        title="도메인 지식 실측"
        sub="자동 수집은 초안일 뿐입니다. 사람이 확인한 항목만 지식 문서에 들어갑니다."
      />

      <div className="steps">
        {STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            className={`step ${step === s.n ? 'step--on' : ''}`}
            onClick={() => setStep(s.n)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <Banner tone="bad">{error}</Banner>}

      {/* ── ① 진입점 ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="card">
          <p className="sub" style={{ marginTop: 0 }}>
            <strong>자동 수집은 여기서부터 시작합니다.</strong> 주소와 로그인 방식은 제품을 아는
            사람만 알 수 있어 기계가 채울 수 없습니다.
          </p>
          <div className="grid grid--2">
            <Field label="테스트 환경 주소" sub="필수">
              <input value={e.baseUrl} placeholder="https://stg.example.com"
                onChange={(ev) => setSurvey({ ...survey, entry: { ...e, baseUrl: ev.target.value } })} />
            </Field>
            <Field label="로그인 URL">
              <input value={e.loginUrl} placeholder="https://stg.example.com/auth/login"
                onChange={(ev) => setSurvey({ ...survey, entry: { ...e, loginUrl: ev.target.value } })} />
            </Field>
            <Field label="로그인 후 첫 진입 URL">
              <input value={e.landingUrl} placeholder="/dashboard"
                onChange={(ev) => setSurvey({ ...survey, entry: { ...e, landingUrl: ev.target.value } })} />
            </Field>
            <Field label="로그인 방식" sub="SSO · OTP · 계정+비밀번호 …">
              <input value={e.loginMethod}
                onChange={(ev) => setSurvey({ ...survey, entry: { ...e, loginMethod: ev.target.value } })} />
            </Field>
            <Field label="계정 ID" sub="수집용" help="⚠️ 지식 문서에는 절대 들어가지 않습니다. 초안 파일은 커밋되지 않습니다.">
              <input value={e.accountId} autoComplete="off"
                onChange={(ev) => setSurvey({ ...survey, entry: { ...e, accountId: ev.target.value } })} />
            </Field>
            <Field label="비밀번호" sub="수집용">
              <input type="password" value={e.accountPw} autoComplete="off"
                onChange={(ev) => setSurvey({ ...survey, entry: { ...e, accountPw: ev.target.value } })} />
            </Field>
          </div>
          <Field
            label="수집 대상 빌드"
            sub="브랜치 · 커밋 · 환경"
            help="같은 날 걷어도 빌드가 다르면 화면이 다릅니다. 안 남기면 나중에 이 지식이 어느 시점 것인지 복원할 수 없습니다. 예: feature/xxx @ 41577f5a (로컬 5100)"
          >
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <input
                value={e.sourceRef}
                placeholder="브랜치 @ 커밋 (환경)"
                onChange={(ev) => setSurvey({ ...survey, entry: { ...e, sourceRef: ev.target.value } })}
              />
              <button
                type="button"
                className="btn btn--sm"
                style={{ whiteSpace: 'nowrap' }}
                disabled={busy !== null}
                onClick={() =>
                  void run('prov', () => getProvenance(domain)).then((r) => {
                    if (!r) return;
                    if (r.detected && r.ref !== null) {
                      setSurvey({ ...survey, entry: { ...e, sourceRef: r.ref } });
                      setProvNote(
                        `✅ 서버에서 확인했습니다 — pid ${r.detail?.pid} · ${r.detail?.cwd}` +
                          (r.detail?.dirty ? '\n⚠️ 미커밋 변경이 있습니다. 이 커밋의 화면이 아닙니다.' : ''),
                      );
                    } else {
                      // 못 알아냈으면 **비워 두지 않고 이유를 보여준다.** 사람이 직접 적어야 한다.
                      setProvNote(`⚠️ 기계가 알아내지 못했습니다 — ${r.reason ?? '이유 불명'}`);
                    }
                  })
                }
              >
                {busy === 'prov' ? '확인 중…' : '서버에서 확인'}
              </button>
            </div>
            {provNote && (
              <span className="field__help" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{provNote}</span>
            )}
          </Field>

          <Field
            label="자체 서명 인증서 허용"
            sub="로컬 · 스테이징"
            help="로컬 dev 서버(vite-plugin-mkcert 등)는 자체 서명이라 켜지 않으면 못 엽니다. 공개 사이트에는 켜지 마세요."
          >
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 16 }}
                checked={e.allowInsecureTls === true}
                onChange={(ev) =>
                  setSurvey({ ...survey, entry: { ...e, allowInsecureTls: ev.target.checked } })
                }
              />
              <span style={{ fontSize: 13 }}>
                TLS 오류를 무시하고 연다 {e.allowInsecureTls ? '— 켜짐' : '— 꺼짐(기본)'}
              </span>
            </label>
          </Field>

          <Field label="메모" sub="선택">
            <textarea value={e.note}
              onChange={(ev) => setSurvey({ ...survey, entry: { ...e, note: ev.target.value } })} />
          </Field>
          <div className="row">
            <button className="btn btn--primary" disabled={busy !== null}
              onClick={() => void save({ entry: survey.entry }).then(() => setStep(2))}>
              저장하고 수집으로 →
            </button>
            <span className="spacer" />
            <button className="btn btn--ghost btn--sm" disabled={busy !== null}
              onClick={() => {
                if (!confirm('이 도메인의 실측 초안을 전부 지웁니다. 계속할까요?')) return;
                void run('reset', () => resetSurvey(domain)).then((r) => {
                  if (r) { setSurvey(r.survey); setProgress(r.progress); setScanInfo(null); }
                });
              }}>
              초안 비우기
            </button>
          </div>
        </div>
      )}

      {/* ── ② 자동 수집 ─────────────────────────────────── */}
      {step === 2 && (
        <div className="card">
          {!entryReady && <Banner tone="warn">먼저 ① 진입점에서 주소를 입력하세요.</Banner>}
          <p className="sub" style={{ marginTop: 0 }}>
            브라우저가 <strong>눈앞에 열립니다.</strong> 로그인은 직접 하세요 — SSO·OTP 를 기계가
            대신하려다 실패하면 왜 실패했는지도 안 남습니다. 원하는 화면에 도착한 뒤
            「지금 화면부터 수집」을 누르면 그 화면의 메뉴를 걷습니다.
          </p>
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn" disabled={!entryReady || busy !== null}
              onClick={() => void run('open', () => openBrowser(domain))}>
              {busy === 'open' ? '여는 중…' : '① 브라우저 열기'}
            </button>
            <button className="btn btn--primary" disabled={busy !== null}
              onClick={() => void run('scan', () => scan(domain)).then((r) => {
                if (r) { setSurvey(r.survey); setProgress(r.progress); setScanInfo(r.scanned); }
              })}>
              {busy === 'scan' ? '수집 중…' : '② 지금 화면부터 수집'}
            </button>
            <span className="spacer" />
            <button className="btn btn--ghost btn--sm" disabled={busy !== null}
              onClick={() => void run('close', () => closeBrowser())}>
              브라우저 닫기
            </button>
          </div>

          {scanInfo && (
            <Banner tone={scanInfo.unmeasured ? 'warn' : 'ok'}>
              <strong>{scanInfo.title || '(제목 없음)'}</strong> — 후보 {scanInfo.found}건 중{' '}
              <strong>{scanInfo.added}건</strong> 새로 담았습니다.
              <div style={{ fontSize: 12.5, marginTop: 4 }}><code>{scanInfo.url}</code></div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>
                본문 {scanInfo.reach.textLength}자 · 입력 {scanInfo.reach.inputs}개 · 버튼{' '}
                {scanInfo.reach.buttons}개
              </div>
              {scanInfo.unmeasured ? (
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  ⚠️ <strong>못 쟀습니다.</strong> {scanInfo.unmeasured}
                  <div style={{ marginTop: 6 }}>
                    <strong>실측일을 찍지 않았습니다</strong> — 404 를 걷어 놓고 날짜를 박으면 문서가
                    거짓말을 합니다. 화면을 확인하고 다시 수집하세요.
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, marginTop: 6 }}>
                  담긴 항목은 전부 <strong>미확인</strong>입니다. ③에서 확인해야 지식이 됩니다.
                </div>
              )}
              {scanInfo.shot && (
                <img className="shot" alt="수집 시점 화면"
                  src={`/api/domains/${domain}/shots/${scanInfo.shot}`} />
              )}
            </Banner>
          )}

          <p className="field__help">
            메뉴가 여러 화면에 흩어져 있으면 <strong>화면을 옮겨 가며 여러 번 수집</strong>하세요.
            이미 담긴 항목과 이름·URL 이 같으면 다시 담지 않고, <strong>사람 판정도 보존</strong>합니다.
          </p>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn--primary" onClick={() => setStep(3)}>교정하러 가기 →</button>
          </div>
        </div>
      )}

      {/* ── ③ 교정 ──────────────────────────────────────── */}
      {step === 3 && (
        <>
          <div className="tiles">
            <Tile v={counts.total} l="수집된 항목" />
            <Tile v={counts.done} l="확인함" />
            <Tile v={counts.open} l="미확인" />
            <Tile v={counts.rejected} l="아님" />
          </div>
          {counts.open > 0 && (
            <Banner tone="warn">
              미확인 <strong>{counts.open}건</strong>. 이대로 생성하면 문서에{' '}
              <code>⚪ 아직 확인되지 않은 것</code> 으로 <strong>이름을 달고 남습니다</strong> — 조용히
              빠지지 않습니다.
            </Banner>
          )}
          <div className="card">
            {survey.items.length === 0 ? (
              <Empty>아직 항목이 없습니다. ②에서 수집하거나 아래에서 직접 추가하세요.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 96 }}>유형</th>
                    <th>이름</th>
                    <th style={{ width: 200 }}>URL</th>
                    <th>설명</th>
                    <th style={{ width: 210 }}>판정</th>
                  </tr>
                </thead>
                <tbody>
                  {survey.items.map((it) => (
                    <tr key={it.id} className={it.status === 'rejected' ? 'is-rejected' : ''}>
                      <td>
                        <select value={it.kind}
                          onChange={(ev) => setItem(it.id, { kind: ev.target.value as ItemKind })}>
                          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                        </select>
                        {it.origin === 'auto' && <span className="pill pill--auto" style={{ marginTop: 5, display: 'inline-block' }}>수집</span>}
                      </td>
                      <td>
                        <input value={it.label}
                          onChange={(ev) => setItem(it.id, { label: ev.target.value, status: it.status === 'confirmed' ? 'corrected' : it.status })} />
                      </td>
                      <td>
                        <input value={it.url} placeholder="—"
                          onChange={(ev) => setItem(it.id, { url: ev.target.value, status: it.status === 'confirmed' ? 'corrected' : it.status })} />
                      </td>
                      <td>
                        <textarea value={it.detail} rows={2}
                          onChange={(ev) => setItem(it.id, { detail: ev.target.value })} />
                      </td>
                      <td>
                        <div className="seg">
                          {(['confirmed', 'corrected', 'rejected'] as ItemStatus[]).map((s) => (
                            <button key={s} type="button"
                              className={`seg__o ${s === 'rejected' ? 'seg__o--bad' : 'seg__o--ok'} ${it.status === s ? 'seg__o--on' : ''}`}
                              onClick={() => setItem(it.id, { status: it.status === s ? 'unmeasured' : s })}>
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                        {it.status === 'unmeasured' && <div className="field__help">미확인</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn btn--sm"
                onClick={() => setSurvey({
                  ...survey,
                  items: [...survey.items, {
                    id: `human-${Date.now()}`, kind: 'lnb', label: '', url: '', detail: '',
                    origin: 'human', status: 'unmeasured',
                  }],
                })}>
                + 직접 추가
              </button>
              <span className="spacer" />
              <button className="btn btn--primary" disabled={busy !== null}
                onClick={() => void save({ items: survey.items })}>
                {busy === 'save' ? '저장 중…' : '저장'}
              </button>
              <button className="btn"
                onClick={() => void save({ items: survey.items }).then(() => setStep(4))}>
                저장하고 생성으로 →
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── ④ 생성 ──────────────────────────────────────── */}
      {step === 4 && (
        <div className="card">
          <Field label="도메인 표시 이름" sub="문서 제목에 쓰입니다" help="예: 콜브릿지">
            <input value={title} onChange={(ev) => setTitle(ev.target.value)} />
          </Field>
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn btn--primary" disabled={busy !== null}
              onClick={() => void run('preview', () => previewEmit(domain, title)).then((r) => {
                if (r) { setFiles(r.files); setWritten(null); }
              })}>
              {busy === 'preview' ? '만드는 중…' : '무엇을 쓸지 미리보기'}
            </button>
            <span className="field__help">
              미리보기는 <strong>아무것도 쓰지 않습니다.</strong>
            </span>
          </div>

          {survey.collectedAt === null && (
            <Banner tone="warn">
              아직 수집을 한 번도 안 돌렸습니다. 문서의 <strong>실측일</strong>이 <code>미실측</code> 로 나갑니다.
            </Banner>
          )}

          {files && (
            <>
              <p className="sub">
                파일 {files.length}개 · 지식 저장소에 씁니다.
                이미 작성된 문서(골격 아님)는 <strong>체크해야만</strong> 덮어씁니다.
              </p>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>덮기</th>
                    <th>경로</th>
                    <th style={{ width: 110 }}>현재</th>
                    <th style={{ width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => {
                    const needs = f.exists && !f.isStub;
                    return (
                      <tr key={f.path}>
                        <td>
                          {needs ? (
                            <input type="checkbox" style={{ width: 16 }}
                              checked={overwrite.includes(f.path)}
                              onChange={(ev) => setOverwrite(ev.target.checked
                                ? [...overwrite, f.path]
                                : overwrite.filter((p) => p !== f.path))} />
                          ) : <span className="field__help">—</span>}
                        </td>
                        <td><code style={{ fontSize: 12.5 }}>{f.path}</code></td>
                        <td>
                          <span className={`pill pill--${f.exists ? (f.isStub ? 'partial' : 'filled') : 'auto'}`}>
                            {f.exists ? (f.isStub ? '골격' : '작성됨') : '새 파일'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn--sm btn--ghost"
                            onClick={() => setOpenFile(open === f.path ? null : f.path)}>
                            {open === f.path ? '접기' : '내용'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {open && (
                <pre className="code">{files.find((f) => f.path === open)?.content}</pre>
              )}
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn btn--primary" disabled={busy !== null}
                  onClick={() => {
                    if (!confirm(`지식 저장소에 파일 ${files.length}개를 씁니다. 계속할까요?`)) return;
                    void run('emit', () => applyEmit(domain, title, overwrite)).then((r) => {
                      if (r) { setWritten(r); load(); }
                    });
                  }}>
                  {busy === 'emit' ? '쓰는 중…' : '지식 저장소에 쓰기'}
                </button>
              </div>
            </>
          )}

          {written && (
            <div style={{ marginTop: 16 }}>
              <Banner tone={written.skipped.length > 0 ? 'warn' : 'ok'}>
                <strong>{written.written.length}개 썼습니다.</strong>
                {written.skipped.length > 0 && ` ${written.skipped.length}개는 건너뛰었습니다.`}
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {written.written.map((p) => <li key={p}><code>{p}</code></li>)}
                  {written.skipped.map((s) => (
                    <li key={s.path}><code>{s.path}</code> — {s.why}</li>
                  ))}
                </ul>
              </Banner>
            </div>
          )}
        </div>
      )}

      {progress && (
        <p className="field__help" style={{ marginTop: 18 }}>
          마지막 저장 {survey.updatedAt ? new Date(survey.updatedAt).toLocaleString('ko-KR') : '—'} ·
          마지막 수집 {survey.collectedAt ? new Date(survey.collectedAt).toLocaleString('ko-KR') : '없음'}
        </p>
      )}
    </div>
  );
}
