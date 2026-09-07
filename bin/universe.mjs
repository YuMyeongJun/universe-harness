#!/usr/bin/env node
/**
 * `universe` — 우주의 단일 진입점.
 *
 *   universe init                      소비 저장소에 우주를 깐다 (씨앗)
 *   universe observe [--update]        은하의 법칙 위반을 잰다
 *   universe verify  [--stage <id>]    게이트 + 관문
 *   universe laws                      우주 자신의 형식 검사
 *   universe links                     문서 링크가 실재하는 곳을 가리키는가
 *   universe checks                    **검사가 정말 무는가** — 변이를 넣어 본다
 *   universe beacon [--record]         위키가 낡았는가 (발행 뒤 --record)
 *   universe wiki <디렉터리>            위키 본문이 발행본과 같은가 (본문은 받아다 줘야 한다)
 *   universe structure [--check]       폴더 구조 그림을 다시 그린다 / 낡았는지 본다
 *   universe args                      받는 인자·광고하는 인자·문서가 셋 다 맞는가
 *   universe proven [--check]          발동이 증명된 규칙 명부를 만든다
 *   universe corpora                  인용한 수치의 대상이 아직 있는가
 *   universe quickstart               문서 순서를 빈 저장소에서 그대로 밟는다
 *   universe names [--update]          이름 충돌 — 판단하지 않은 것이 있는가
 *   universe enumeration [--update]    규칙이 사람이 정한 이름을 열거하는가 (§9)
 *   universe galaxy <이름> [--dir …]    저장소를 읽어 은하 좌표 초안을 만든다
 *   universe fix [--update]            규칙이 무엇을 하라고 말하는가 — 처방을 잰다
 *   universe messy [--check]           일부러 더러운 은하를 규칙 표에서 생성한다
 *   universe check                     관문 전부 — 라운드를 열지 않고 돌린다
 *   universe lint [--update]           은하의 lint 를 기준선과 대조한다 (절대 0이 아니다)
 *   universe speed [--update]          초기 로드가 예산 안인가 (광속 한계)
 *   universe facts [--check]           문서의 「지금 상태」 수치를 생성한다
 *   universe parts                     부품 시험 — lib/ 의 순수 함수들
 *   universe learn [--check|--update]  궤적이 낸 후보를 판단했는가
 *   universe hooks [--install]         커밋 시점 관문을 켠다
 *   universe learn [--promote]         궤적을 읽어 성운 후보를 낸다
 *   universe extract [--write]         성공 궤적에서 지식 카드를 뽑는다 (기본은 모델 0회)
 *   universe orphans                   아무도 안 가리키는 별을 센다
 *   universe delivery                  **배달본이 도는가** — 빈 곳에 깔아 본다
 *   universe new <은하> <태양계> <별>   빅뱅 — 별을 태어나게 한다
 *     └ [--expand]        2차 팽창 — 게이트까지 돌고 빨간 축을 스스로 고친다
 *     └ [--from "<요구>"]  3차 팽창 — 요구사항 한 줄에서 도는 화면까지
 *   universe render                    발행본을 조립한다
 *   universe publish [--dry-run]       위키로 전파한다
 *
 * ⚠️ 하위 명령은 **패키지 안의 스크립트**를 부르고, 그 스크립트가 **cwd 에서 우주의 집**을 찾는다.
 *    두 집은 다르다 — `lib/home.mjs` 참고.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

import { packageHome } from '../lib/home.mjs';

const [command, ...rest] = process.argv.slice(2);

const SUBCOMMANDS = {
  init: 'bin/init.mjs',
  round: 'bin/round.mjs',
  observe: 'observatory/observe.mjs',
  verify: 'observatory/verify.mjs',
  laws: 'observatory/verify-laws.sh',
  links: 'observatory/verify-links.mjs',
  checks: 'observatory/verify-checks.mjs',
  beacon: 'observatory/verify-beacon.mjs',
  wiki: 'observatory/verify-wiki.mjs',
  structure: 'observatory/render-structure.mjs',
  args: 'observatory/verify-args.mjs',
  proven: 'observatory/render-proven.mjs',
  corpora: 'observatory/verify-corpora.mjs',
  quickstart: 'observatory/verify-quickstart.mjs',
  facts: 'observatory/render-facts.mjs',
  check: 'bin/check.mjs',
  lint: 'observatory/lint-drift.mjs',
  speed: 'observatory/light-speed.mjs',
  names: 'observatory/verify-names.mjs',
  enumeration: 'observatory/verify-enumeration.mjs',
  fix: 'observatory/verify-fix.mjs',
  messy: 'fixtures/messy-galaxy/generate.mjs',
  parts: 'lib/selftest.mjs',
  hooks: 'bin/hooks.mjs',
  learn: 'observatory/learn.mjs',
  /* 성공 궤적 → 지식 카드. ⛔ 기본은 모델을 안 부른다(`--write` 를 줘야 부른다 · R155). */
  extract: 'observatory/extract.mjs',
  /* 아무도 안 가리키는 별 — 「사람이 볼 수 있는가」의 싼 절반(R157). */
  orphans: 'observatory/verify-orphans.mjs',
  delivery: 'observatory/verify-delivery.mjs',
  galaxy: 'bin/galaxy.mjs',
  new: 'bigbang/bigbang.mjs',
  render: 'beacon/render.mjs',
  publish: 'beacon/publish.mjs',
};

/**
 * **인자 없이 치면 — TTY 면 메뉴, 아니면 도움말.**
 *
 * ⛔⛔ **비-TTY 에서는 절대 대화형으로 가지 않는다.** CI·파이프·`verify-checks` 의 진입점
 * 시험이 여기서 **매달리면 관문이 통째로 죽는다.** 지금 자동 호출자들이 전부 플래그를 붙여
 * 부르는 것은 **우연이지 설계가 아니다** — 그 우연에 기대지 않는다.
 *
 * ⚠️ 도움말은 **`lib/commands.mjs` 에서 만들어진다.** 예전엔 여기 문자열이 따로 있어서
 * 배분표와 **두 개의 목록**이었다 — 한 자리만 늘어나면 조용히 갈리는 자리였다(R47 의 그것).
 */
const wantsHelp = command === 'help' || command === '--help' || command === '-h';
if (!command && process.stdin.isTTY && process.stdout.isTTY) {
  const { runMenu } = await import(path.join(packageHome, 'bin/menu.mjs'));
  process.exit(await runMenu({ root: process.cwd(), packageHome, subcommands: SUBCOMMANDS }));
}
if (!command || wantsHelp) {
  const { dailyCommands, gateCommands, helpLine, usageWidth } = await import(path.join(packageHome, 'lib/commands.mjs'));
  /* `--all` 을 줘야 관문이 부르는 것까지 보인다 — 기본은 사람이 치는 것만. */
  const all = rest.includes('--all') || process.argv.includes('--all');
  const daily = dailyCommands();
  const gates = gateCommands();
  const width = usageWidth(all ? [...daily, ...gates] : daily);

  const lines = ['우주 — 빅뱅 한 번으로 별이 태어나는 프론트엔드 하네스', ''];
  for (const [name, meta] of daily) {
    lines.push(helpLine(name, meta, width));
  }
  if (all) {
    lines.push('', '  ── 관문이 알아서 부르는 것 (`universe check` 가 전부 돌린다)');
    for (const [name, meta] of gates) {
      lines.push(helpLine(name, meta, width));
    }
  } else {
    lines.push('', `  (관문이 알아서 부르는 것 ${gates.length}개는 안 보인다 — \`universe --help --all\`)`);
  }
  lines.push('', process.stdin.isTTY
    ? '  인자 없이 `universe` 를 치면 **고르면서** 쓸 수 있다 — 명령줄을 만들어 보여 준다.'
    : '  터미널에서 인자 없이 `universe` 를 치면 고르면서 쓸 수 있다.');
  console.log(lines.join('\n'));
  process.exit(0);
}

const target = SUBCOMMANDS[command];
if (!target) {
  console.error(`모르는 명령: ${command}\n\`universe help\` 를 보라.`);
  process.exit(1);
}

/* 빅뱅만 자기 하위 명령(`new`)을 다시 받는다 — 인자를 그대로 넘긴다. */
const args = ['new', 'round'].includes(command) ? [command === 'round' ? rest[0] : 'new', ...(command === 'round' ? rest.slice(1) : rest)] : rest;
const abs = path.join(packageHome, target);
const runner = target.endsWith('.sh') ? 'bash' : process.execPath;

const child = spawn(runner, [abs, ...args], { stdio: 'inherit', cwd: process.cwd() });
child.on('close', (code) => process.exit(code ?? 1));
