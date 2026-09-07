/**
 * 가드 변이 시험 — 가드가 실제로 던지는지 확인한다.
 * 던지지 않는 가드는 없는 가드다.
 */
import { describe, expect, it } from 'vitest';

import { assertContrast, assertFollows, assertMeasured } from '../src/guards/measure.js';
import { createReach, type IPageLike } from '../src/guards/reach.js';
import { verifyRedFirst } from '../src/gate/redFirst.js';

const config = {
  routes: [
    { name: 'home', path: '/home' },
    { name: 'gone', path: '/gone', expect404: true },
    { name: 'wizard-step2', path: '/wizard/step2' },
    { name: 'wizard-step1', path: '/wizard/step1' },
  ],
  notFoundPatterns: [/찾을 수 없|not found/i],
  minBodyTextLength: 100,
};

const fakePage = (url: string, body: string): IPageLike => ({
  url: () => `https://app.test${url}`,
  goto: async () => undefined,
  evaluate: async <T,>() => body as unknown as T,
});

const LONG = 'ㄱ'.repeat(300);

describe('assertMeasured', () => {
  it('0개면 던진다 — 0개는 "위반 없음"이 아니다', () => {
    expect(() => assertMeasured('행', 0)).toThrow(/0개는 "위반 없음"이 아니라/);
  });
  it('1개 이상이면 통과한다', () => {
    expect(assertMeasured('행', 3)).toBe(3);
  });
});

describe('assertFollows', () => {
  it('값이 다르면 던진다', () => {
    expect(() => assertFollows('높이', { measured: 200, expected: 220 })).toThrow(/따라가지 않는다/);
  });
  it('일치해도 그 값이 하한이면 던진다 — 하한 일치는 증거가 아니다', () => {
    expect(() => assertFollows('높이', { measured: 220, expected: 220, floor: 220 })).toThrow(
      /하한\(220\)/,
    );
  });
  it('하한을 벗어난 일치는 통과한다', () => {
    expect(assertFollows('높이', { measured: 340, expected: 340, floor: 220 })).toBe(true);
  });
});

describe('assertContrast', () => {
  it('조건 A/B 결과가 같으면 던진다 — 안 달라지는 관측은 아무것도 재지 않는다', () => {
    expect(() => assertContrast('발송버튼', { whenA: true, whenB: true })).toThrow(/조건을 바꿔도/);
  });
  it('달라지면 통과한다', () => {
    expect(assertContrast('발송버튼', { whenA: true, whenB: false })).toBe(true);
  });
});

describe('createReach', () => {
  const reach = createReach(config);

  it('레지스트리에 없는 이름은 즉시 죽는다', () => {
    expect(() => reach.routePath('없는이름')).toThrow(/레지스트리에 '없는이름' 라우트가 없다/);
  });

  it('404 문구가 잡히면 던진다 — 404 를 재고 PASS 가 뜨는 자리', async () => {
    await expect(
      reach.gotoReached(fakePage('/home', '페이지를 찾을 수 없습니다'), 'home'),
    ).rejects.toThrow(/404 페이지다/);
  });

  it('본문이 하한보다 짧으면 던진다 — 얇은 본문은 "위반 0건"으로 보인다', async () => {
    await expect(reach.gotoReached(fakePage('/home', '짧음'), 'home')).rejects.toThrow(/하한\(100\)/);
  });

  it('의도치 않은 리다이렉트는 던진다', async () => {
    await expect(reach.gotoReached(fakePage('/wizard/step1', LONG), 'wizard-step2')).rejects.toThrow(
      /착지했다/,
    );
  });

  it('의도한 리다이렉트를 명시하면 통과한다', async () => {
    const result = await reach.gotoReached(fakePage('/wizard/step1', LONG), 'wizard-step2', undefined, {
      expectRedirectTo: 'wizard-step1',
    });
    expect(result.landed).toBe('/wizard/step1');
  });

  it('expect404 라우트는 404 가 아니면 던진다', async () => {
    await expect(reach.gotoReached(fakePage('/gone', LONG), 'gone')).rejects.toThrow(/404 여야 하는데/);
  });

  it('정상 도달은 통과하고 주석을 남기지 않는다', async () => {
    const testInfo = { annotations: [] as Array<{ type: string; description?: string }> };
    const result = await reach.gotoReached(fakePage('/home', LONG), 'home', testInfo);
    expect(result.isNotFound).toBe(false);
    expect(testInfo.annotations).toEqual([]);
  });
});

describe('verifyRedFirst', () => {
  const run = (script: string) =>
    verifyRedFirst('tests/guards.mutation.test.ts', {
      command: process.execPath,
      args: ['-e', script, '--'],
    });

  it('처음부터 통과하는 spec 은 거부한다', () => {
    const result = run('process.exit(0)');
    expect(result.verdict).toBe('rejected');
    expect(result.reason).toMatch(/아무것도 재지 않는다/);
  });

  it('실패하는 spec 은 수용한다', () => {
    expect(run('process.exit(1)').verdict).toBe('accepted');
  });

  it('spec 이 없으면 통과도 실패도 아닌 ⚪ 로 나간다', () => {
    const result = verifyRedFirst('없는파일.spec.ts', {
      command: process.execPath,
      args: ['-e', 'process.exit(1)'],
    });
    expect(result.verdict).toBe('unmeasured');
    expect(result.exitCode).toBeNull();
  });

  it('재생성 훅은 딱 한 번 불린다', () => {
    let calls = 0;
    verifyRedFirst('없는파일.spec.ts', {
      command: process.execPath,
      args: ['-e', 'process.exit(1)'],
      onMissing: () => {
        calls += 1;
      },
    });
    expect(calls).toBe(1);
  });
});
