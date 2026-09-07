import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fromPlaywrightJson } from '../src/run/playwright.ts';

/**
 * **진짜 Playwright 리포트가 우리 계약을 통과하는가.**
 *
 * ⛔ 이 저장소는 계약·픽스처·판정 화면을 다 세우고도 **진짜 브라우저 리포트를 넣어 본 적이
 * 없었다.** 그래서 「돈다」가 **짐작**이었다 — 이 저장소 어휘로는 ⚪ 못 쟀다다.
 * 넣어 보니 실제로 배선이 이어졌고, **그 리포트를 픽스처로 굳혔다.**
 *
 * ## ⛔ 왜 브라우저를 여기서 안 띄우나
 *
 * 관문은 커밋마다·CI 마다 돈다. 브라우저를 띄우면 **느려지고**, CI 에는 바이너리가 없어
 * **「못 쟀다」로 조용히 지나간다** — 그러면 재는 척만 하게 된다(`verify-wiki` 를 관문 밖에
 * 둔 사유와 같다). ⇒ **저장된 진짜 출력**으로 **배선만** 잰다. 싸고 어디서나 돈다.
 * ⚠️ 못 잡는 것(§8): **Playwright 자체가 바뀌어 출력 모양이 달라지는 것**은 이 시험이 못 본다.
 *    그건 사람이 가끔 진짜로 돌려서 픽스처를 갱신해야 한다.
 */
describe('진짜 Playwright 리포트 → 계약', () => {
  const report = JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures/playwright/real-run.json'), 'utf8'),
  );

  it('세 상태가 그대로 온다 — 통과·실패·건너뜀', () => {
    const out = fromPlaywrightJson(report, {});
    /**
     * ⛔ 분모부터 — 「fail 1건」은 1/1 인지 1/300 인지 없이는 뜻이 없다.
     * ⚠️ `fromPlaywrightJson` 은 **케이스만** 낸다(`IRunInput`). 세는 것은 계약의 몫이라
     *    여기서는 **케이스 수**가 분모다. 처음엔 `out.stats` 를 봤다가 `undefined` 로 죽었다 —
     *    **어느 층이 무엇을 아는지**를 확인하지 않고 시험을 쓴 것이다.
     */
    expect(out.cases.length, '분모가 없다').toBe(3);

    const byId = Object.fromEntries(out.cases.map((c) => [c.id, c]));
    expect(byId['TC-901'].status).toBe('passed');
    expect(byId['TC-902'].status).toBe('failed');
    /* ⛔ 건너뛴 것은 **통과도 실패도 아니다.** 이 한 칸이 이 저장소의 §8 전부다. */
    expect(byId['TC-903'].status, '건너뛴 것을 통과나 실패로 접었다').toBe('unmeasured');
  });

  it('실패한 케이스에 증거(스크린샷)가 붙는다', () => {
    const out = fromPlaywrightJson(report, {});
    const failed = out.cases.find((c) => c.status === 'failed');
    expect(failed?.evidence?.screenshot, '실패했는데 증거가 없다 — 사람이 뭘 보고 판정하나').toBeTruthy();
  });

  it('출처를 선언 안 하면 unknown 이다 — 지어내지 않는다', () => {
    const out = fromPlaywrightJson(report, {});
    /* ⛔ 「모른다」를 「정책서에서 나왔다」로 채우면 **자기 채점을 못 막는다.** */
    expect(out.cases.every((c) => c.origin === 'unknown'), '출처를 지어냈다').toBe(true);
  });

  it('출처를 선언하면 그대로 실린다', () => {
    const origins = JSON.parse(
      readFileSync(join(import.meta.dirname, '../e2e/origins.json'), 'utf8'),
    );
    const out = fromPlaywrightJson(report, { origins });
    const byId = Object.fromEntries(out.cases.map((c) => [c.id, c]));
    expect(byId['TC-901'].origin).toBe('policy');
    expect(byId['TC-901'].originRef, '출처를 적었는데 근거가 안 실린다').toBeTruthy();
  });
});
