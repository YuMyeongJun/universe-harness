/**
 * 전제를 **한 번 불러서 그대로 보여주는** 명령. 서버를 안 띄우고도 재현된다.
 *
 *   node dist/precondition-report.js            # 좌표는 console (UNIVERSE_GALAXY 로 바꾼다)
 *   node dist/precondition-report.js backoffice # 좌표를 지정해서
 *   node dist/precondition-report.js --session    # **세션이 필요한 주행**인 척하고 재 본다
 *
 * ⛔ 여기서 브라우저를 띄우지 않는다 — 「띄울 수 있는가」를 묻는 것이지 띄우는 것이 아니다.
 *    그래서 세션이 없는 자리에서는 `session-alive` 가 `null`(**안 잰다**)로 남는 것이 정상이다.
 *
 * 일부러 깨서 확인하는 법 (⚪ 로 갈리는지 **직접 본다**):
 *   PLAYWRIGHT_BROWSERS_PATH=/tmp/없는자리 node dist/precondition-report.js
 */
import { cannotMeasureBecause, galaxyName, measurePreconditions, stands } from './preconditions.js';

const argv = process.argv.slice(2);
/** `--session` — **주행이 세션을 요구한다**고 선언한다(좌표의 `requiresSession` 과 OR). */
const requiresSession = argv.includes('--session');
const galaxy = argv.find((a) => !a.startsWith('--')) ?? galaxyName();

void measurePreconditions({ galaxy, requiresSession }).then((preconditions) => {
  const measurable = stands(preconditions);
  const unmeasured = cannotMeasureBecause(preconditions);
  process.stdout.write(
    `${JSON.stringify({ galaxy, requiresSession, preconditions, measurable, cases: null, unmeasured }, null, 2)}\n`,
  );
  if (unmeasured !== null) process.stdout.write(`\n${unmeasured}\n`);
  /**
   * ⛔ **못 쟀다고 종료 코드 1 을 주지 않는다.** 1 은 「재 봤더니 나쁘다」는 뜻으로 읽히고,
   *    그게 바로 이 층이 없애려는 혼동이다. 못 잰 것은 **2** 로 따로 말한다.
   */
  process.exit(measurable ? 0 : 2);
});
