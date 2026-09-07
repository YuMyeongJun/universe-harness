/**
 * **git 이 무시하는 파일** — 두 도구가 같은 축을 쓰게 하려고 한 자리에 둔다.
 *
 * ## 왜 이것이 분모의 문제인가
 *
 * 생성물(`dist/`)·설치물(`node_modules/`)·일회용 프로브는 **버려질 코드**다. 분모에 들어오면
 * **프로브를 하나 만들면 늘고 지우면 준다** — 코드 품질과 무관하게 기준선이 흔들린다.
 * ⛔ 실측: 옆 저장소에서 「못 읽는 파일 59개(4.2%)」로 나온 것의 **57개가 gitignore 된
 * 일회용 QA 프로브**였다. 「모수가 다르다」가 아니라 **한쪽이 버려질 것을 세고 있었다.**
 *
 * ## ⛔ 그리고 이것을 **한 자리에** 두는 이유
 *
 * `census` 는 이 축으로 걸렀는데 `observe` 는 안 걸렀다. 그래서 우주 자신을 재 보니
 * 벤더링된 엔진의 **`dist/` 안 생성물**이 훑혔고, 규칙이 **자기 예시 문자열을 물어**
 * `.mjs` 도구 코드에 「tailwind 임의 값 55건」이 나왔다. 두 도구가 또 **반대말을 했다**(R163).
 *
 * ## ⚠️ 「못 물었다」와 「없다」는 다르다 (§8)
 *
 * git 저장소가 아니거나 git 이 없으면 **`null`** 을 돌려준다 — 빈 Set 이 아니다.
 * 빈 Set 으로 접으면 「무시되는 것이 하나도 없다」가 되어 **조용히 다 세게** 된다.
 * ⛔ 부르는 쪽은 `null` 을 받으면 **화면에 말해야 한다.**
 */
import { spawn } from 'node:child_process';

/**
 * @returns {Promise<Set<string>|null>} 저장소 뿌리 기준 상대경로 집합. **못 물었으면 `null`.**
 * ⛔ 파이프 뒤에서 종료코드를 읽지 않는다(관측 법칙 §3) — spawn 으로 직접 받는다.
 */
export const gitIgnoredPaths = async (root) => new Promise((resolve) => {
  const child = spawn('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'],
    { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.on('close', (code) => resolve(code === 0 ? new Set(out.split('\0').filter(Boolean)) : null));
  child.on('error', () => resolve(null));
});
