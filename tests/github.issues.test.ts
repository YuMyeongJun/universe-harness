/**
 * 티켓 ↔ 이슈 층 시험. 네트워크를 타지 않는다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GitHubClient, type Executor, type IExecResult } from '../src/github/client.js';
import { bodyOf, fetchTicketIssues, markerFor, planSync, sourceOf, type IIssue } from '../src/github/issues.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const good = readFileSync(join(FIXTURES, 'good.md'), 'utf8');
const weak = readFileSync(join(FIXTURES, 'weak-negative.md'), 'utf8');

const ok = (stdout: string): IExecResult => ({ status: 0, stdout, stderr: '' });
const execOf = (pages: string[]): Executor => {
  let i = 0;
  return () => ok(pages[Math.min(i++, pages.length - 1)] ?? '[]');
};

/**
 * 원격 이슈 표본.
 *
 * ⚠️ 제목·라벨을 **손으로 적지 않는다.** 적으면 규칙이 바뀔 때 시험이 조용히 거짓이 된다
 *    (실제로 한 번 그렇게 어긋났다). 계획에서 가져온다.
 */
const issue = (n: number, source: string, body = good, labels?: string[]): IIssue => {
  const plan = planSync(source, body, []);
  return {
    number: n,
    title: plan.title,
    body: bodyOf(source, body),
    labels: (labels ?? plan.labels).map((name) => ({ name })),
  };
};

describe('마커로 짝을 짓는다', () => {
  it('제목이 바뀌어도 같은 티켓임을 잃지 않는다', () => {
    const existing = [{ ...issue(1, 'tickets/a.md'), title: '완전히 다른 제목' }];
    expect(planSync('tickets/a.md', good, existing).issueNumber).toBe(1);
  });

  it('마커가 없는 이슈는 TC 이슈가 아니다', () => {
    expect(sourceOf('그냥 사람이 쓴 이슈 본문')).toBeUndefined();
    expect(sourceOf(markerFor('x.md'))).toBe('x.md');
  });
});

describe('planSync — 쓰기 전에 정한다', () => {
  it('없으면 create', () => {
    expect(planSync('tickets/a.md', good, []).action).toBe('create');
  });

  it('같으면 unchanged — 바뀐 게 없는데 쓰지 않는다', () => {
    // 기대 라벨은 계획에서 가져온다. 손으로 적으면 라벨 규칙이 바뀔 때 시험이 조용히 거짓이 된다.
    expect(planSync('tickets/a.md', good, [issue(1, 'tickets/a.md')]).action).toBe('unchanged');
  });

  it('라벨이 하나라도 빠지면 unchanged 가 아니다', () => {
    // 라벨은 쿼리의 축이다. 빠진 채로 "같다"고 하면 그 축의 조회가 조용히 빈 결과를 준다.
    const expectedLabels = planSync('tickets/a.md', good, []).labels.slice(1);
    const partial = issue(1, 'tickets/a.md', good, expectedLabels);
    expect(planSync('tickets/a.md', good, [partial]).action).toBe('update');
  });

  it('본문이 다르면 update', () => {
    const stale = issue(1, 'tickets/a.md', `${good}\n추가된 줄`);
    expect(planSync('tickets/a.md', good, [stale]).action).toBe('update');
  });

  it('라벨만 달라도 update — 라벨은 쿼리의 축이다', () => {
    const withLabels = issue(1, 'tickets/a.md', good, ['tc:type/오류']);
    expect(planSync('tickets/a.md', good, [withLabels]).action).toBe('update');
  });

  it('린트 위반이 있으면 findings 에 담긴다 — 호출 쪽이 막을 수 있게', () => {
    const plan = planSync('tickets/bad.md', weak, []);
    expect(plan.findings.some((f) => f.severity === 'error')).toBe(true);
  });

  it('⚪ 는 lint:unmeasured 라벨로 — 통과와 섞지 않는다', () => {
    const authAny = readFileSync(join(FIXTURES, 'auth-any.md'), 'utf8');
    expect(planSync('tickets/c.md', authAny, []).labels).toContain('lint:unmeasured');
  });

  it('비밀정보가 있으면 계획 단계에서 막는다 — 올린 뒤에는 되돌릴 수 없다', () => {
    expect(() => planSync('tickets/x.md', `${good}\n비밀번호: hunter2`, [])).toThrow(
      /원격에 올리기 전에 막았다/,
    );
  });
});

describe('fetchTicketIssues — 페이지를 끝까지 읽는다', () => {
  it('짧은 페이지가 나오면 거기서 끝낸다', () => {
    const page1 = JSON.stringify([issue(1, 'a.md')]);
    const client = new GitHubClient({ exec: execOf([page1]) });
    expect(fetchTicketIssues(client, 'o', 'r')).toHaveLength(1);
  });

  it('마커 없는 이슈는 걸러낸다', () => {
    const mixed = JSON.stringify([issue(1, 'a.md'), { number: 2, title: 'x', body: '사람 이슈', labels: [] }]);
    const client = new GitHubClient({ exec: execOf([mixed]) });
    expect(fetchTicketIssues(client, 'o', 'r')).toHaveLength(1);
  });

  it('상한까지 가면 던진다 — 잘린 결과를 전체로 읽지 않는다', () => {
    // 항상 가득 찬 페이지를 주면 끝이 안 난다. 조용히 자르지 않고 실패해야 한다.
    const full = JSON.stringify(Array.from({ length: 100 }, (_, i) => issue(i, `t${i}.md`)));
    const client = new GitHubClient({ exec: () => ok(full) });
    expect(() => client.readAllPages('목록', '/x', { maxPages: 3 })).toThrow(/페이지가 남았는데/);
  });
});
