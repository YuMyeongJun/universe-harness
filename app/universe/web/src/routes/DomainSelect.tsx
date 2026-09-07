import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDomains, getHealth, type IHealth } from '@api/client';
import { FILL_LABEL, type IDomainSummary } from '@api/types';
import { Banner, Empty, PageHead, Pill, Shell, SUB } from '@components/ui';

const kb = (n: number): string => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

/** 목록 한 줄 — 본문(1fr)과 배지(auto). 줄 전체가 링크라 `<a>` 에 직접 그린다. */
const DOMAIN_ROW = [
  'grid grid-cols-entry items-center gap-3.5',
  'w-full rounded-card border border-ui-line bg-ui-surface px-4 py-3.5',
  'text-left text-inherit no-underline hover:border-ui-accent',
].join(' ');

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
    <Shell>
      <PageHead
        eyebrow="지식 실측 콘솔"
        title="도메인 고르기"
        sub="제품을 직접 열어 화면 구조를 재고, 사람이 확인한 것만 지식 문서로 냅니다."
      />

      {error && (
        <Banner tone="bad">
          <strong>지식 저장소를 찾지 못했습니다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{error}</div>
        </Banner>
      )}

      {health && health.ok && (
        <p className={`mt-1 text-meta ${SUB}`}>
          지식 저장소: <code>{health.workflowRoot}</code>
        </p>
      )}

      {domains === null && !error && <Empty>불러오는 중…</Empty>}

      <div className="grid gap-2.5">
        {(domains ?? []).map((d) => (
          <Link key={d.domain} to={`/d/${d.domain}`} className={DOMAIN_ROW}>
            <span>
              <span className="block font-semibold">
                {d.title} <span className="font-normal text-ui-ink-faint">{d.domain}</span>
              </span>
              <span className="mt-0.5 block text-meta text-ui-ink-dim">
                문서 {d.docs}개 · {kb(d.bytes)} · LNB 폴더 {d.lnbFolders}개
                {d.tbdDocs > 0 && ` · 미작성 표시 ${d.tbdDocs}건`}
              </span>
            </span>
            <Pill tone={d.fill}>{FILL_LABEL[d.fill]}</Pill>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
