#!/usr/bin/env node
/**
 * tc-redfirst — 생성된 spec 이 "처음부터 통과"하지 않는지 검사한다.
 *
 * 사용: tc-redfirst <spec...> -- <실행 명령> [인자...]
 * 예:   tc-redfirst e2e/tc-001.spec.ts -- npx playwright test --reporter=line
 *
 * 종료 코드: 0 수용 / 1 거부 / 3 못 쟀다
 */
import { verifyRedFirst } from './redFirst.js';

const EXIT_OK = 0;
const EXIT_REJECTED = 1;
const EXIT_UNMEASURED = 3;

const main = (): number => {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf('--');
  const specs = (sep === -1 ? argv : argv.slice(0, sep)).filter((a) => !a.startsWith('-'));
  const runner = sep === -1 ? [] : argv.slice(sep + 1);

  if (specs.length === 0 || runner.length === 0) {
    console.error(
      '사용: tc-redfirst <spec...> -- <실행 명령> [인자...]\n' +
        '예:   tc-redfirst e2e/tc-001.spec.ts -- npx playwright test --reporter=line',
    );
    return EXIT_UNMEASURED;
  }

  const [command, ...args] = runner as [string, ...string[]];
  let rejected = 0;
  let unmeasured = 0;

  for (const spec of specs) {
    const result = verifyRedFirst(spec, { command, args });
    const mark =
      result.verdict === 'accepted' ? '✅' : result.verdict === 'rejected' ? '⛔' : '⚪';
    console.log(`${mark} ${spec} — ${result.reason}`);
    if (result.verdict === 'rejected') rejected += 1;
    if (result.verdict === 'unmeasured') unmeasured += 1;
  }

  console.log(
    `\n── spec ${specs.length}건 / 거부 ${rejected}건 / ⚪ 못 쟀다 ${unmeasured}건`,
  );
  if (rejected > 0) return EXIT_REJECTED;
  if (unmeasured > 0) return EXIT_UNMEASURED;
  return EXIT_OK;
};

process.exit(main());
