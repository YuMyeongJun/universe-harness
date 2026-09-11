/**
 * 클라이언트·라벨 층 시험.
 *
 * ⚠️ **네트워크를 타지 않는다.** 실행기를 가짜로 주입한다 —
 *    망에 기대는 시험은 실패했을 때 「코드가 틀렸나 망이 끊겼나」를 구별하지 못한다.
 */
import { describe, expect, it } from 'vitest';

import { parseTicket } from '../src/lint/parse.js';
import { GitHubClient, type Executor, type IExecResult } from '../src/github/client.js';
import { UnmeasuredError } from '../src/github/guards.js';
import { ensureLabels, labelsFor, lintLabelFor } from '../src/github/labels.js';

const ok = (stdout: string): IExecResult => ({ status: 0, stdout, stderr: '' });
const fail = (stderr: string): IExecResult => ({ status: 1, stdout: '', stderr });

/** 호출을 기록하는 가짜 실행기 */
const fakeExec = (
  handler: (command: string, args: string[]) => IExecResult,
): { exec: Executor; calls: Array<{ command: string; args: string[] }> } => {
  const calls: Array<{ command: string; args: string[] }> = [];
  return {
    calls,
    exec: (command, args) => {
      calls.push({ command, args });
      return handler(command, args);
    },
  };
};

describe('GitHubClient — 좌표', () => {
  it('origin 에서 좌표를 파생한다', () => {
    const { exec } = fakeExec(() => ok('git@github.com:owner/repo.git\n'));
    expect(new GitHubClient({ exec }).coordinate()?.repo).toBe('repo');
  });

  it('origin 이 없으면 null — 지어내지 않는다', () => {
    const { exec } = fakeExec(() => fail('no origin'));
    expect(new GitHubClient({ exec }).coordinate()).toBeNull();
  });
});

describe('GitHubClient — 스코프', () => {
  it('헤더에서 스코프를 읽는다', () => {
    const { exec } = fakeExec(() => ok('HTTP/2 200\nX-Oauth-Scopes: gist, project, repo\n\n{}'));
    expect(new GitHubClient({ exec }).scopes()).toEqual(['gist', 'project', 'repo']);
  });

  it('헤더가 없으면 못 쟀다 — 빈 배열로 흘리지 않는다', () => {
    // 빈 배열로 돌려주면 "스코프가 없다"로 읽혀 엉뚱한 곳에서 실패한다
    const { exec } = fakeExec(() => ok('HTTP/2 200\n\n{}'));
    expect(() => new GitHubClient({ exec }).scopes()).toThrow(UnmeasuredError);
  });

  it('조회 자체가 실패해도 못 쟀다', () => {
    const { exec } = fakeExec(() => fail('network down'));
    expect(() => new GitHubClient({ exec }).scopes()).toThrow(UnmeasuredError);
  });
});

describe('GitHubClient — 읽기', () => {
  it('JSON 이 아니면 던진다 — 성공처럼 보여도 잰 것이 없다', () => {
    const { exec } = fakeExec(() => ok('<html>rate limited</html>'));
    expect(() => new GitHubClient({ exec }).read('목록', ['/x'])).toThrow(/JSON 이 아니다/);
  });

  it('정상 JSON 은 파싱해서 준다', () => {
    const { exec } = fakeExec(() => ok('[{"name":"a"}]'));
    expect(new GitHubClient({ exec }).read<Array<{ name: string }>>('목록', ['/x'])).toEqual([
      { name: 'a' },
    ]);
  });
});

describe('GitHubClient — dryRun', () => {
  it('쓰기를 하지 않고 **무엇을 하려 했는지** 남긴다', () => {
    // 조용히 아무것도 안 한 것과 구별되어야 한다
    const { exec, calls } = fakeExec(() => ok('{}'));
    const client = new GitHubClient({ exec, dryRun: true });
    client.write('라벨 생성', 'POST', '/repos/o/r/labels', { name: 'x' });
    expect(calls).toEqual([]); // 실제 호출 0건
    expect(client.planned).toEqual([
      { method: 'POST', path: '/repos/o/r/labels', body: { name: 'x' } },
    ]);
  });
});

describe('labelsFor — 티켓 축을 라벨로', () => {
  const ticket = parseTicket(
    'x.md',
    [
      '## 🏷️ [QA-TC] a > b > c : d',
      '### 💬 6. Review & Metadata',
      '- **요구사항 ID:** `REQ-101,REQ-102`',
      '- **유형:** `오류`',
      '- **우선순위:** `High`',
      '- **테스트 타입:** R',
      '- **자동화 대상 여부:** `Y`',
    ].join('\n'),
  );

  it('복수 요구사항 ID 를 각각 라벨로 — 커버리지 역매핑의 축이다', () => {
    expect(labelsFor(ticket)).toContain('req:REQ-101');
    expect(labelsFor(ticket)).toContain('req:REQ-102');
  });

  it('유형·우선순위·자동화·리뷰를 각각 축으로 둔다', () => {
    expect(labelsFor(ticket)).toEqual(
      expect.arrayContaining(['tc:type/오류', 'tc:priority/High', 'tc:auto/Y', 'tc:review/R']),
    );
  });

  it('값이 없으면 라벨도 없다 — 지어내지 않는다', () => {
    const bare = parseTicket('y.md', '## 🏷️ [QA-TC] a\n### 💬 6. Review & Metadata\n');
    expect(labelsFor(bare)).toEqual([]);
  });

  it('사전에 없는 값은 라벨로 만들지 않는다', () => {
    const odd = parseTicket('z.md', '### 💬 6. Review & Metadata\n- **유형:** `이상한값`\n');
    expect(labelsFor(odd)).toEqual([]);
  });
});

describe('lintLabelFor — ⚪ 는 통과와 다른 라벨이다', () => {
  it('위반이 있으면 fail', () => {
    expect(lintLabelFor([{ rule: 'r', severity: 'error', message: '', why: '' }])).toBe('lint:fail');
  });

  it('⚪ 만 있으면 pass 가 아니라 unmeasured', () => {
    // 섞으면 통과율이 거짓이 된다
    expect(lintLabelFor([{ rule: 'r', severity: 'unmeasured', message: '', why: '' }])).toBe(
      'lint:unmeasured',
    );
  });

  it('아무것도 없으면 pass', () => {
    expect(lintLabelFor([])).toBe('lint:pass');
  });
});

describe('ensureLabels — 쓰고 나서 다시 읽어 확인한다', () => {
  it('없는 라벨만 만든다', () => {
    const created: string[] = [];
    const { exec } = fakeExec((_c, args) => {
      if (args.includes('-X')) {
        const body = args.find((a) => a.startsWith('--stdin='))?.slice(8) ?? '{}';
        created.push((JSON.parse(body) as { name: string }).name);
        return ok('{}');
      }
      return ok(JSON.stringify([{ name: 'tc:type/오류' }, ...created.map((n) => ({ name: n }))]));
    });
    const client = new GitHubClient({ exec });
    const result = ensureLabels(client, 'o', 'r', ['tc:type/오류', 'req:REQ-1']);
    expect(result.created).toEqual(['req:REQ-1']);
    expect(result.existing).toEqual(['tc:type/오류']);
  });

  it('만들었다는데 재조회에 없으면 던진다 — 쓰기 성공은 쓰기 확인이 아니다', () => {
    // 부분 성공 + 0 종료. 여기서 안 막으면 조용히 지나간다.
    const { exec } = fakeExec((_c, args) => (args.includes('-X') ? ok('{}') : ok('[]')));
    expect(() => ensureLabels(new GitHubClient({ exec }), 'o', 'r', ['req:REQ-1'])).toThrow(
      /재조회에서 확인되지 않았다/,
    );
  });

  it('dryRun 이면 만들지 않고 계획만 남긴다', () => {
    const { exec } = fakeExec(() => ok('[]'));
    const client = new GitHubClient({ exec, dryRun: true });
    const result = ensureLabels(client, 'o', 'r', ['req:REQ-1']);
    expect(result.created).toEqual(['req:REQ-1']);
    expect(client.planned).toHaveLength(1);
  });

  it('요구 라벨이 0개면 아무것도 하지 않는다', () => {
    const { exec, calls } = fakeExec(() => ok('[]'));
    ensureLabels(new GitHubClient({ exec }), 'o', 'r', []);
    expect(calls).toEqual([]);
  });
});
