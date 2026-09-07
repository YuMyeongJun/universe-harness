/**
 * **사람의 문장을 플래그로 읽지 않는다.**
 *
 * ⚠️⚠️ 실측(R75): `universe round new "--universe 를 빼고 부르면 …"` 을 쳤더니
 * §7 이 **제목 속 낱말을 모르는 플래그**로 보고 라운드를 안 열었다.
 * 그 라운드가 안 열려서야 알았다 — 도구가 자기 사용자를 벌한 것이다.
 *
 * ⛔ §7 을 끄지 않는다. **제목의 자리만** 검사에서 뺀다.
 * `--universe <값>` 은 제목 앞에 와야 한다 — 뒤에 오면 제목의 일부다.
 */

/**
 * @param {string[]} argv 명령 뒤의 인자 전부
 * @param {string} subcommand 제목을 받는 하위 명령(예: `new`)
 * @returns {{ flags: string[], title: string }}
 */
export const splitTitle = (argv, subcommand) => {
  if (argv[0] !== subcommand) {
    return { flags: argv, title: '' };
  }
  const rest = argv.slice(1);
  const carried = rest.filter((token, index) => token === '--universe' || rest[index - 1] === '--universe');
  const title = rest.filter((token, index) => token !== '--universe' && rest[index - 1] !== '--universe').join(' ').trim();
  return { flags: [argv[0], ...carried], title };
};
