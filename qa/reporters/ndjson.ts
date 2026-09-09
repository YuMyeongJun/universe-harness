/**
 * **한 건이 끝날 때마다 한 줄씩 뱉는 리포터** — 화면이 주행을 *보면서* 그릴 수 있게.
 *
 * ## ⛔⛔ 왜 필요한가 — `--reporter=json` 으로는 원천적으로 불가능하다
 *
 * Playwright 의 `json` 리포터는 **주행이 다 끝난 뒤** 파일을 한 번에 쓴다. 그래서 8건이
 * 30초 걸리면 화면은 30초 동안 **아무것도 모른다** — 돌고 있는지 죽었는지도 모른다.
 * ⇒ 이 리포터는 `onTestEnd` 마다 **NDJSON 한 줄**을 덧붙인다. 서버는 그 파일을 따라 읽어
 * 그대로 흘려보내면 된다.
 *
 * ## ⛔ 이것은 **판정이 아니다**
 *
 * 여기서 나오는 줄은 **진행**이다. 그 주행의 판정은 여전히 `qa/src/run/contract.ts` 가
 * `json` 리포터의 산출을 먹고 낸다. ⚠️ 그래서 이 리포터는 `json` 리포터를 **대체하지 않고
 * 나란히** 돈다. 화면이 스스로 세기 시작하면 **두 자리에서 세게 되고**, 갈린 뒤에는
 * 어느 쪽이 사실인지 아무도 모른다 — 이 저장소가 반복해서 데인 자리다.
 *
 * ## ⛔ 상태와 id 를 **여기서 다시 정하지 않는다**
 *
 * `statusOf` 와 `caseIdOf` 를 어댑터에서 **가져다 쓴다**(`../src/run/playwright.js`).
 * 베껴 쓰면 실시간 줄과 최종 판정이 **같은 케이스를 다르게 부르거나 다르게 채점한다** —
 * 화면에는 ✅ 인데 판정은 ⚪ 인 자리가 생긴다. ⚠️ 특히 `flaky` 와 `skipped` 는 **통과가
 * 아니라 ⚪** 인데, 그 규율이 두 벌이 되면 조용히 갈린다.
 */
import { appendFileSync } from 'node:fs';
import path from 'node:path';

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

import { caseIdOf, statusOf } from '../src/run/playwright.js';

/**
 * ⛔ 주소를 코드에 안 박는다 — 어디에 쓸지는 **부른 쪽**이 정한다.
 * 안 주면 이 리포터는 **아무것도 안 하고 그렇게 말한다.** 조용히 no-op 이 되면
 * 화면은 「줄이 안 온다」를 「시험이 없다」로 읽는다.
 */
const OUT = process.env['UNIVERSE_NDJSON'] ?? '';

class NdjsonReporter implements Reporter {
  private total = 0;
  private done = 0;
  private rootDir = '';

  private write(row: Record<string, unknown>): void {
    if (OUT === '') return;
    /* ⚠️ 동기 append 다 — 버퍼에 남으면 「실시간」이 아니게 된다. 줄 단위로 즉시 나가야 한다. */
    appendFileSync(OUT, `${JSON.stringify(row)}\n`, 'utf8');
  }

  onBegin(config: FullConfig, suite: Suite): void {
    if (OUT === '') {
      process.stderr.write(
        '⚪ ndjson 리포터: `UNIVERSE_NDJSON` 이 없어서 줄을 안 씁니다 — 실시간 표시가 꺼진 것이지 시험이 없는 것이 아닙니다.\n',
      );
      return;
    }
    this.rootDir = config.rootDir;
    this.total = suite.allTests().length;
    /**
     * ⭐ **분모를 먼저 말한다.** 몇 건인지 모르면 화면은 「3건 통과」를 「전부 통과」로
     * 그릴 수 있다. ⛔ 0건이면 그것도 그대로 말한다 — 0건은 「위반 없음」이 아니다.
     */
    this.write({ kind: 'begin', total: this.total });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (OUT === '') return;
    this.done += 1;
    const file = path.relative(this.rootDir, test.location.file);
    /**
     * ⛔ 어댑터와 **같은 함수**로 id 를 만든다. 제목의 `TC-…` 가 없으면
     * `파일 › 제목` 으로 떨어지는데, 그 규칙이 두 벌이면 실시간 줄과 판정이 **다른 이름**을 쓴다.
     */
    const id = caseIdOf(
      {
        title: test.title,
        file,
        tests: [
          {
            annotations: test.annotations.map((a) => ({
              type: a.type,
              description: a.description,
            })),
          },
        ],
      },
      file,
    );
    /**
     * ⚠️ `test.outcome()` 은 **재시도까지 합친** 판정이다. 이 축은 `retries: 0` 이라
     * 지금은 한 번의 결과와 같다. ⛔ 재시도를 켜면 이 줄이 **마지막 시도마다** 나가므로
     * 화면이 같은 id 를 덮어써야 한다(뒤에 온 것이 맞다).
     */
    const mapped = statusOf(test.outcome());
    this.write({
      kind: 'case',
      index: this.done,
      total: this.total,
      id,
      title: test.title,
      file,
      /** ⛔ `passed` · `failed` · `unmeasured` 셋뿐이다. `skipped`·`flaky` 는 ⚪ 로 접힌다. */
      status: mapped.status,
      flaky: mapped.flaky,
      /** ⚪ 인 이유. 화면이 「왜 못 쟀는지」를 말할 수 있어야 한다. */
      reason: mapped.reason ?? null,
      durationMs: result.duration,
      /* ⛔ 오류를 요약하지 않는다 — 도구가 한 말 그대로 나른다. */
      error: result.error?.message ?? null,
    });
  }

  onEnd(result: FullResult): void {
    if (OUT === '') return;
    /**
     * ⚠️ `status` 는 Playwright 가 **주행 자체**에 대해 한 말이다(`passed`·`failed`·
     * `timedout`·`interrupted`). ⛔ 이것을 그 주행의 **판정**으로 쓰지 마라 —
     * 판정은 계약 도구가 낸다. 여기서는 「끝났다/끊겼다」를 화면에 알릴 뿐이다.
     */
    this.write({ kind: 'end', runStatus: result.status, done: this.done, total: this.total });
  }
}

export default NdjsonReporter;
