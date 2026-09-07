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
  delivery: 'observatory/verify-delivery.mjs',
  galaxy: 'bin/galaxy.mjs',
  new: 'bigbang/bigbang.mjs',
  render: 'beacon/render.mjs',
  publish: 'beacon/publish.mjs',
};

if (!command || command === 'help' || command === '--help') {
  console.log([
    '우주 — 빅뱅 한 번으로 별이 태어나는 프론트엔드 하네스',
    '',
    '  universe init                      소비 저장소에 우주를 깐다',
    '  universe observe [--update]        은하의 법칙 위반을 잰다',
    '  universe verify  [--stage <id>]    게이트 + 관문',
    '  universe laws                      우주 자신의 형식 검사',
    '  universe links                     문서 링크가 실재하는 곳을 가리키는가',
    '  universe checks                    **검사가 정말 무는가** — 변이를 넣어 본다',
    '  universe beacon [--record]         위키가 낡았는가 (발행 뒤 --record)',
    '  universe wiki <디렉터리>            위키 본문이 발행본과 같은가 (본문은 받아다 줘야 한다)',
    '  universe structure [--check]       폴더 구조 그림을 다시 그린다 / 낡았는지 본다',
    '  universe args                      받는 인자·광고하는 인자·문서가 셋 다 맞는가',
    '  universe proven [--check]          발동이 증명된 규칙 명부를 만든다',
    '  universe corpora                  인용한 수치의 대상이 아직 있는가',
    '  universe quickstart               문서 순서를 빈 저장소에서 그대로 밟는다',
    '  universe names [--update]          이름 충돌 — 판단하지 않은 것이 있는가',
    '  universe enumeration [--update]    규칙이 사람이 정한 이름을 열거하는가 (§9)',
    '  universe galaxy <이름> [--dir …]    저장소를 읽어 은하 좌표 초안을 만든다',
    '  universe fix [--update]            규칙이 무엇을 하라고 말하는가 — 처방을 잰다',
    '  universe messy [--check]           일부러 더러운 은하를 규칙 표에서 생성한다',
    '  universe check                     관문 전부 — 라운드를 열지 않고 돌린다',
    '  universe lint [--update]           은하의 lint 를 기준선과 대조한다 (절대 0이 아니다)',
    '  universe speed [--update]          초기 로드가 예산 안인가 (광속 한계)',
    '  universe facts [--check]           문서의 「지금 상태」 수치를 생성한다',
    '  universe parts                     부품 시험 — lib/ 의 순수 함수들',
    '  universe learn [--check|--update]  궤적이 낸 후보를 판단했는가',
    '  universe hooks [--install]         커밋 시점 관문을 켠다',
    '  universe learn [--promote]         궤적을 읽어 성운 후보를 낸다',
    '  universe delivery                  **배달본이 도는가** — 빈 곳에 깔아 본다',
    '  universe new <은하> <태양계> <별>   빅뱅 — 별을 태어나게 한다',
    '    └ [--expand]        2차 팽창 — 게이트까지 돌고 빨간 축을 스스로 고친다',
    '    └ [--from "<요구>"]  3차 팽창 — 요구사항 한 줄에서 도는 화면까지',
    '  universe round new|close             라운드 궤도 — 평가를 확인하고 성운으로 승격한다',
    '  universe render                    발행본을 조립한다',
    '  universe publish [--dry-run]       위키로 전파한다',
    '',
    '  공통: --universe <경로> 로 우주의 집을 직접 지정할 수 있다(기본은 cwd 에서 탐색).',
  ].join('\n'));
  process.exit(command ? 0 : 1);
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
