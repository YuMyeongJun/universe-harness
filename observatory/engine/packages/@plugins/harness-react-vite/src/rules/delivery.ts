/**
 * 레인: delivery — **S3 + CloudFront 정적 배포**.
 *
 * 공통 계약 패키지가 아니라 여기 있는 이유: 이 규칙들은 스택(객체 스토리지 + CDN)에 매여 있다.
 * Vercel/Netlify 로 배포하는 프로젝트에 얹으면 전부 오탐이 된다.
 *
 * 근거는 전부 실측이다 — 이 저장소 워크플로에 실제로 있던 모양이다.
 */
import type { IStaticRule } from '@core/fe-agent-harness';
import { isWorkflow, patternRule } from '@core/fe-agent-contracts';

export const DELIVERY_RULES: IStaticRule[] = [
  patternRule({
    id: 'delivery/asset-cache',
    lane: 'delivery',
    applies: isWorkflow,
    pattern: /aws\s+s3\s+sync\s+\S+\s+s3:\/\/\S+(?![^\n]*assets)[^\n]*--cache-control\s+"no-cache"/,
    fix: '해시가 붙은 `assets/*` 까지 `no-cache` 로 올리면 CDN 이 무의미해진다. 2단 sync 로 나눠라 — `assets/*` 는 `max-age=31536000,immutable`, `index.html` 만 `no-cache`.',
  }),
  patternRule({
    id: 'delivery/no-cache-header',
    lane: 'delivery',
    applies: isWorkflow,
    pattern: /aws\s+s3\s+sync\s+\S+\s+s3:\/\/(?![^\n]*--cache-control)[^\n]*$/m,
    fix: '`--cache-control` 이 아예 없다 — 엣지 기본 TTL 을 타므로 index.html 이 낡은 채 남고, `--delete` 가 지운 청크를 가리켜 흰 화면이 된다. index 와 자산의 수명을 명시적으로 갈라라.',
  }),
  patternRule({
    id: 'delivery/sync-order',
    lane: 'delivery',
    applies: isWorkflow,
    pattern: /aws\s+s3\s+sync\s+\S+\s+s3:\/\/\S+[^\n]*--delete/,
    fix: '`--delete` 는 낡은 해시 청크를 지운다. assets 를 먼저 올리고 index.html 을 **마지막에** 올려라. 안 그러면 새 index 가 아직 없는 청크를 가리키는 창이 열린다.',
  }),
  patternRule({
    id: 'delivery/invalidate-scope',
    lane: 'delivery',
    applies: isWorkflow,
    pattern: /PATH_TO_INVALIDATE:\s*\/\*/,
    fix: '`/*` 전면 무효화는 해시 자산까지 버린다(요금·오리진 부하). `index.html` 만 무효화하면 충분하다 — 나머지는 이름이 바뀌므로 캐시가 저절로 갈린다.',
  }),
];
