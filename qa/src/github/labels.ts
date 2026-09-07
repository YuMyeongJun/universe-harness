/**
 * 라벨 체계 — TC 티켓의 축을 GitHub 라벨로 옮긴다.
 *
 * 라벨이 **쿼리의 축**이므로, 사라지면 그 축으로 거는 조회가 조용히 빈 결과를 준다.
 * 그래서 쓰기 전에 존재를 보증하고, 보증한 뒤 **다시 읽어 확인**한다.
 */
import type { IFinding } from '../lint/core.js';
import type { IParsedTicket } from '../lint/parse.js';
import type { GitHubClient } from './client.js';
import { assertLabelsExist, assertQueryMeasured, assertWriteVerified } from './guards.js';

export interface ILabel {
  name: string;
  description: string;
}

/** 티켓 메타데이터에서 라벨을 뽑는다. 값이 없으면 라벨도 없다 — 지어내지 않는다. */
const metaOf = (ticket: IParsedTicket, ...keywords: string[]): string | undefined => {
  for (const [label, value] of ticket.metadata) {
    if (keywords.every((k) => label.includes(k))) return value.replace(/`/g, '').trim();
  }
  return undefined;
};

const TYPE_VALUES = ['정상', '경계', '오류', '상태전이'] as const;
const PRIORITY_VALUES = ['High', 'Medium', 'Low'] as const;

/**
 * 이 티켓에 붙을 라벨 이름들.
 *
 * ⚠️ 요구사항 ID 는 **복수 매핑**이다(`REQ-1,REQ-2`). 커버리지 역매핑이 이 라벨로 선다.
 */
export const labelsFor = (ticket: IParsedTicket): string[] => {
  const out: string[] = [];

  const type = metaOf(ticket, '유형');
  if (type !== undefined && (TYPE_VALUES as readonly string[]).includes(type)) {
    out.push(`tc:type/${type}`);
  }

  const priority = metaOf(ticket, '우선순위');
  if (priority !== undefined && (PRIORITY_VALUES as readonly string[]).includes(priority)) {
    out.push(`tc:priority/${priority}`);
  }

  const automated = metaOf(ticket, '자동화');
  if (automated === 'Y' || automated === 'N') out.push(`tc:auto/${automated}`);

  const review = metaOf(ticket, '테스트', '타입');
  if (review === 'R' || review === 'E') out.push(`tc:review/${review}`);

  const requirements = metaOf(ticket, '요구사항');
  if (requirements !== undefined && requirements !== '') {
    for (const id of requirements.split(/[,\s]+/).filter((s) => s !== '')) {
      out.push(`req:${id}`);
    }
  }

  return out;
};

/** 린트 결과를 라벨로. ⚪ 는 통과와 **다른 라벨**이다 — 섞이면 통과율이 거짓이 된다. */
export const lintLabelFor = (findings: IFinding[]): string => {
  if (findings.some((f) => f.severity === 'error')) return 'lint:fail';
  if (findings.some((f) => f.severity === 'unmeasured')) return 'lint:unmeasured';
  return 'lint:pass';
};

const DESCRIPTIONS: Record<string, string> = {
  'tc:type': 'TC 유형 (우선순위와 별개 축)',
  'tc:priority': '우선순위',
  'tc:auto': '자동화 대상 여부',
  'tc:review': '테스트 타입 (R=회귀 / E=경계)',
  req: '요구사항 ID — 커버리지 역매핑의 축',
  lint: '형식 관문 결과 (unmeasured 는 통과가 아니다)',
};

const describe = (name: string): string => {
  const prefix = name.includes('/') ? name.slice(0, name.indexOf('/')) : name.split(':')[0];
  return DESCRIPTIONS[prefix ?? ''] ?? DESCRIPTIONS[name.split(':')[0] ?? ''] ?? 'QA 하네스';
};

interface IRemoteLabel {
  name: string;
}

/**
 * 라벨을 보증한다 — 없으면 만들고, **만든 뒤 다시 읽어 확인**한다.
 *
 * ⚠️ 만들기 응답이 200 이어도 확인이 아니다. 부분 성공 + 0 종료가 제일 위험하다.
 */
export const ensureLabels = (
  client: GitHubClient,
  owner: string,
  repo: string,
  required: readonly string[],
): { created: string[]; existing: string[] } => {
  if (required.length === 0) return { created: [], existing: [] };

  const listPath = `/repos/${owner}/${repo}/labels?per_page=100`;
  const before = client.read<IRemoteLabel[]>('라벨 목록', [listPath]);
  // ⚠️ 0건이 정상일 수 있다(새 저장소) — 그래서 여기서는 expectEmpty 로 의도를 적는다.
  assertQueryMeasured('라벨 목록', before.length, { expectEmpty: true });

  const have = new Set(before.map((l) => l.name));
  const missing = required.filter((name) => !have.has(name));

  for (const name of missing) {
    client.write('라벨 생성', 'POST', `/repos/${owner}/${repo}/labels`, {
      name,
      description: describe(name),
    });
  }

  if (client.dryRun) return { created: missing, existing: required.filter((n) => have.has(n)) };

  // 쓰기 성공은 쓰기 확인이 아니다 — 다시 읽는다
  const after = client.read<IRemoteLabel[]>('라벨 재조회', [listPath]);
  assertWriteVerified(
    '라벨 생성',
    missing,
    after.map((l) => l.name),
  );
  // 그리고 쿼리가 기대는 라벨이 **전부** 있는지 본다. 없으면 조회가 빈 결과로 통과한다.
  assertLabelsExist([...required], after.map((l) => l.name));

  return { created: missing, existing: required.filter((n) => have.has(n)) };
};
