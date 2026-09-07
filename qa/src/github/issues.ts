/**
 * TC 티켓 ↔ GitHub Issue.
 *
 * 본문은 티켓 마크다운 **그대로**다. 사람이 그냥 읽을 수 있어야 하고,
 * 되읽어 로컬 파일로 돌릴 수 있어야 한다.
 *
 * 짝은 **숨은 마커**로 짓는다 — 제목이 바뀌어도 같은 티켓임을 잃지 않는다.
 */
import { lintTicket } from '../lint/rules.js';
import { parseTicket, type IParsedTicket } from '../lint/parse.js';
import type { IFinding } from '../lint/core.js';
import type { GitHubClient } from './client.js';
import { assertQueryMeasured, assertWriteVerified } from './guards.js';
import { labelsFor, lintLabelFor } from './labels.js';
import { assertNoSecrets } from './secrets.js';

/** 티켓 파일 경로로 짝을 짓는다. 제목이 바뀌어도 흔들리지 않는다. */
export const markerFor = (sourcePath: string): string => `<!-- tc-source: ${sourcePath} -->`;

const MARKER_RE = /<!--\s*tc-source:\s*(.+?)\s*-->/;

export const sourceOf = (body: string): string | undefined => MARKER_RE.exec(body)?.[1];

export const titleOf = (ticket: IParsedTicket, fallback: string): string => {
  const raw = ticket.title.replace(/^[^\]]*\]\s*/, '').trim(); // `🏷️ [QA-TC] ` 접두 제거
  return raw === '' ? fallback : raw;
};

export const bodyOf = (sourcePath: string, source: string): string =>
  `${markerFor(sourcePath)}\n\n${source.trimEnd()}\n`;

export interface IIssue {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
}

export type SyncAction = 'create' | 'update' | 'unchanged';

export interface ISyncPlan {
  sourcePath: string;
  action: SyncAction;
  issueNumber?: number;
  title: string;
  labels: string[];
  findings: IFinding[];
}

/**
 * 무엇을 할지 **정한다**. 여기서는 아무것도 쓰지 않는다.
 *
 * ⛔ 린트를 통과하지 못한 티켓은 올리지 않는다 — 형식이 깨진 것을 원격에 쌓으면
 *    되돌리는 비용이 크고, 그 사이 누군가 그것을 근거로 삼는다.
 */
export const planSync = (
  sourcePath: string,
  source: string,
  existing: readonly IIssue[],
): ISyncPlan => {
  // 원격에 올리기 전에 막는다. 한 번 올라가면 이슈 편집 이력과 알림 메일에 남는다.
  assertNoSecrets(sourcePath, source);

  const ticket = parseTicket(sourcePath, source);
  const findings = lintTicket(ticket);
  const labels = [...labelsFor(ticket), lintLabelFor(findings)];
  const title = titleOf(ticket, sourcePath);
  const body = bodyOf(sourcePath, source);

  const hit = existing.find((issue) => sourceOf(issue.body ?? '') === sourcePath);
  if (hit === undefined) return { sourcePath, action: 'create', title, labels, findings };

  const sameBody = (hit.body ?? '').trim() === body.trim();
  const sameTitle = hit.title === title;
  const sameLabels =
    hit.labels.map((l) => l.name).sort().join('|') === [...labels].sort().join('|');

  return {
    sourcePath,
    action: sameBody && sameTitle && sameLabels ? 'unchanged' : 'update',
    issueNumber: hit.number,
    title,
    labels,
    findings,
  };
};

/** 원격의 TC 이슈 전부. **페이지를 끝까지** 읽는다. */
export const fetchTicketIssues = (client: GitHubClient, owner: string, repo: string): IIssue[] => {
  const issues = client.readAllPages<IIssue>(
    'TC 이슈 목록',
    `/repos/${owner}/${repo}/issues?state=all`,
  );
  // 처음 동기화하면 0건이 정상이다 — 의도를 적는다
  assertQueryMeasured('TC 이슈 목록', issues.length, { expectEmpty: true });
  return issues.filter((issue) => sourceOf(issue.body ?? '') !== undefined);
};

/** 계획을 **실행한다**. dryRun 이면 쓰지 않고 계획만 남는다. */
export const applySync = (
  client: GitHubClient,
  owner: string,
  repo: string,
  plan: ISyncPlan,
  source: string,
): void => {
  if (plan.action === 'unchanged') return;

  const body = bodyOf(plan.sourcePath, source);
  const payload = { title: plan.title, body, labels: plan.labels };

  if (plan.action === 'create') {
    client.write('이슈 생성', 'POST', `/repos/${owner}/${repo}/issues`, payload);
  } else {
    client.write('이슈 갱신', 'PATCH', `/repos/${owner}/${repo}/issues/${plan.issueNumber}`, payload);
  }

  if (client.dryRun) return;

  // 쓰기 성공은 쓰기 확인이 아니다 — 다시 읽어 마커로 확인한다
  const after = fetchTicketIssues(client, owner, repo);
  assertWriteVerified(
    plan.action === 'create' ? '이슈 생성' : '이슈 갱신',
    [plan.sourcePath],
    after.map((issue) => sourceOf(issue.body ?? '') ?? ''),
  );
};
