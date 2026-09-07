/**
 * 모르는 플래그를 거부한다 — 관측 법칙 §7 의 집행자.
 *
 * ⚠️ 왜: 존재하지도 않는 `--oracle` 을 「LLM 안 쓰는 모드」로 믿고 돌렸는데, 파서가 그것을
 * 조용히 삼켜서 **평범한 유료 주행이 돌았다.** 화면에 뜬 것은 전부 정상이었다.
 * §3(종료코드)·§4(필터)는 *출력*을 잘못 읽는 결함이지만, 이것은 **입력이 애초에 전달되지
 * 않은 것**이라 층이 다르다. 모르는 플래그는 오타이거나 착각이므로 거부한다.
 *
 * 재는 법: `node observatory/verify-flags.mjs`
 */

/**
 * @param {string[]} argv        `process.argv.slice(2)`
 * @param {string[]} known       아는 플래그 전부(값 받는 것 · 안 받는 것 모두). `--` 포함.
 * @param {string}   name        오류 메시지에 찍을 명령 이름
 * @returns {void} 모르는 플래그가 있으면 사유를 찍고 exit 1.
 */
export const rejectUnknownFlags = (argv, known, name) => {
  const unknown = argv.filter((token) => token.startsWith('--') && token !== '--' && !known.includes(token.split('=')[0]));
  if (unknown.length === 0) {
    return;
  }
  console.error(`⛔ ${name}: 모르는 플래그 ${unknown.join(' ')}`);
  console.error(`   아는 플래그는 이것뿐이다: ${[...known].sort().join(' ')}`);
  console.error('   (관측 법칙 §7 — 모르는 입력을 삼키면 안 켜진 모드가 켜진 것처럼 보인다)');
  process.exit(1);
};
