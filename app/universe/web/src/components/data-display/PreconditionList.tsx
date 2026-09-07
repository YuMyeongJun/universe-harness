import type { IPrecondition } from '@api/types';

import { Banner } from '@components/ui';

/**
 * **전제가 케이스보다 먼저다.**
 *
 * ⛔⛔ 실측(다른 팀): 로그인 세션 수명이 1시간이라 주행 중간에 죽었고, 그때 화면은
 * **로그인 페이지를 재고 「전부 fail」**을 뱉었다 — 제품 결함이 하나도 없는데도.
 * 그걸 fail 목록에 올리면 **사람이 엉뚱한 데를 판다.**
 * ⇒ 전제가 하나라도 안 서면 이 주행의 케이스는 **전부 ⚪ 다.** ❌ 가 아니다.
 *
 * ⛔ 전제가 **0개 선언된 것**도 「다 섰다」가 아니라 **못 잰 것**이다 — 아무것도 확인하지
 * 않은 주행이 측정 가능으로 보이면, 그 뒤의 숫자는 전부 뜻을 잃는다.
 */
const CARD = 'mt-3.5 rounded-card border border-ui-line bg-ui-surface p-4';
const SECTION = 'mb-3.5 mt-0 text-label font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
const ROW = 'border-b border-ui-line py-2.5 last:border-b-0';
const NAME = 'font-mono font-semibold';
const DETAIL = 'mt-1 block text-meta text-ui-ink-dim';

/** ⛔ `true` 만 「섰다」다. `null`(확인 못 했다)은 `false` 와 함께 ⚪ 로 접힌다. */
const markOf = (ok: boolean | null): string => {
  if (ok === true) { return '✅'; }
  if (ok === false) { return '❌'; }
  return '⚪';
};

const wordOf = (ok: boolean | null): string => {
  if (ok === true) { return '섰다'; }
  if (ok === false) { return '안 섰다'; }
  return '확인 못 했다 — ⚪ 「섰다」가 아니다';
};

export interface IPreconditionListProps {
  preconditions: IPrecondition[];
  measurable: boolean;
  /** 도구가 적어 온 「왜 못 재는가」. ⛔ 화면이 고쳐 적지 않는다. */
  because: string[];
}

export function PreconditionList({ preconditions, measurable, because }: IPreconditionListProps) {
  return (
    <div className={CARD}>
      <h2 className={SECTION}>전제 — 케이스보다 먼저 본다</h2>

      {!measurable && (
        <Banner tone="unknown">
          <strong>⚪ 전제가 서지 않았다 — 이 주행의 케이스는 전부 ⚪ 로 접혔다.</strong>
          {because.map((why) => (
            <div key={why} className="mt-1.5 whitespace-pre-wrap">
              └ {why}
            </div>
          ))}
          <div className="mt-1.5">
            ⛔ 아래 케이스를 <strong>❌ 로 읽지 마라.</strong> 세션이 죽어서 로그인 페이지를 잰
            주행은 <strong>제품 결함이 아니다</strong> — 그걸 fail 목록에 올리면 사람이 엉뚱한 데를 판다.
          </div>
        </Banner>
      )}

      {preconditions.length === 0 && (
        <Banner tone="unknown">
          <strong>⚪ 전제가 0개 선언됐다.</strong>
          <div className="mt-1.5">
            「전제를 안 적었다」는 <strong>「전제가 다 섰다」가 아니다.</strong> 아무것도 확인하지
            않은 주행은 잰 것이 아니다.
          </div>
        </Banner>
      )}

      {preconditions.map((one) => (
        <div key={one.id} className={ROW}>
          <span className={NAME}>
            {markOf(one.ok)} {one.id}
          </span>{' '}
          — {wordOf(one.ok)}
          {one.detail !== undefined && <span className={DETAIL}>{one.detail}</span>}
        </div>
      ))}
    </div>
  );
}
