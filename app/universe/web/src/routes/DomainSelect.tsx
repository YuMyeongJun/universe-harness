import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDomains, getHealth, type IHealth } from '../api/client';
import { Banner, Empty, PageHead } from '../components/ui';
import { FILL_LABEL, type IDomainSummary } from '../api/types';

const kb = (n: number): string => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

/**
 * S1 · 도메인 고르기 — 어디가 비었는지 **한눈에 보이게** 한다.
 * 목록은 작은 것부터(=덜 채워진 것부터) 오므로 할 일이 위에 온다.
 */
export function DomainSelect() {
  const [domains, setDomains] = useState<IDomainSummary[] | null>(null);
  const [health, setHealth] = useState<IHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getHealth().then(setHealth, () => undefined);
    void getDomains().then(
      (r) => setDomains(r.domains),
      (e: Error) => setError(e.message),
    );
  }, []);

  return (
    <div className="wrap">
      <PageHead
        eyebrow="지식 실측 콘솔"
        title="도메인 고르기"
        sub="제품을 직접 열어 화면 구조를 재고, 사람이 확인한 것만 지식 문서로 냅니다."
      />

      {error && (
        <Banner tone="bad">
          <strong>지식 저장소를 찾지 못했습니다.</strong>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{error}</div>
        </Banner>
      )}

      {health && health.ok && (
        <p className="sub" style={{ fontSize: 12.5 }}>
          지식 저장소: <code>{health.workflowRoot}</code>
        </p>
      )}

      {domains === null && !error && <Empty>불러오는 중…</Empty>}

      <div className="dlist">
        {(domains ?? []).map((d) => (
          <Link key={d.domain} to={`/d/${d.domain}`} className="drow">
            <span>
              <span className="drow__name">
                {d.title} <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>{d.domain}</span>
              </span>
              <span className="drow__meta">
                문서 {d.docs}개 · {kb(d.bytes)} · LNB 폴더 {d.lnbFolders}개
                {d.tbdDocs > 0 && ` · 미작성 표시 ${d.tbdDocs}건`}
              </span>
            </span>
            <span className={`pill pill--${d.fill}`}>{FILL_LABEL[d.fill]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
