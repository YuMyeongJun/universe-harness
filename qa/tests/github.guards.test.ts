/**
 * 원격 계층 가드 변이 시험.
 *
 * 여기 있는 것은 전부 **에러 없이 조용히 통과하던 자리**다.
 * 던지지 않는 가드는 없는 가드이므로, 각 가드가 실제로 던지는지 본다.
 */
import { describe, expect, it } from 'vitest';

import {
  assertLabelsExist,
  assertNotRateLimited,
  assertPaginationExhausted,
  assertQueryMeasured,
  assertScopeOrUnmeasured,
  assertWriteVerified,
  repoCoordinateOf,
  requireRepoCoordinate,
  UnmeasuredError,
} from '../src/github/guards.js';

describe('assertQueryMeasured', () => {
  it('200 + 빈 결과를 "없음"으로 세지 않는다', () => {
    expect(() => assertQueryMeasured('TC 조회', 0)).toThrow(/"없음"이 아니라/);
  });

  it('결과가 있으면 통과한다', () => {
    expect(assertQueryMeasured('TC 조회', 12)).toBe(12);
  });

  it('없는 것이 정상이면 의도를 적어야 통과한다', () => {
    // 의도를 적지 않으면 못 지나간다 — 그게 요점이다
    expect(() => assertQueryMeasured('중복 검사', 0)).toThrow();
    expect(assertQueryMeasured('중복 검사', 0, { expectEmpty: true })).toBe(0);
  });
});

describe('assertLabelsExist', () => {
  it('라벨이 사라졌으면 던진다 — 빈 결과로 통과하는 자리다', () => {
    expect(() => assertLabelsExist(['tc:type/오류', 'req:REQ-1'], ['tc:type/오류'])).toThrow(
      /라벨이 없다: req:REQ-1/,
    );
  });

  it('전부 있으면 통과한다', () => {
    expect(() => assertLabelsExist(['a'], ['a', 'b'])).not.toThrow();
  });
});

describe('assertPaginationExhausted', () => {
  it('페이지가 남았는데 멈추면 던진다', () => {
    expect(() => assertPaginationExhausted('이슈 목록', { hasNextPage: true })).toThrow(/페이지가 남았는데/);
  });

  it('끝까지 갔으면 통과한다', () => {
    expect(() => assertPaginationExhausted('이슈 목록', { hasNextPage: false })).not.toThrow();
  });
});

describe('assertWriteVerified', () => {
  it('일부만 반영됐으면 던진다 — 부분 성공 + 0 종료가 제일 위험하다', () => {
    expect(() => assertWriteVerified('이슈 생성', ['a', 'b', 'c'], ['a', 'c'])).toThrow(
      /3건 중 1건이 재조회에서 확인되지 않았다/,
    );
  });

  it('전부 확인되면 통과한다', () => {
    expect(() => assertWriteVerified('이슈 생성', ['a', 'b'], ['b', 'a', 'z'])).not.toThrow();
  });

  it('실패 목록이 길면 잘라서 보여주되 총수는 정확히 말한다', () => {
    const written = Array.from({ length: 30 }, (_, i) => `id-${i}`);
    expect(() => assertWriteVerified('대량 생성', written, [])).toThrow(/30건 중 30건이/);
  });
});

describe('assertNotRateLimited', () => {
  it('rate limit 은 성공도 실패도 아닌 ⚪ 다', () => {
    let caught: unknown;
    try {
      assertNotRateLimited('조회', { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnmeasuredError);
  });

  it('429 + retry-after 도 잡는다', () => {
    expect(() => assertNotRateLimited('조회', { status: 429, headers: { 'retry-after': '60' } })).toThrow(
      UnmeasuredError,
    );
  });

  it('권한 없음(403 인데 남은 호출이 있음)은 rate limit 이 아니다', () => {
    // 이걸 rate limit 으로 오인하면 진짜 권한 문제가 ⚪ 로 묻힌다
    expect(() =>
      assertNotRateLimited('조회', { status: 403, headers: { 'x-ratelimit-remaining': '4999' } }),
    ).not.toThrow();
  });
});

describe('assertScopeOrUnmeasured', () => {
  it('스코프가 없으면 조용히 건너뛰지 않고 ⚪ 로 던진다', () => {
    expect(() => assertScopeOrUnmeasured('project', ['repo', 'workflow'])).toThrow(UnmeasuredError);
  });

  it('있으면 통과한다', () => {
    expect(() => assertScopeOrUnmeasured('project', ['repo', 'project'])).not.toThrow();
  });
});

describe('repoCoordinateOf — origin 에서 파생한다', () => {
  it('HTTPS 를 읽는다', () => {
    expect(repoCoordinateOf('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
      wikiRemote: 'https://github.com/owner/repo.wiki.git',
    });
  });

  it('SSH 짧은 형식은 null 이 아니다 — 아는 호스트의 다른 표기다', () => {
    expect(repoCoordinateOf('git@github.com:owner/repo.git')?.repo).toBe('repo');
  });

  it('.git 없는 주소도 읽는다', () => {
    expect(repoCoordinateOf('https://github.com/owner/repo')?.owner).toBe('owner');
  });

  it('origin 이 없으면 null', () => {
    expect(repoCoordinateOf('')).toBeNull();
  });

  it('GitHub Enterprise 는 null — 확인 안 한 규칙을 맞다고 가정하지 않는다', () => {
    expect(repoCoordinateOf('https://github.mycompany.com/owner/repo.git')).toBeNull();
  });

  it('owner/repo 를 못 읽으면 null', () => {
    expect(repoCoordinateOf('https://github.com/owner')).toBeNull();
  });

  it('github.com 이 아닌 호스트는 null', () => {
    expect(repoCoordinateOf('https://gitlab.com/owner/repo.git')).toBeNull();
  });

  it('호스트 이름이 github.com 으로 끝나기만 하는 것은 안 속는다', () => {
    // notgithub.com 은 github.com 이 아니다
    expect(repoCoordinateOf('https://notgithub.com/owner/repo.git')).toBeNull();
  });
});

describe('requireRepoCoordinate — 쓰기 직전이면 실패다', () => {
  it('좌표를 못 세우면 던진다 — 어디에 쓸지 모르는데 쓰지 않는다', () => {
    expect(() => requireRepoCoordinate('https://github.mycompany.com/o/r.git')).toThrow(/지어내지 않는다/);
  });

  it('세울 수 있으면 준다', () => {
    expect(requireRepoCoordinate('git@github.com:o/r.git').wikiRemote).toBe(
      'https://github.com/o/r.wiki.git',
    );
  });
});

describe('실제 origin 으로 확인', () => {
  it('이 저장소의 origin 에서 좌표가 나온다', async () => {
    const { execFileSync } = await import('node:child_process');
    const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const coordinate = repoCoordinateOf(origin);
    expect(coordinate, `origin 에서 좌표를 못 세웠다: ${origin}`).not.toBeNull();
    /**
     * ⛔ **저장소 이름을 여기 박지 않는다.** 예전엔 `toBe('qa-harness')` 였고,
     * 이 도구가 `universe-harness` 로 흡수되자 **깨졌다.** 이 시험이 재려는 것은
     * 「origin **문자열에서 좌표를 세울 수 있는가**」이지 그 저장소가 무엇이냐가 아니다.
     * ⚠️ 그리고 그 실패는 **며칠 숨어 있었다** — 흡수하면서 이 시험을 관문에 안 걸었기 때문이다
     * (지금은 `universe check` 의 「TC 도구 시험」이 돌린다).
     * ⇒ **origin 에서 읽어서** 대조한다. 이사해도 안 깨지고, 파서가 죽으면 여전히 문다.
     */
    const expected = /[/:]([^/]+?)(?:\.git)?$/.exec(origin)?.[1];
    expect(expected, `origin 에서 저장소 이름을 못 뽑았다: ${origin}`).toBeTruthy();
    expect(coordinate?.repo).toBe(expected);
  });
});
