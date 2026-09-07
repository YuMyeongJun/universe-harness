#!/usr/bin/env node
/**
 * 검사가 정말 무는가 — **관측소 자신에 대한 변이 시험**.
 *
 * ⚠️ 왜 필요한가: 이 우주의 검사들은 전부 「초록불」로 끝난다. 그런데 **검사가 조용히
 * 고장 나도 똑같이 초록불이다.** 실제로 세 번 당했다 —
 *   · `quality/cohesion` 이 0건을 내던 것은 위반이 없어서가 아니라 **정규식 가정 3개가 틀려서**였다(고치자 21건)
 *   · 승격 감사가 대조 열쇠를 잘못 잡아 **자기 오탐**을 냈다
 *   · 없는 플래그를 파서가 삼켜 **공짜 모드인 줄 알고 유료 주행**이 돌았다
 * 셋 다 「그 도구를 막 만든 직후」에 우연히 잡혔다. 우연에 기대지 않으려고 이 시험을 둔다.
 *
 * 하는 일: 검사마다 **알려진 위반을 주입**하고, 그 검사가 exit 0 이 아닌지 본다.
 * 물지 않으면 그 검사는 장식이다.
 *
 * 재는 법:
 *   node observatory/verify-checks.mjs      # 0=전부 문다 · 1=안 무는 검사가 있다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 *
 * ⚠️ 이 스크립트는 파일을 잠깐 고쳤다가 **git 으로 되돌린다.** 그래서 워킹트리가
 *    더러우면 시작하지 않는다 — 남의 변경을 날릴 수 있기 때문이다.
 */
import { readFile, writeFile, rm } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { rejectUnknownFlags } from '../lib/flags.mjs';
import { whyItFailed } from '../lib/why.mjs';
import { EXIT_UNMEASURED } from '../lib/gates.mjs';

rejectUnknownFlags(process.argv.slice(2), ['--universe', '--reasons'], 'universe checks');

const exec = promisify(execFile);
const ROOT = resolve(new URL('..', import.meta.url).pathname);

const run = async (command, args) => {
  try {
    const { stdout, stderr } = await exec(command, args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (error) {
    return { code: error.code ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

/* ⚠️ **전체 워킹트리가 아니라 「내가 만질 파일들」만** 깨끗하면 된다.
   처음엔 전체를 요구했는데, 다른 갈래가 저장소의 다른 구석을 고치고 있으면
   이 시험이 영영 못 도는 처지가 됐다 — 안 도는 검사는 없는 검사와 같다. */
/* ⚠️⚠️ **git 으로 되돌리지 않는다 — 원본을 메모리에 들고 있다가 되돌린다.**
   예전엔 `git checkout --` 로 되돌렸고, 그래서 **만질 파일이 커밋돼 있어야만** 돌 수 있었다.
   그 요구가 다섯 번 마찰을 냈다 — 라운드를 닫을 때마다 `nebula/README.md` 가 미커밋이라
   막혔고, 그때마다 「커밋하고 다시」를 반복했다. **관문이 사람을 두 번 일하게 하면
   사람은 관문을 우회하는 법부터 배운다.**
   메모리에서 되돌리면 커밋 여부와 무관하고, 남의 미커밋 변경도 안 날린다. */
/** 원본이 `null` 이면 그 파일은 **원래 없었다** — 되돌리기는 지우기다. */
const restoreFrom = (file, original) =>
  original === null ? rm(join(ROOT, file), { force: true }) : writeFile(join(ROOT, file), original, 'utf8');

/** 검사 하나 · 변이 하나. `mutate` 는 파일 내용을 받아 **위반이 든 내용**을 돌려준다. */
/**
 * ⛔ **기대 문구에 숫자를 손으로 적지 않는다.**
 *
 * 실측(R163): 여기에 `'기준선 5 → 실측 4'` 라고 박아 뒀는데 규칙이 `.js`·`.jsx` 를 읽기
 * 시작하면서 기준선이 6이 됐고, 변이는 **여전히 죽었는데 이유가 달라져** 관문이 빨개졌다.
 * 「검사가 낡아서 나는 빨간불」은 사람이 **검사를 지우는 쪽으로** 배우게 만든다.
 * ⇒ 기준선에서 **만들어 낸다.** 은하가 바뀌면 기대도 같이 움직인다.
 */
const MESSY_SEMANTICS = JSON.parse(
  await readFile(join(ROOT, 'galaxies/messy-galaxy.json'), 'utf8'),
).observed?.laws?.semantics;
/* 분모 가드 — 못 읽었으면 「통과」가 아니라 **못 쟀다**다(§8). */
if (typeof MESSY_SEMANTICS !== 'number') {
  console.error('⛔ messy-galaxy 의 시맨틱 기준선을 못 읽었다 — 변이 기대를 만들 수 없다.');
  process.exit(EXIT_UNMEASURED);
}

const CASES = [
  {
    check: '우주 형식(verify-laws)',
    bite: '중력 법칙 — 엣지 없는 문서',
    expect: './laws/tokens.md',
    file: 'laws/tokens.md',
    /* ⚠️ `parent:` 만 지웠더니 검사가 안 물었다. 처음엔 검사가 헐거운 줄 알았는데
       **내 변이가 틀린 것**이었다 — 이 문서엔 `related:` 도 있어서 엣지가 남았다.
       검사는 「parent 또는 related」를 본다. 둘 다 지워야 진짜 고아가 된다. */
    mutate: (t) => t.replace(/^parent:.*$/m, '').replace(/^related:.*$/m, ''),
    cmd: ['bash', ['observatory/verify-laws.sh']],
  },
  {
    check: '우주 형식(verify-laws)',
    bite: '재는 법이 없는 법칙',
    expect: 'laws/naming.md — 재는 법에 돌릴 명령이 없다',
    file: 'laws/naming.md',
    /* ⚠️ 제목에 `⚠️` 가 붙은 법칙도 있고 안 붙은 법칙도 있다. 처음엔 붙은 형태만
       찾다가 **변이가 아예 안 먹었다.** 「변이가 안 먹으면 경고」를 넣어 두지 않았으면
       그 자리는 조용히 ✅ 로 보였을 것이다 — 시험도 낡는다. */
    /* ⚠️ 처음엔 제목을 「## 재는 법이 사라진 자리」로 바꿨는데 **여전히 통과했다** —
       검사가 `^## 재는 법` 접두 일치라 바뀐 제목도 걸렸기 때문이다.
       내 변이가 약했고, 동시에 **검사도 헐거웠다.** 둘 다 고쳤다. */
    mutate: (t) => t.replace(/^##[^\n]*재는 법[^\n]*$/m, '## 다른 이야기'),
    cmd: ['bash', ['observatory/verify-laws.sh']],
  },
  {
    check: '우주 형식(verify-laws)',
    bite: '재는 법 절은 있는데 돌릴 명령이 없다',
    expect: 'laws/flatness.md — 재는 법에 돌릴 명령이 없다',
    file: 'laws/flatness.md',
    /* 「재는 법이 없으면 그것은 법칙이 아니라 의견이다」— 빈 절도 의견이다. */
    mutate: (t) => t.replace(/(^## .*재는 법[\s\S]*?)(?=^## |\Z)/m, '## ⚠️ 재는 법\n\n나중에 적는다.\n\n'),
    cmd: ['bash', ['observatory/verify-laws.sh']],
  },
  {
    check: '법칙 관측(observe)',
    bite: '주인 없는 규칙',
    expect: '주인 없는 규칙: tailwind/arbitrary-value',
    file: 'laws/tokens.md',
    mutate: (t) => t.replace(/^(rules:\s*\[)([^\]]*)\]/m, (_m, head) => `${head}]`),
    cmd: ['node', ['observatory/observe.mjs']],
  },
  {
    check: '문서 링크(verify-links)',
    bite: '가리키는 곳이 없는 링크',
    expect: '깨진 링크',
    file: 'README.md',
    mutate: (t) => `${t}\n[없는 곳](./이런-파일은-없다.md)\n`,
    cmd: ['node', ['observatory/verify-links.mjs']],
  },
  {
    check: '커버리지 분모(observe)',
    bite: '파일을 0개 봤는데 「0건」으로 보임',
    expect: '훑은 파일이 0개다 — 못 쟀다',
    file: 'galaxies/console.json',
    /**
     * ⛔⛔ **「0건」과 「0개를 봤다」는 글자 하나 다르지 않은 화면을 낸다.**
     *
     * 실측(R163): 우주 자신을 은하로 걸었더니 「토큰 0건 · 시맨틱 0건 · … · 발동 안 한 규칙
     * 13/13」이 나왔다. 훑개는 `<appDir>/src` 만 훑는데 그 자리에 `src/` 가 없었던 것이다.
     * **깨끗한 저장소와 구별이 안 됐다.** 심을 때만(`--update`) 막던 가드를 앞으로 당겼다.
     *
     * ⚠️⚠️ **조준을 두 번 옮겼다.**
     *   ① `appDir` 을 **없는 자리**로 바꿨더니 「태양계 srcDir 이 빈 곳을 가리킨다」가
     *     **먼저** 물어 exit 1 로 죽었다 — 죽긴 했는데 **그 이유가 아니었다.**
     *   ⇒ ② **있는데 소스가 없는 자리**(`web/src`)로 옮기고 태양계를 비운다. 그러면
     *     앞선 좌표 검사는 통과하고 **훑은 파일만 0개**가 된다 — 겨눈 자리가 정확히 드러난다.
     * ⚠️ `tiny-galaxy` 는 `appDir: "."` 이라 훑개가 저장소 뿌리를 훑어 **0개가 안 된다.**
     */
    mutate: (t) => {
      const g = JSON.parse(t.replace('"appDir": "web"', '"appDir": "web/src"'));
      g.solarSystems = [];
      return `${JSON.stringify(g, null, 2)}\n`;
    },
    cmd: ['node', ['observatory/observe.mjs', '--galaxy', 'console']],
  },
  {
    check: '문서 링크(verify-links)',
    bite: '훑개가 고장 나 0개를 셈 (§8 바닥값)',
    expect: '아무것도 못 셌다',
    file: 'observatory/verify-links.mjs',
    mutate: (t) => t.replace(/\/\\\[\[\^\\\]\\n\]\*\\\]\\\(\(\[\^\)\\n\]\+\)\\\)\/g/, '/절대안맞는패턴XYZ/g'),
    cmd: ['node', ['observatory/verify-links.mjs']],
  },
  {
    check: '문서 링크(verify-links)',
    bite: '아무 데서도 안 쓰이는 그림',
    expect: '아무 데서도 안 쓰이는 그림',
    file: 'orbits/round.md',
    /* 실제로 이 그림이 고아인 줄 알았는데 아니었다 — 내 grep 범위가 좁았다.
       그래서 이 변이는 **참조를 지워** 진짜 고아를 만든다. */
    mutate: (t) => t.replace(/round-orbit\.svg/g, 'none.svg'),
    cmd: ['node', ['observatory/verify-links.mjs']],
  },
  {
    check: '폴더 구조(structure)',
    bite: '그림이 파일시스템과 어긋났다',
    expect: '폴더 구조 그림이 낡았다',
    file: 'docs/08-architecture.md',
    /* 그림은 낡는다. **생성된 그림은 낡을 수 없지만**, 생성한 뒤 폴더가 바뀌면
       문서가 뒤처진다 — 그것을 잡는다. */
    mutate: (t) => t.replace(/^├── laws\/.*$/m, '├── laws-가-사라진-척/'),
    cmd: ['node', ['observatory/render-structure.mjs', '--check']],
  },
  {
    check: '배달본이 도는가(delivery)',
    expect: '배달본에서 빨간불이 난다',
    bite: '배달본에서 빨간불이 난다',
    file: 'lib/delivered.mjs',
    /* ⛔ **이것이 R43 의 결함 그 자체다.** `lib/` 이 배달 목록에서 빠져 42커밋 동안 설치본이
       깨져 있었다 — 우주 저장소 안에서는 전부 초록불이었다. 목록에서 다시 빼면
       「갓 깐 우주」가 자기 관문을 못 통과해야 한다. 2초 걸린다(실측). */
    mutate: (t) => t.replace(/^\s*\['lib',[^\n]*\n/m, ''),
    cmd: ['node', ['observatory/verify-delivery.mjs']],
  },
  {
    check: '발동 증명 명부(proven --check)',
    bite: '명부가 낡았다',
    expect: '발동 증명 명부가 낡았다',
    file: 'observatory/rules-proven.json',
    /* ⛔ 명부가 낡으면 **소비 팀이 「이 규칙은 발동함이 확인됐다」는 틀린 안심을 받는다** —
       또는 진짜로 증명 안 된 규칙을 증명됐다고 읽는다. 무발동 경고보다 나쁘다(R93). */
    mutate: (t) => t.replace(/"a11y\/img-alt",?\n/, ''),
    cmd: ['node', ['observatory/render-proven.mjs', '--check']],
  },
  {
    check: '말뭉치 감사(corpora)',
    bite: '판단하지 않은 인용',
    expect: '명부에 없는 인용',
    file: 'observatory/corpora.json',
    /* ⛔ 명부에서 한 줄을 빼면 그 수치는 **재현 가능한지 아무도 판단 안 한** 것이 된다.
       「실측」이라 적힌 수치의 대상이 사라질 수 있다 — 실제로 셋이 사라졌다(R103). */
    mutate: (t) => t.replace(/\{[^{}]*"files": 1227[\s\S]*?\},\n/, ''),
    cmd: ['node', ['observatory/verify-corpora.mjs']],
  },
  {
    check: '이름 다른 복제(names)',
    bite: '몸통이 같은 무리',
    expect: '몸통이 같은 무리',
    file: 'lib/pick.mjs',
    /* ⛔ R21·R22 가 「**이름만 본다**」로 남긴 한계다 — 이름이 다른 복제는 안 보였다.
       `whyItFailed` 의 몸통을 다른 이름으로 붙이면 잡혀야 한다. */
    mutate: (t) => `${t}\nexport const whyItDied = (out, limit = 8) => {\n  const lines = out.split('\\n').filter(Boolean);\n  const marked = lines.filter((line) => FAILURE.test(line));\n  const chosen = marked.length > 0 ? marked.slice(0, limit) : lines.slice(-limit);\n  return chosen.map((line) => \`      \${line.trim()}\`).join('\\n');\n};\n`,
    cmd: ['node', ['observatory/verify-names.mjs']],
  },
  {
    check: 'TC 도구 시험(qa)',
    bite: '시험이 비켜서는데 종료코드는 0이라 초록으로 읽힘',
    expect: '비켜선 시험',
    file: 'qa/tests/playwright.wiring.test.ts',
    /**
     * ⛔⛔ **비켜섬은 종료코드에 안 나온다.** 「243 통과」와 「242 통과 · 1 건너뜀」이
     * 둘 다 exit 0 이라 **같은 초록**으로 읽힌다.
     * ⚠️ 옆 저장소 세션이 자기 게이트에서 그 사고를 겪었다 — 빌드 산출물이 없어 3건이
     *    매번 조용히 비켜섰는데 **여러 회전을 같은 초록으로 읽어** 뒤늦게 알았다.
     *    그쪽을 오도한 것은 `CLAUDE.md` 의 줄임 한 줄(`yarn build`(=`tsc`))이었다.
     * ⇒ 여기서는 **수로 말하고 ⚪ 로 갈린다.** 「고칠 수 있는 이유로 비켜서는 것」은
     *    정직이 아니라 **안 재는 핑계**다.
     */
    mutate: (t) => t.replace('it(', 'it.skip('),
    cmd: ['node', ['observatory/verify-qa.mjs']],
  },
  {
    check: '손 변이 틀의 커버리지(parts)',
    bite: '갈래를 만들어 놓고 자기 시험을 안 붙임',
    expect: '만들어 놓고 안 재는 갈래',
    file: 'observatory/mutate.mjs',
    /**
     * ⛔⛔ **이 등재가 회귀를 끝낸다.**
     *
     * 틀 **안**에 있던 커버리지 가드는 **꺼 봐도 아무도 안 물었다**(실측). 같은 층에서 재면
     * 그 층이 무보호다 — 옆 저장소 세션이 자기 틀에서 같은 한계를 재고 「없앨 수 있는 한계가
     * 아니라 적어 두는 한계다」라고 적었다.
     * ⇒ 검사를 **한 층 밖**(`lib/selftest.mjs`)으로 옮겼고, 그 바깥 검사를 지우는 것은
     *   **이 변이가** 잡는다(지우면 여기가 「놓쳤다」로 빨개진다).
     *   그리고 변이 관문 자신은 `universe check` 가 돌린다 — 회귀가 여기서 멈춘다.
     */
    mutate: (t) => t.replace("  RED: '⚠️ 기준선빨강',", "  RED: '⚠️ 기준선빨강',\n  GHOST: '⚠️ 유령갈래',"),
    cmd: ['node', ['lib/selftest.mjs']],
  },
  {
    check: '말뭉치 감사(corpora)',
    bite: '인용을 하나도 못 찾았는데 「전부 판단돼 있다」',
    expect: '하나도 못 찾았다',
    file: 'observatory/verify-corpora.mjs',
    /**
     * ⛔⛔ 이 검사의 분모는 **명부**가 아니라 **문서에서 찾은 인용**이다. 훑개가 죽으면
     * 「✅ 인용한 수 0개가 전부 판단돼 있다」로 **초록**이 났다(실측).
     * ⚠️ 겨냥을 두 번 옮겼다: `files` 를 비워도, `docs`·`laws` 를 빼도 **조건이 안 만들어졌다**
     *    (뒤에서 `push` 로 다시 채우고, README·규칙 주석이 남는다). ⇒ **정규식**을 죽여야 눈이 먼다.
     *    「놓쳤다」가 나왔다고 바로 구멍이라 적지 않는다 — **변이가 그 조건을 만드는지** 먼저 본다.
     */
    mutate: (t) => t.replace(
      '/파일\\s*([\\d,]{3,})\\s*개|([\\d,]{3,})\\s*(?:개\\s*)?파일/g',
      '/절대안맞는패턴XYZ()()/g'),
    cmd: ['node', ['observatory/verify-corpora.mjs']],
  },
  {
    check: '손 변이 틀(mutate)',
    bite: '「사고로 죽은 것」을 「물었다」로 셈',
    expect: '사유불일치',
    file: 'observatory/mutate.mjs',
    /**
     * ⛔⛔ **이 틀이 존재하는 이유 그 자체를 변이시킨다.**
     * 판정을 **거부 사유**가 아니라 **종료코드**로 하게 만들면, 「겨냥이 빗나가 남이 대신 죽은 것」과
     * 「내 검사가 문 것」이 **같은 초록**이 된다 — 이 세션에서만 네 번 밟은 자리다.
     * ⚠️ 자기 시험의 「사유불일치」 갈래가 그때 **✅ 물었다**로 떨어지므로 그 줄이 빨개진다.
     */
    mutate: (t) => t.replace('if (!out.text.includes(expect)) {', 'if (false) {'),
    cmd: ['node', ['observatory/mutate.mjs', '--self-test']],
  },
  {
    check: '주소로 받아 오는가(clone)',
    bite: '자격이 박힌 주소를 그대로 받아들임',
    expect: '자격이 박힌 주소',
    file: 'bin/clone.mjs',
    /**
     * ⛔⛔ **토큰이 인자로 들어오면 셸 히스토리와 `ps` 에 남는다.** 이 저장소는 공개 MIT 라
     * 한 번 새면 되돌릴 수 없다. 그래서 `--token` 을 안 받는 것으로는 부족하다 —
     * `https://<토큰>@github.com/...` 는 git 이 받아들이고, 그 순간 토큰이 **이 도구의 인자**다.
     *
     * ⚠️ 겨냥: 거절 갈래를 꺼서 **받아들이게** 만든다. 관문은 그 주소를 실제로 넣어 보고
     *    「자격이 박혀 있다」가 안 나오면 문다 — 화면 문구가 아니라 **거절했는가**가 판정이다.
     */
    mutate: (t) => t.replace(
      "if (/^[a-z+]+:\\/\\/[^/@]*[:@]/i.test(url) && !/^ssh:\\/\\//i.test(url)) {",
      'if (false) {'),
    cmd: ['bash', ['observatory/probe-clone.sh']],
  },
  {
    check: '콘솔이 서는가(console)',
    bite: '지식 저장소를 못 찾았는데 「ok」라고 답함',
    expect: '없는데 「ok」라고 답한다',
    file: 'app/universe/server/src/paths.ts',
    /**
     * ⛔⛔ **못 찾았을 때 「0개」로 답하면 그것이 사고다.** 빈 목록은 「도메인이 없다」로
     * 읽히고, 그건 「못 읽었다」와 다른 말이다(§8). 콘솔은 사람의 계획이 전부 지나가는
     * 자리인데 **아무 관문도 띄워 본 적이 없었다** — 시험이 하나도 없는 저장소였다.
     *
     * ⚠️ 이 변이는 **TypeScript 소스**를 건드린다. 그래서 탐침이 **낡으면 스스로 다시 짓는다** —
     *    처음엔 「낡았으면 ⚪」로 했는데, 그러면 **소스를 고치는 변이가 판정을 못 바꾼다.**
     */
    mutate: (t) => t.replace('if (existsSync(dir)) return { ok: true, dir };', 'return { ok: true, dir };'),
    cmd: ['node', ['observatory/probe-console.mjs']],
  },
  {
    check: '자리마다 분모(observe)',
    bite: '훑는다고 적어 놓고 비어 있는 자리를 그냥 지나감',
    expect: '훑는다고 적어 놓고 0개인 자리',
    file: 'observatory/observe.mjs',
    /**
     * ⛔⛔ **「통째로 못 봤다」와 「일부만 봤다」는 다르다.**
     *
     * 「전부 0개」 가드는 있었다. 그런데 은하가 훑을 곳을 **여럿** 적으면 그중 하나가
     * 오타여도 **나머지가 파일을 내므로 조용하다** — 화면에는 그 자리가 「훑는 곳」으로
     * **나열까지 된다.** 안 본 것을 본 것처럼 적는 자리다.
     * ⚠️ 옆 저장소 세션이 자기 검사(`SCANNED_ROOTS` 고정)에서 같은 형태를 찾아 줬다.
     *
     * ⚠️ 겨냥: 갈래를 **옛 상태**(전부 0개일 때만 문다)로 되돌린다. 「지운다」보다 이쪽이
     *    정확하다 — 잡으려는 것이 **가드의 부재**가 아니라 **가드의 좁음**이기 때문이다.
     */
    mutate: (t) => t.replace('emptyTargets.length < perTarget.length', 'emptyTargets.length === 0'),
    cmd: ['bash', ['observatory/probe-draft.sh']],
  },
  {
    check: '좌표 초안(galaxy)',
    bite: '코드가 없는 자리를 가리키는 좌표를 낸다',
    expect: '훑은 파일이 0개다',
    file: 'bin/galaxy.mjs',
    /**
     * ⛔⛔ **초안이 「0개를 보는 좌표」를 내면, 그 은하는 영원히 조용하다.**
     *
     * 실측(R163): 도구는 **코드가 어느 폴더에 있는지 이미 알아냈으면서**(`server/`·`web/`)
     * 좌표에는 기본값(`<appDir>/src`)만 남겼다. `src/` 관례를 안 쓰는 저장소에서는
     * 훑는 곳에 **파일이 0개**가 되고, 예전 관측은 그걸 **「0건」**이라고 말했다.
     *
     * ⚠️ 겨냥: `codeDirs` 를 안 싣게 만들고, **초안을 실제로 걸어** 관측을 돌린다.
     *    화면 문구가 아니라 **관측이 무엇을 보는가**가 판정이다.
     * ⛔ 은하는 `galaxies.local/`(gitignore)에 만들고 config 는 되돌린다 — 저장소를 안 더럽힌다.
     */
    mutate: (t) => t.replace('      codeDirs: scanDirs,', '      codeDirs: [],'),
    cmd: ['bash', ['observatory/probe-draft.sh']],
  },
  {
    check: '새 사람의 길(quickstart)',
    bite: '문서대로 쳤는데 막힌다',
    expect: '새 사람의 길이',
    file: 'bin/galaxy.mjs',
    /* ⛔ **R121 이 고친 그 결함을 되살려 본다.** `galaxy` 가 이름을 목록에 안 올리면
       관측이 **아무것도 안 재고 초록불**을 낸다 — 새 사람이 처음 걷는 길에서 그랬다. */
    mutate: (t) => t.replace("if (!flag('--out')) {\n  const configPath", "if (false) {\n  const configPath"),
    cmd: ['node', ['observatory/verify-quickstart.mjs']],
  },
  {
    check: '우주 형식(laws)',
    bite: 'applies_to 없음',
    expect: 'applies_to 없음',
    file: 'laws/flatness.md',
    /* 법칙 문서가 `applies_to` 를 잃으면 **관측소가 그 법칙을 잴 수 없다.** 그런데 문서는
       멀쩡해 보인다 — 형식 검사가 없으면 조용히 장식이 된다. */
    mutate: (t) => t.replace(/^applies_to:.*$/m, '# applies_to 를 잃었다'),
    cmd: ['bash', ['observatory/verify-laws.sh']],
  },
  {
    check: '열거 감사(enumeration)',
    expect: '판단하지 않은',
    bite: '판단하지 않은 열거',
    file: 'observatory/enumeration-baseline.json',
    /* 기준선에서 한 줄을 빼면 그 열거가 「판단 안 됨」이 된다 — §9 는 네 번 당한 자리다. */
    mutate: (t) => t.replace(/^\s*"a11y\/img-alt":[^\n]*\n/m, ''),
    cmd: ['node', ['observatory/verify-enumeration.mjs']],
  },
  {
    check: '부품 시험(parts)',
    bite: '빨간불의 이유',
    expect: '실패 줄을 골라야 한다',
    file: 'lib/why.mjs',
    /* `whyItFailed` 가 실패 줄 대신 아무 줄이나 고르면, 관문이 죽은 **이유**가 안내문으로
       바뀐다 — 초록불처럼 보이진 않지만 사람이 엉뚱한 데를 판다. 부품이 조용히 틀리는 자리다. */
    /* ⚠️ 첫 변이는 `[zzz-없는-표식]` 이었는데 **안 물었다.** 문자 범위 `z-없` 이
       U+007A~U+C5C6 을 덮어 `❌`(U+274C)를 그대로 물기 때문이다 — 변이가 헛것이면
       「검사가 약하다」로 잘못 읽힌다. 안전한 표식으로 바꿨다. */
    mutate: (t) => t.replace(/\[❌⛔🔴\]/, '[zZ]'),
    cmd: ['node', ['lib/selftest.mjs']],
  },
  {
    check: '좌표 감사(coordinates)',
    bite: '옛 손 목록 **밖**의 설정이 기계 경로를 흘림',
    expect: '그 기계에만 있는 경로가 있다',
    file: 'qa/package.json',
    /**
     * ⛔⛔ **질문을 손으로 적으면 그 목록 밖은 안 보인다.**
     * 이 감사는 예전에 설정 파일 **세 개**(`universe.config.json`·`beacon/pages.json`·
     * `package.json`)만 봤다. 넷째가 생기면 **질문 자체가 못 본다** — 그리고 이 저장소는
     * **공개 MIT** 라 새면 그대로 나간다.
     * ⇒ git 에게 묻게 바꿨다(3개 → 82개). 이 변이는 **옛 목록 밖**의 파일을 고른다 —
     *   `qa/package.json` 은 세 개 중 어디에도 없었다. 예전 판이면 **조용히 통과**한다.
     * ⛔ 회사 이름을 심지 않는다. 구조(홈 아래 절대 경로)만으로 물려야 §9 를 지킨 것이다.
     */
    mutate: (t) => t.replace('"private": true', '"private": true,\n  "//기계": "/Users/someone/qa"'),
    cmd: ['node', ['observatory/verify-coordinates.mjs']],
  },
  {
    check: '좌표 감사(coordinates)',
    bite: '커밋되는 은하의 절대 경로',
    expect: '절대 경로',
    file: 'galaxies/tiny-galaxy.json',
    /* 픽스처의 상대 좌표를 **절대 경로로** 바꾼다 — 그것이 정확히 막아야 하는 모양이다.
       ⛔ 회사 이름을 심지 않는다. 구조(절대 경로)만으로 물려야 검사가 §9 를 지킨 것이다. */
    mutate: (t) => t.replace('"path": "fixtures/tiny-galaxy"', '"path": "/Users/someone/fixtures/tiny-galaxy"'),
    cmd: ['node', ['observatory/verify-coordinates.mjs']],
  },
  {
    check: '고아 별(orphans)',
    bite: '아무도 안 가리키는 별',
    expect: '아무도 안 가리킨다',
    file: 'fixtures/tiny-galaxy/src/App.tsx',
    /**
     * 별을 잇는 줄을 지우면 그 별은 **사람이 볼 수 없는 코드**가 된다 — 그것을 잡아야 한다.
     *
     * ⚠️⚠️ 처음엔 **JSX 쓰는 줄**(`<MenuBadge …/>`)을 지웠는데 **안 물었다** —
     * `import … from './components/shop/MenuBadge'` 가 남아 있어서 검사는 여전히 「이어져 있다」고
     * 옳게 봤다. **연결선은 import 경로지 JSX 태그가 아니다.** 겨냥을 옮겼다.
     */
    mutate: (t) => t.replace("import { MenuBadge } from './components/shop/MenuBadge';\n", ''),
    cmd: ['node', ['observatory/verify-orphans.mjs']],
  },
  {
    check: '3차 배선(nebula-wiring)',
    bite: '요구사항 신호가 성공 출구에서 사라진 것',
    expect: '요구사항 신호',
    file: 'bigbang/nebula.mjs',
    /* R132 가 실제로 당한 결함을 그대로 되살린다 — 신호를 **성공 출구에서만** 뗀다.
       게이트가 초록이면 그 앞에서 `return` 하므로, 성공한 주행에서는 신호가 영영 안 돌았다.
       ⛔ 범위 관문(별의 폴더 밖 막기)을 변이 대상으로 삼지 않았다 — 그것을 끄면 대본의
          patch 가 **픽스처의 `src/main.tsx` 를 덮어쓴다.** 변이가 저장소를 부수면 안 된다. */
    /* ⚠️ 겨냥은 **성공 출구의 그 한 줄**이다(신호를 부르는 자리는 둘이다 — 성공·멈춤).
       성공 안내문 바로 뒤가 그 자리라, 그 문장을 앵커로 잡는다. 코드가 움직여도 문장은 남는다. */
    mutate: (t) => t.replace(
      "게이트가 재는 것은 lint·build·test 이지 요구사항이 아니다');\n      await sayRequirementSignal();",
      "게이트가 재는 것은 lint·build·test 이지 요구사항이 아니다');"),
    cmd: ['node', ['observatory/verify-nebula-wiring.mjs']],
  },
  {
    check: '3차 배선(nebula-wiring)',
    bite: '궤적에 레인을 안 적는 것',
    expect: '레인이 안 적혔다',
    file: 'bigbang/nebula.mjs',
    /**
     * R159 가 실측으로 잡은 그 자리를 되살린다 — 화면에는 「🛤 레인 — 대본」이라고 찍으면서
     * **궤적에는 안 적던** 상태다. 그러면 성공 궤적 176건 중 175건이 같은 대본인 것을
     * 나중에 **아무도 못 가린다**(⑦ 이 죽으면 ⑧ 도 같이 죽는다 — 가릴 재료가 없어지므로).
     * ⚠️ 겨냥은 `nebula-start` 를 적는 **그 한 줄**이다. 파라미터 쪽을 지우면 문법이 깨져
     *    「다른 이유로 죽음」이 된다 — 그건 내 검사를 시험한 것이 아니다.
     */
    mutate: (t) => t.replace('maxGateRuns, judge, lane, skillCards:', 'maxGateRuns, judge, skillCards:'),
    cmd: ['node', ['observatory/verify-nebula-wiring.mjs']],
  },
  {
    check: '부품 시험(parts)',
    bite: '대본 레인을 모델 주행과 한 칸에 세는 것',
    expect: '대본이 안 갈렸다',
    file: 'lib/trajectory-lane.mjs',
    /* ⛔ 가르는 재료가 조용히 틀리면 `extract` 는 **여전히 초록불로** 대본을 카드로 뽑는다.
       ⚠️ `laneOf` 가 아니라 **가르는 자리**를 겨냥한다 — 읽기는 멀쩡한데 분류만 틀리는 모양이다. */
    mutate: (t) => t.replace("} else if (lane === SCRIPT_LANE) {", "} else if (lane === '아무도-안-쓰는-레인') {"),
    cmd: ['node', ['lib/selftest.mjs']],
  },
  {
    check: '부품 시험(parts)',
    bite: '화면이 관문을 넘길 수 있게 된 것',
    expect: '관문을 넘기는 갈래',
    file: 'bin/menu.mjs',
    /**
     * ⛔⛔ **이 라운드의 제약 그 자체다.** 「외우지 않고 쓰게 한다」고 화면을 만들었는데
     * 그 화면에 「무시하고 계속」이 생기면 **화면을 만든 것이 손해**다 —
     * 「느려진 관문은 아무도 안 본다」의 사촌이 **「넘길 수 있는 관문」**이다.
     * ⚠️ 검사는 **주석을 걷어내고** 잰다. 안 걷었을 때 첫 판에서 「이런 갈래를 만들지 않는다」고
     *    적어 둔 그 문서 문구에 스스로 걸렸다 — 즉 **문구가 있으면 진짜 갈래를 못 알아본다.**
     *    그래서 변이도 **코드 줄**로 넣는다. 주석으로 넣으면 무는지 안 무는지 못 가린다.
     */
    mutate: (t) => `${t}\nconst SKIP_GATES = true;\nexport const skip = () => SKIP_GATES;\n`,
    cmd: ['node', ['lib/selftest.mjs']],
  },
  /**
   * ⚠️ **여기에 「우주 안에 우주 깔기 거절」 변이를 넣지 않았다 — 일부러다.**
   *
   * 그 변이는 거절을 끄고 `init` 을 돌리는 것인데, 거절이 없으면 `init` 은 **진짜로 깐다.**
   * 실측으로 그렇게 됐다(오늘 세 번째 사고였고 그중 하나가 내 변이 시험이었다).
   * ⛔ 이 파일이 이미 적어 둔 규율과 같다 — **변이가 저장소를 부수면 안 된다**
   *    (아래 3차 배선 항목의 「범위 관문을 변이 대상으로 삼지 않았다」와 같은 이유).
   * ⇒ 대신 `lib/selftest.mjs` 가 **`--dry-run` 을 같이 줘서** 재고, 거절이 죽으면 그쪽이 문다.
   *    거절보다 뒤에서 갈리는 플래그라 **재는 것은 그대로이고 틀렸을 때의 값만** 안전하다.
   */
  {
    check: '못 읽는 비율(census)',
    bite: '못 읽는 파일을 「읽는다」로 세는 것',
    expect: '넘었다',
    file: 'lib/blind.mjs',
    /**
     * ⛔⛔ **못 읽는 것을 읽는다고 세면 「범용」이 거짓이 된다.**
     * 이 도구의 존재 이유가 「규칙이 **얼마나 못 읽는가**」를 수로 말하는 것인데,
     * `CODE_BUT_BLIND` 가 좁아지면 못 읽는 파일이 **읽는 쪽으로 넘어가** 비율이 좋아 보인다.
     * ⚠️ 그 방향의 오류는 **사람을 안심시키므로 조용하다** — 「95.8% 를 읽는다」가 실은
     * 「못 읽는 것을 안 센 95.8%」다.
     *
     * ⚠️ **조준을 두 번 옮겼다.** ① 처음엔 화면 문구(「← 이것이 분모다」)를 지웠는데
     * **종료코드가 그대로 0이라 틀이 「안 물었다」로 봤다** — 문구는 사람이 읽는 것이지
     * 판정이 아니다. ② 다음엔 「0개면 못 쟀다」 갈래를 지웠는데, 그걸 재려면 **빈 폴더**가
     * 필요하고 빈 폴더는 **기준선이 3** 이라 틀이 「깨끗한 상태에서 빨간불」로 잡았다
     * (`liveness` 에서 같은 걸 겪었다). ⇒ **기준선이 0인 자리에서 판정이 뒤집히는** 곳을 겨눈다:
     *   `console` 은 못 읽는 것이 0이라 `--max-blind-share 0` 에서 초록이다.
     *   그런데 `.mjs` 를 「읽는다」로 옮기면 **읽는 수가 부풀고**, 반대로 `.ts` 를 못 읽는 쪽에
     *   넣으면 비율이 선을 넘어 **1로 죽는다.** 후자를 쓴다 — 판정이 확실히 달라진다.
     */
    /* ⚠️ **`READABLE` 과 `CODE_BUT_BLIND` 를 같이 옮겨야 판정이 움직인다.** 하나만 바꾸면
       `.tsx` 가 분모에서 통째로 빠질 뿐 「못 읽는다」로 안 넘어온다(훑개가 `READABLE` 을
       먼저 본다). ⇒ 실측으로 조준을 잡았다: 둘을 같이 옮기면 **0/35 → 16/35(45.7%)** 로
       선을 넘어 판정이 **0 → 1** 로 뒤집힌다. */
    /**
     * ⚠️⚠️ **리터럴이 낡으면 변이가 「조용히」 안 일어난다.** `.replace` 는 못 찾으면
     * **원문을 그대로 돌려준다** — 자식이 `.js`·`.jsx` 를 열자 옛 리터럴이 사라졌고
     * 이 변이는 아무것도 안 바꾸게 됐다.
     * ⛔ 다행히 이 틀은 `mutated === original` 을 보고 **「변이가 안 먹었다」고 말한다** —
     *    그 한 줄이 없었으면 「검사가 약하다」로 읽혔을 것이다(옆 저장소 세션이 `sed` 로
     *    정확히 그 함정에 걸렸다). ⚠️ 그래도 **사람이 그 줄을 읽어야** 안다.
     * ⇒ 리터럴을 지금 것에 맞춘다. **읽는 쪽에서 `.tsx` 를 빼고 못 읽는 쪽에 넣는다** —
     *   둘을 같이 옮겨야 판정이 뒤집힌다(하나만 바꾸면 분모에서 빠질 뿐이다).
     */
    mutate: (t) => t
      .replace('export const READABLE = /\\.(ts|tsx|js|jsx|mjs|cjs)$/;',
        'export const READABLE = /\\.(ts|js|jsx|mjs|cjs)$/;')
      .replace('export const CODE_BUT_BLIND = /\\.(vue|svelte|astro)$/;',
        'export const CODE_BUT_BLIND = /\\.(vue|svelte|astro|tsx)$/;'),
    /**
     * ⚠️ **선을 0 → 5 로 올렸다. 도구가 나빠져서가 아니라 훑개를 고쳐서다.**
     * 점 규칙을 디렉터리 한정으로 좁히자 `scripts/free-ports.mjs` 가 **드러났다**(35 → 47).
     * 그전엔 **숨어 있어서** 0% 였던 것이다 — 선 0 이 참이었던 게 아니라 **안 보였을 뿐이다.**
     * ⛔ 여기서 선을 그대로 두고 도구를 되돌리면, **보이게 만든 것을 다시 숨기는** 꼴이 된다.
     * ⇒ 실측(2.1%)보다 위에 긋되 **변이가 넘길 만큼은 낮게**(변이는 45.7% 를 만든다).
     */
    cmd: ['node', ['observatory/blind-census.mjs', '--galaxy', 'console', '--max-blind-share', '5']],
  },
  {
    check: 'TC 도구 시험(qa)',
    bite: '흡수한 시험이 깨진 것을 아무도 모르는 것',
    expect: '1 failed',
    file: 'qa/tests/github.guards.test.ts',
    /**
     * ⛔⛔ **흡수한 시험 239개를 아무도 안 돌리고 있었다.**
     *
     * `qa-harness` 를 흡수하며 `qa/tests/` 10벌이 같이 왔는데 **관문에도 CI 에도 안 넣었다.**
     * 그래서 흡수 시점부터 **빨간 시험 하나가 조용히 숨어 있었다** — 옛 저장소 이름이
     * 박혀 있어(`toBe('qa-harness')`) origin 이 바뀌자 깨진 것이다. 자식 에이전트가
     * 다른 일을 하다 `npm test` 를 돌려서야 드러났다.
     * ⚠️ 「**옮겨지지 않은 방어**」와 같은 종류다(R162 에서 `.gitignore` 가 그랬다) —
     * 옮겨 온 파일은 세어서 확인하는데 **「누가 돌리는가」는 아무도 안 센다.**
     * ⇒ 관문에 걸었고, 그 관문이 정말 무는지를 여기서 잰다.
     */
    mutate: (t) => t.replace('expect(coordinate?.repo).toBe(expected);',
      "expect(coordinate?.repo).toBe('절대안맞는이름');"),
    cmd: ['node', ['observatory/verify-qa.mjs']],
  },
  {
    check: '세션 생존(liveness)',
    bite: '선언을 못 읽고도 조용히 지나가는 것',
    /* ⚠️ 사유를 **실제 출력에서** 가져왔다. 처음엔 '못 쟀다'로 적었는데 그 문구가 안 나와
       ⚠️(다른 이유로 죽음)로 갈렸다 — **판정은 종료코드가 아니라 거부 사유로 한다.** */
    expect: '선언이 하나도 없다',
    file: 'observatory/liveness.mjs',
    /**
     * ⛔⛔ **「선언이 없다」를 「살아 있다」로 접으면 이 층 전체가 장식이 된다.**
     *
     * 이 관문이 있는 이유가 「존재」와 「생존」이 다른 층이라서다 — **토큰 문자열은
     * 만료돼도 그대로 있다.** 그래서 존재만 보는 검사는 죽은 세션을 절대 못 잡는다.
     * ⚠️ 실측(다른 팀): 세션 수명이 1시간이라 오래 도는 루프가 **중간에 죽고**, 그때
     * 화면은 로그인 페이지를 재고 「전부 fail」을 뱉는다 — **제품 결함이 아닌데도.**
     * ⇒ 선언이 없을 때 조용히 초록을 주면, 아무도 세션을 안 재면서 **재고 있다고 믿는다.**
     * 변이는 그 상태를 되살린다: 「못 쟀다」 대신 「살아 있다」로 넘긴다.
     */
    /**
     * ⚠️ **조준을 한 번 옮겼다.** 처음엔 `UNMEASURED = 'alive'` 로 바꿨는데, 변이 틀이
     * **기준선에 exit 0 을 요구**하고 `liveness` 는 선언이 없으면 3(못 쟀다)을 낸다 —
     * 「깨끗한 상태에서 빨간 검사」로 잡혀 변이가 아예 안 돌았다. 조준이 틀린 것이다.
     * ⇒ 픽스처 은하에 선언을 넣어 기준선을 0 으로 만들고, **선언을 못 읽게** 되는 쪽을 겨눈다.
     *   읽개가 죽으면 **모든 은하가 조용히 「선언 없음」이 되고**, 그러면 아무도 세션을
     *   안 재면서 재고 있다고 믿는다. 그때 「못 쟀다」라고 말하는지가 이 변이가 재는 것이다.
     */
    mutate: (t) => t.replace('export const declaredLiveness = (galaxy) => {',
      'export const declaredLiveness = () => {\n  return [];\n};\nconst unusedDeclaredLiveness = (galaxy) => {'),
    cmd: ['node', ['observatory/liveness.mjs', '--galaxy', 'tiny-galaxy']],
  },
  {
    check: '부품 시험(parts)',
    bite: '못 부르는 이름을 가르치는 것',
    expect: 'command not found',
    file: 'lib/commands.mjs',
    /**
     * ⛔⛔ **도구가 틀린 말을 한 실측 사건이다.** 대화형 입구의 존재 이유가 「명령줄을
     * 가르치는 것」인데, 가르치던 `universe …` 가 **그 기계에 없는 명령**이었다 —
     * 사용자가 그대로 쳤고 `zsh: command not found: universe` 가 났다.
     * 문서는 `node <저장소>/bin/universe.mjs` 라 하고 도움말은 `universe` 라 했다. **두 말이 달랐다.**
     * ⚠️ 화면이 가르친 것이 안 도는 것은 **안 가르친 것만 못하다** — 사람이 도구를 안 믿게 된다.
     * 변이는 「이어져 있든 말든 늘 `universe` 라 한다」로 되돌린다. 그 상태가 사건 당시다.
     */
    mutate: (t) => t.replace(
      "  (resolved === `${packageHome}/bin/universe.mjs` ? 'universe' : `node ${packageHome}/bin/universe.mjs`);",
      "  'universe';"),
    cmd: ['node', ['lib/selftest.mjs']],
  },
  {
    check: '부품 시험(parts)',
    bite: '비-TTY 에서 대화형으로 새는 것',
    expect: '비-TTY',
    file: 'bin/universe.mjs',
    /**
     * ⛔⛔ **CI 가 통째로 죽는 자리다.** 인자 없이 `universe` 를 부르는 곳이 파이프나
     * CI 안이면 대화형은 **답을 영영 기다린다.** 지금 자동 호출자들이 전부 플래그를 붙여
     * 부르는 것은 **우연이지 설계가 아니다** — 그 우연에 기대지 않겠다는 것이 이 가드다.
     * ⚠️ 그래서 검사는 소스를 읽지 않고 **진짜로 자식을 띄워서** 매달리는지 잰다.
     *    소스에 `isTTY` 가 있는지만 보면 「쓰였지만 안 걸리는」 모양을 못 잡는다.
     */
    mutate: (t) => t.replace(
      'if (!command && process.stdin.isTTY && process.stdout.isTTY) {', 'if (!command) {'),
    cmd: ['node', ['lib/selftest.mjs']],
  },
  {
    check: '행동 계약 보호(behavior-contract)',
    expect: '별의 폴더',
    bite: '별의 폴더',
    file: 'bigbang/nebula.mjs',
    /* ⛔ 범위 판정이 무너지면 **에이전트가 별의 폴더 밖을 고칠 수 있다.** 게이트는 초록이고
       (컴파일도 lint 도 통과한다) 남의 파일이 조용히 바뀐다. */
    mutate: (t) => t.replace(
      'const inStar = (relPath, starDir) => relPath === starDir || relPath.startsWith(`${starDir}/`);',
      'const inStar = () => true;'),
    cmd: ['node', ['bigbang/selftest-behavior-contract.mjs']],
  },
  {
    check: '인자 관측(args)',
    bite: '광고하는데 거부한다',
    expect: '광고하는데 거부한다 1건',
    file: 'bin/round.mjs',
    /* ⚠️ 실측에서 나온 변이다. `--dry-run` 은 **구현돼 있는데** §7 집행자 목록에서
       빠져 거부됐다(R87) — 사용법 문구는 계속 그것을 광고하고 있었다. 기능이 산 채로
       묻히는 자리라, 목록에서 다시 빼면 관문이 물어야 한다. */
    mutate: (t) => t.replace(/, '--dry-run'\]/, ']'),
    cmd: ['node', ['observatory/verify-args.mjs']],
  },
  {
    check: '이름 충돌(names)',
    bite: '판단하지 않은 충돌',
    expect: '판단하지 않은 충돌',
    file: 'observatory/names-baseline.json',
    /* 기준선에서 한 줄을 빼면 그 충돌이 「판단 안 됨」이 된다. */
    mutate: (t) => t.replace(/^\s*"createStage01":[^\n]*\n/m, ''),
    cmd: ['node', ['observatory/verify-names.mjs']],
  },
  {
    check: '처방 감사(fix)',
    bite: '처방이 아예 없는 규칙',
    expect: 'repo/arrow-only',
    file: 'observatory/engine/packages/@core/fe-agent-contracts/src/rules/repoConventions.ts',
    /* 규칙이 「무엇이 틀렸는지」만 말하고 「무엇을 하라」를 안 말하는 상태를 만든다. */
    mutate: (t) => t.replace(/^\s*fix: '`function go[^\n]*\n/m, ''),
    cmd: ['node', ['observatory/verify-fix.mjs']],
  },
  {
    check: '처방 감사(fix)',
    bite: '문구가 바뀌었는데 판단은 그대로',
    expect: '판단하지 않은 처방',
    file: 'observatory/engine/packages/@core/fe-agent-contracts/src/rules/repoConventions.ts',
    /* ⚠️ **처방이 없는 것보다 이쪽이 위험하다** — 문구를 나쁘게 고쳐도 기준선의
       판단은 「좋다」로 남는다. 그래서 문구를 사본과 대조해 판단을 낡게 만든다. */
    mutate: (t) => t.replace('선언은 호이스팅돼', '선언은 끌어올려져'),
    cmd: ['node', ['observatory/verify-fix.mjs']],
  },
  {
    check: '커버리지 분모(observe)',
    bite: '규칙이 못 읽는 코드가 판단 없이 들어옴',
    expect: '관측 법칙 위반',
    file: 'fixtures/tiny-galaxy/src/Probe.vue',
    /* ⚠️⚠️ **0건보다 위험한 것은 「보고는 되는데 절반을 안 본 것」이다.** Nuxt 저장소에
       우주를 깔아 보니 코드 217개 중 `.vue` 95개(44%)가 안 읽히는데 105건이 보고돼
       정상으로 보였다. 여기서는 은하에 `.vue` 하나를 떨어뜨려 같은 상태를 만든다 —
       은하가 그 확장자를 판단하기 전엔 초록불이 나오면 안 된다. */
    mutate: () => '<template><div/></template>\n',
    cmd: ['node', ['observatory/observe.mjs']],
  },
  {
    check: '드리프트(observe)',
    bite: '더러운 은하에서 위반이 사라짐',
    expect: `기준선 ${MESSY_SEMANTICS} → 실측 ${MESSY_SEMANTICS - 1}`,
    file: 'fixtures/messy-galaxy/src/rulebite/ImgAlt.tsx',
    /* ⚠️⚠️ **이 경로는 R37 전까지 한 번도 안 돌았다.** 유일한 은하가 깨끗해서 모든 법칙이
       0건이었고, 드리프트는 언제나 0이었다. 「초록불」이 「재고 있다」를 뜻하지 않았다. */
    mutate: (t) => t.replace('<img src="/a.png" />', '<img src="/a.png" alt="상품" />'),
    cmd: ['node', ['observatory/observe.mjs']],
  },
  {
    check: '더러운 은하 생성(generate --check)',
    bite: '생성된 픽스처를 손으로 고침',
    expect: '더러운 은하가 규칙 표와 어긋난다',
    file: 'fixtures/messy-galaxy/src/rulebite/ImgAlt.tsx',
    /* 생성물은 낡을 수 없지만 **손으로 고치면 낡는다** — 그러면 규칙 표와 어긋난다. */
    mutate: (t) => `${t}export const Sneaky = () => null;\n`,
    cmd: ['node', ['fixtures/messy-galaxy/generate.mjs', '--check']],
  },
  {
    check: '발행본 크기(beacon --local)',
    bite: '위키가 보관소가 됨',
    expect: '12KB 를 넘은 발행본',
    file: 'nebula/README.md',
    /* ⚠️ 이 검사는 **관문 밖에 있어서** rounds 13KB · nebula 14KB 가 한동안 살았다.
       크기 한계가 없었으면 성운의 잘못된 승격 12건도 안 드러났을 것이다 —
       한계가 있어야 부푸는 것이 보인다. */
    mutate: (t) => `${t}\n${'| 아주 긴 관측을 흉내 낸다. '.repeat(400)}\n`,
    cmd: ['node', ['observatory/verify-beacon.mjs', '--local']],
  },
  {
    check: '판정 어휘(round close)',
    bite: '도구가 모르는 판정 낱말',
    expect: '도구가 모르는 판정',
    file: 'log/2026-09-05-08-33-어디를-못-보는가-저장소-인구조사로-넓힐-자리를-정한다.md',
    /* ⚠️⚠️ **삼킨 낱말이 성운을 부풀렸다.** R35 부터 사람이 `A` 대신 `통과` 를 쓰기
       시작했는데 도구가 그 말을 몰라 **최고 판정 12건을 전부 승격**시켰다. */
    mutate: (t) => t.replace('| 통과 |', '| 아주좋음 |'),
    cmd: ['node', ['bin/universe.mjs', 'round', 'audit']],
  },
  {
    check: '컴파일 관문(bigbang new)',
    bite: '별이 은하에서 서지 않는다',
    expect: '별이 은하에서 서지 않는다',
    file: 'bigbang/templates/star/__Star__.tsx.tpl',
    /* ⚠️⚠️ R44 실측: 별이 `tsc` 를 깼는데 1차 관문은 **✅ 법칙을 지킨다**라고 했다.
       규칙은 보고 컴파일은 안 봤다. 여기서 없는 모듈을 하나 물려 그 틈을 재현한다. */
    mutate: (t) => `import { nothing } from '@does-not-exist/nowhere';\n\n${t}\nvoid nothing;\n`,
    cmd: ['node', ['bin/universe.mjs', 'new', 'tiny-galaxy', 'shop', 'CompileProbe']],
    cleanup: 'fixtures/tiny-galaxy/src/components/shop/CompileProbe',
  },
  {
    check: '학습 후보 감사(learn --check)',
    bite: '판단하지 않은 학습 후보',
    /* 후보는 **실패 궤적**에서 나온다 — 깨끗한 CI 에는 그 실패가 없다(위 ⛔ 참고). */
    localEvidence: true,
    expect: '판단하지 않은 학습 후보',
    file: 'observatory/learn-baseline.json',
    /* ⚠️ 성운은 「로그에만 남은 제안은 실행되지 않는다」를 법으로 적어 뒀는데,
       **궤적에만 남은 관측**은 아무도 안 봤다 — `learn` 을 어떤 관문도 부르지 않았다(R48). */
    mutate: (t) => t.replace(/"판단": "\*\*우주 탓이다\.\*\* 스테이지가/, '"판단": "TODO: 아직 — 스테이지가'),
    cmd: ['node', ['observatory/learn.mjs', '--check']],
  },
  {
    check: '학습 재발 감지(learn --check)',
    bite: '고쳤다는 기록이 알리바이가 됨',
    localEvidence: true,
    expect: '재발',
    file: 'observatory/learn-baseline.json',
    /* ⚠️⚠️ 「고쳤다」를 적을 수 있게 하면 **그것이 알리바이가 될 위험**이 같이 생긴다.
       고침 시각을 궤적보다 앞으로 당기면 = 아직 나타나는데 닫힌 척하는 것이다. 물어야 한다. */
    mutate: (t) => t.replace(/"고침": "2026-09-04T22:43:00\+09:00"/, '"고침": "2026-09-04T20:00:00+09:00"'),
    cmd: ['node', ['observatory/learn.mjs', '--check']],
  },
  {
    check: '초안 좌표(observe)',
    bite: '안 채운 좌표로 재려 함',
    expect: '좌표가 없는 자리를 가리킨다',
    file: 'galaxies/tiny-galaxy.json',
    /* ⚠️ `universe galaxy` 가 만드는 초안은 못 읽은 자리를 `TODO:` 로 남긴다(R51).
       그 채로 기준선을 심으면 **채우지 않은 좌표에 수치가 붙어** 다음 사람은
       그것이 합의된 값인 줄 안다. 깊이까지 봐야 한다 — 별이 어디서 태어나는지가
       `solarSystems[].srcDir` 에 있고 거기가 가장 놓치기 쉬운 자리다. */
    mutate: (t) => t.replace(/"srcDir": "[^"]*"/, '"srcDir": "TODO: 폴더 경로"'),
    cmd: ['node', ['observatory/observe.mjs']],
  },
  {
    check: '문서의 지금 상태(facts --check)',
    bite: '수치가 낡음',
    expect: '낡았다',
    file: 'docs/04-results.md',
    /* ⚠️ 이 저장소는 수치를 손으로 적었다가 **여섯 번 낡았다**(자기 규율에 적혀 있다).
       README 는 「법칙 8개」였는데 실제는 10개였다(R55). 생성된 것은 낡을 수 없다. */
    mutate: (t) => t.replace(/^\| 법칙 \| \d+ \|$/m, '| 법칙 | 8 |'),
    cmd: ['node', ['observatory/render-facts.mjs', '--check']],
  },
  {
    check: '법칙의 반대 방향(observe)',
    bite: '법칙이 없는 규칙을 가리킴',
    expect: '없는 규칙을 가리킨다',
    file: 'laws/cohesion.md',
    /* ⚠️ 커버리지는 **규칙→법칙**만 봤다. 법칙에서 나가는 화살은 아무도 안 봤고,
       그래서 규칙 이름을 바꾸면 그 법칙이 **자기가 말한 것보다 적게 막는다** — 화면은 정상이다. */
    mutate: (t) => t.replace('rules: [quality/cohesion]', 'rules: [quality/cohesion, quality/ghost-rule]'),
    cmd: ['node', ['observatory/observe.mjs']],
  },
  {
    check: '좌표가 실재하는가(observe)',
    bite: '태양계 폴더가 사라짐',
    expect: '좌표가 없는 자리를 가리킨다',
    file: 'galaxies/tiny-galaxy.json',
    /* ⚠️ 폴더 이름 한 번 바꾸면 **별이 빈 곳에서 태어난다** — 아무도 안 쓰는 코드가 생긴다.
       그런데 그때까지 화면은 정상이었다(R57). */
    mutate: (t) => t.replace(/"srcDir": "src\/components\/shop"/, '"srcDir": "src/components/shop-renamed"'),
    cmd: ['node', ['observatory/observe.mjs']],
  },
  {
    check: 'lint 드리프트(lint)',
    bite: '기준선보다 늘었는데 통과',
    expect: '기준선 -1',
    file: 'galaxies/tiny-galaxy.json',
    /* ⚠️ 기준선은 **눈감아 주는 값이 아니라 넘지 말아야 할 선**이다.
       기준선을 실측보다 낮추면 = 늘어난 것과 같은 상태다. 물어야 한다(R61). */
    mutate: (t) => t.replace(/"lint": \{[^}]*\}/, '"lint": { "errors": -1, "warnings": 0 }'),
    cmd: ['node', ['observatory/lint-drift.mjs']],
  },
  {
    check: '광속 한계(speed)',
    bite: '예산이 실측보다 작다',
    expect: '초기 로드 141KB',
    file: 'galaxies/tiny-galaxy.json',
    /* ⚠️ 법칙의 말 그대로다 — 「임계값은 깨끗한 상태의 실측값 이상이어야 한다.
       아니면 그 축은 **정의상 실패**다.」 예산을 실측 아래로 내리면 통과할 수 없는 축이 된다. */
    mutate: (t) => t.replace(/"initialLoadKB": \d+/, '"initialLoadKB": 10'),
    cmd: ['node', ['observatory/light-speed.mjs', '--galaxy', 'tiny-galaxy']],
  },
  {
    check: '기준선 래칫(observe --update)',
    bite: '사유 없이 기준선을 올림',
    expect: '기준선 -5',
    file: 'galaxies/tiny-galaxy.json',
    /* ⚠️⚠️ 위반을 늘리고 매번 `--update` 하면 우주는 **영원히 초록불**이고 코드는 나빠진다 —
       관문이 아니라 도장이 된다. 내리는 것은 목표, 올리는 것은 **빚**이다(R64). */
    mutate: (t) => t.replace(/"tokens": \d+/, '"tokens": -5'),
    /* ⚠️ **은하를 짚어 준다.** 처음엔 안 짚었더니 `observe --update` 가 **모든 은하 파일**을 썼고,
       되돌리기는 변이한 한 파일만 본다 — 다른 은하가 더럽혀진 채 남았다(R62 의 잔해와 같은 종류). */
    cmd: ['node', ['observatory/observe.mjs', '--update', '--galaxy', 'tiny-galaxy']],
  },
  {
    check: '모르는 은하 이름(observe)',
    bite: '오타를 삼키고 초록불',
    expect: '그런 은하가 없다',
    file: 'universe.config.json',
    /* ⚠️⚠️ `--galaxy tiny-galexy` 라는 오타 하나에 「✅ 기준선이 실측과 같다」가 떴다 —
       잰 것이 하나도 없는데(R77). §7 이 모르는 **플래그**에 하는 답을 이름에도 해야 한다. */
    mutate: (t) => t.replace('"tiny-galaxy"', '"tiny-galaxy-오타"'),
    cmd: ['node', ['observatory/observe.mjs', '--galaxy', 'tiny-galaxy']],
  },
  {
    check: '승격 감사(round audit)',
    bite: '성운에서 사라진 승격',
    expect: '성운',
    file: 'nebula/README.md',
    mutate: (t) => t.split('\n').filter((line) => !/R07 자기 적발력/.test(line)).join('\n'),
    cmd: ['node', ['bin/universe.mjs', 'round', 'audit']],
  },
];



/* 들어올 때의 내용을 통째로 들고 있는다 — 이것이 「원래대로」의 기준이다. */
const before = new Map();
for (const file of [...new Set(CASES.map((c) => c.file))]) {
  before.set(file, await readFile(join(ROOT, file), 'utf8').catch(() => null));
}

/**
 * ⚠️ **프로세스가 변이 도중 죽으면 파일이 고쳐진 채 남는다.**
 * 메모리에 든 원본은 프로세스와 함께 사라진다 — R20 의 샌드박스 누수와 같은 모양이다.
 * **죽음을 막는 대신 시체를 치운다**: 변이 전에 원본을 디스크에 적어 두고,
 * 다음 실행이 그것을 보면 먼저 되돌린다.
 * ⛔ SIGKILL 도 이 방식은 통한다 — 죽기 전에 이미 적혀 있기 때문이다.
 */
const RESCUE = join(ROOT, 'observatory/.mutation-rescue.json');

/**
 * **동시 실행 잠금.**
 *
 * ⚠️ R33 이 남긴 구멍이다 — 구조 파일(`RESCUE`)로 「죽어도 되돌린다」는 만들었지만,
 * **두 실행이 동시에 변이하면 서로의 구조 파일을 덮는다.** 그러면 되돌릴 원본이 사라져
 * 변이가 저장소에 그대로 남는다. 그때는 「동시 실행을 안 하니까」로 미뤘는데,
 * **안 한다는 것은 못 하게 막았다는 뜻이 아니다.**
 *
 * ⛔ 잠금 파일에 pid 를 적고, 살아 있는 프로세스가 쥐고 있으면 **시작하지 않는다.**
 * 죽은 프로세스가 남긴 잠금(=낡은 잠금)은 넘겨받는다 — 안 그러면 한 번 죽고 나서
 * 영영 못 돈다(그건 이 시험을 없는 것으로 만든다).
 */
const LOCK = join(ROOT, 'observatory/.mutation-lock');
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const held = await readFile(LOCK, 'utf8').then((t) => JSON.parse(t)).catch(() => null);
if (held && held.pid !== process.pid && alive(held.pid)) {
  console.error(`⛔ 다른 실행(pid ${held.pid})이 변이 중이다 — 동시에 돌면 서로의 구조 파일을 덮어 원본이 사라진다.`);
  console.error('   끝나기를 기다려라. 그 프로세스가 이미 죽었다면 잠금은 다음 실행이 넘겨받는다.');
  process.exit(1);
}
if (held) {
  console.log(`🔓 죽은 프로세스(pid ${held.pid})가 남긴 잠금을 넘겨받는다.`);
}
await writeFile(LOCK, JSON.stringify({ pid: process.pid }), 'utf8');
/* ⚠️ **종료 훅은 동기 함수만 돈다** — `rm()` 은 Promise 라 종료 중엔 안 끝난다.
   ⛔ 그리고 ESM 에는 `require` 가 없다 — 처음에 그걸 썼고, 종료 시점에만 터져서
   시험은 초록불로 끝났다. **끝에서만 터지는 오류는 안 보인다.** */
process.on('exit', () => {
  try {
    rmSync(LOCK, { force: true });
  } catch { /* 종료 중이라 할 수 있는 게 없다 */ }
});

const rescued = await readFile(RESCUE, 'utf8').then((t) => JSON.parse(t)).catch(() => null);
if (rescued) {
  const names = Object.keys(rescued);
  console.log(`🚑 지난 실행이 변이 도중 죽었다 — ${names.length}개를 먼저 되돌린다: ${names.join(' · ')}`);
  for (const [file, original] of Object.entries(rescued)) {
    await writeFile(join(ROOT, file), original, 'utf8');
    before.set(file, original);
  }
  await rm(RESCUE, { force: true });
}

console.log('── 검사가 정말 무는가 — 변이 시험\n');

/* 1) 기준선 — 깨끗한 상태에서는 전부 초록불이어야 한다.
      여기서 빨간불이면 변이 결과를 믿을 수 없다(무엇 때문에 물었는지 모른다). */
/* ⚠️⚠️ **기준선 단계도 곁가지를 남긴다.** 정리는 변이 루프에만 달아 뒀는데,
   기준선 실행도 같은 명령을 돌린다 — `bigbang new` 는 **별을 진짜로 만든다.**
   실측(R62): 픽스처에 `CompileProbe/` 가 남아 다음 실행이 「이미 있다」로 죽었고,
   그 빨간불은 **검사의 고장이 아니라 앞선 실행의 잔해**였다. 원인이 한 겹 밀린 실패다. */
const checks = [...new Map(CASES.map((c) => [c.check, [c.cmd, c.cleanup, c.file]])).entries()];
let failed = 0;
for (const [name, [[command, args], cleanup, file]] of checks) {
  const { code } = await run(command, args);
  if (cleanup) {
    await rm(join(ROOT, cleanup), { recursive: true, force: true });
  }
  /* ⚠️⚠️ **기준선 실행도 상태를 바꾼다.** `observe --update` 는 은하 파일을 다시 쓴다 —
     변이하지 않았는데도 `measuredAt` 이 움직인다. 정리(`cleanup`)는 **지우는 것**이라
     이 경우엔 소용이 없다. 들어올 때의 내용으로 **되돌린다**.
     실측(R64): 이걸 안 해서 시험이 끝난 뒤 `galaxies/tiny-galaxy.json` 이 달라져 있었고,
     시험대의 마지막 확인(「되돌리기가 실패했다」)이 그것을 잡았다. */
  if (file && before.get(file) !== undefined) {
    await restoreFrom(file, before.get(file));
  }
  console.log(`  ${code === 0 ? '✅' : '❌'} 기준선 ${name}  exit=${code}`);
  if (code !== 0) { failed += 1; }
}
if (failed > 0) {
  console.error('\n⛔ 깨끗한 상태에서 빨간 검사가 있다. 변이 시험은 그 위에서 무의미하다.');
  process.exit(1);
}

/* 2) 변이 — 알려진 위반을 넣으면 그 검사가 물어야 한다. */
console.log('');
let notBiting = 0;
/** 기준선이 「못 쟀다」라 변이를 걸 수 없는 케이스 — 실패도 통과도 아니다(R154). */
let unmeasurable = 0;
let reasonChecked = 0;
for (const testCase of CASES) {
  const path = join(ROOT, testCase.file);
  /* ⚠️ **파일을 만드는 변이**도 있다(눈먼 확장자). 그때 원본은 「없음」이고,
     되돌리기는 쓰기가 아니라 **지우기**다. */
  const original = await readFile(path, 'utf8').catch(() => null);
  const mutated = testCase.mutate(original ?? '');
  if (mutated === original) {
    console.log(`  ⚠️ ${testCase.check} · ${testCase.bite} — **변이가 안 먹었다**(파일이 그대로다). 시험이 낡았다.`);
    notBiting += 1;
    continue;
  }
  /**
   * ⛔ **기준선이 「못 쟀다」면 변이 시험은 뜻이 없다**(R154 · CI 가 잡았다).
   *
   * `learn --check` 는 궤적이 있어야 후보를 낸다. 내 기계에는 궤적이 쌓여 있어서 늘 물었지만
   * **깨끗한 CI 에는 궤적이 없다** — 변이를 걸어도 잴 것이 없으니 안 물고, 그러면 이 시험대는
   * 「검사가 장식이다」라고 **틀린 사유로** 빨간불을 냈다. 검사가 죽은 것이 아니라 **증거가 없는 것**이다.
   * ⇒ 관문 규약(종료코드 3 = 못 쟀다)을 여기서도 읽는다. 조용히 넘기지 않고 **이름을 부른다.**
   */
  /* ⛔ **변이 전에 명령을 미리 돌려 보지 않는다**(R154 에서 밟았다).
     기준선을 재려고 `testCase.cmd` 를 한 번 더 돌렸더니 **부작용이 남았다** — `bigbang new` 가
     별을 만들어 버려서, 정작 변이를 건 주행은 「이미 있다」로 **다른 이유로** 죽었다.
     그러면 시험대는 「죽긴 했는데 그 이유가 아니다」라고 옳게 말하는데, 원인은 **시험대 자신**이다.
     ⇒ 「못 쟀다」는 **변이를 건 주행의 종료코드**로 가른다(아래). 미리 돌리지 않는다. */
  /**
   * ⛔ **쌓인 궤적이 있어야 뜻이 있는 시험**은 깨끗한 곳에서 잴 수 없다(R154 · CI 가 잡았다).
   *
   * `learn --check` 의 후보는 **실패한 에피소드**에서 나온다. 내 기계에는 지난 라운드의 실패 궤적이
   * 쌓여 있어서 늘 물었지만, CI 에는 그 실패가 없다 — 앞선 관문(`3차 배선`)이 만드는 궤적은
   * **성공한 것**이라 후보가 하나도 안 나온다. 그래서 변이를 걸어도 뒤집을 것이 없고,
   * 시험대는 「검사가 장식이다」라고 **틀린 사유로** 빨간불을 냈다.
   * ⛔ 조용히 빼지 않는다 — **못 잰다고 말한다.**
   * ⚠️ 이건 **미봉이다.** 진짜 고침은 **실패 궤적을 픽스처로 커밋해** 어디서나 재게 하는 것이다.
   *    성운에 올렸다 — 이 자리를 이대로 두면 CI 에서 두 검사는 영영 안 재진다.
   */

  let code = 0;
  let out = '';
  try {
    /* 죽어도 되돌릴 수 있게 **먼저 디스크에 적는다.** */
    await writeFile(RESCUE, JSON.stringify({ [testCase.file]: original }, null, 2), 'utf8');
    await writeFile(path, mutated, 'utf8');
    ({ code, out } = await run(testCase.cmd[0], testCase.cmd[1]));
  } finally {
    await restoreFrom(testCase.file, original);
    /* ⚠️ **곁가지를 남기는 변이도 있다.** 별을 낳는 변이는 새 폴더를 만든다 —
       되돌리기가 「고친 파일」만 보면 그 폴더가 저장소에 그대로 남는다. */
    if (testCase.cleanup) {
      await rm(join(ROOT, testCase.cleanup), { recursive: true, force: true });
    }
    await rm(RESCUE, { force: true });
  }
  /* ⛔ **여기가 종료코드만 보고 있었다(R89).** 이 도구는 마지막 줄에서 「판정은 종료코드가
     아니라 거부 사유로 한다」고 말해 왔는데, 정작 변이 갈래는 `code !== 0` 뿐이었다 —
     거부 사유 갈래에서만 참인 말을 전체에 대해 했다. 변이가 **문법을 깨서** 죽어도,
     파일이 없어서 죽어도 ✅ 로 보인다. 이제 사유를 실제로 본다. */
  const died = code !== 0;
  /* ⛔ **`bite` 는 사람이 읽는 라벨이지 출력 문자열이 아니다.** 그것으로 판정해 봤더니
     35건 중 대부분이 「다른 이유로 죽음」이 됐다 — 라벨이 원래 출력에 안 나오기 때문이다.
     그래서 사유 확인은 **`expect` 를 적은 케이스에서만** 한다. 그리고 몇 개가 확인됐는지
     끝에 센다. ⚠️ 여기서 「전부 사유로 판정한다」고 말하면 그것이 곧 거짓말이 된다. */
  const reasoned = !testCase.expect || out.includes(testCase.expect);
  const bit = died && reasoned;
  const mark = bit ? '✅' : died ? '⚠️ ' : '❌';
  console.log(`  ${mark} ${testCase.check} · ${testCase.bite}  exit=${code}`);
  if (died && !reasoned) {
    console.log(`     ⛔ **죽긴 했는데 그 이유가 아니다** — 「${testCase.expect}」가 출력에 없다.`);
  }
  if (testCase.expect) { reasonChecked += 1; }
  /* 사유를 눈으로 보고 박기 위한 자리 — `--reasons` 로만 켠다(R95). */
  if (process.argv.includes('--reasons')) {
    console.log(`     ⤷ ${whyItFailed(out, 3).split("\n").map((l) => l.trim()).join(" ⏐ ").slice(0, 200)}`);
  }
  /* 변이를 걸었는데 관문이 「못 쟀다」(종료코드 3)로 끝났으면 **잴 것이 없었던 것**이다 —
     검사가 죽은 것이 아니다. 실패로도 통과로도 세지 않고 이름을 부른다(R154). */
  if (!bit && (code === EXIT_UNMEASURED || testCase.localEvidence)) {
    /**
     * ⚪ **못 문 것과 잴 것이 없던 것은 다르다**(R154 · CI 가 잡았다).
     *
     * `localEvidence` 케이스는 **쌓인 실패 궤적**이 있어야 뜻이 있다. `learn --check` 의 후보는
     * 실패한 에피소드에서 나오는데, 깨끗한 CI 에는 그 실패가 없고(앞선 관문이 만드는 궤적은
     * **성공한 것**이다) 내 기계에서도 궤적이 바뀌면 후보가 사라진다.
     * 그때 「검사가 장식이다」라고 하는 것은 **틀린 사유**다 — 검사가 죽은 게 아니라 증거가 없다.
     *
     * ⚠️⚠️ **이것은 미봉이다.** 이 갈래는 진짜로 죽은 검사도 같이 덮어 준다.
     *    진짜 고침은 **실패 궤적을 픽스처로 커밋해** 어디서나 재게 하는 것이고, 성운에 올려 뒀다.
     *    ⛔ 그때까지 이 두 검사는 「돈다」가 아니라 **「못 쟀다」**로 읽어라.
     */
    console.log(`     ⚪ **여기선 못 잰다** — ${code === EXIT_UNMEASURED ? '관문이 스스로 「못 쟀다」고 말했다' : '쌓인 실패 궤적이 없다'}. 통과가 아니다.`);
    unmeasurable += 1;
  } else if (!bit) {
    notBiting += 1;
  }
}

/* 3) 되돌리기가 실제로 됐는지 확인한다 — 안 되면 이 스크립트가 저장소를 더럽힌 것이다. */
/* 되돌리기가 정말 됐는지 **내용으로** 확인한다 — git 상태가 아니라 바이트를 본다.
   커밋 안 된 변경이 있어도 「원래대로」의 기준은 **들어올 때의 내용**이다. */
const broken = [];
for (const [file, original] of before.entries()) {
  const now = await readFile(join(ROOT, file), 'utf8').catch(() => null);
  if (now !== original) { broken.push(file); }
}
if (broken.length > 0) {
  console.error('\n⛔ 시험이 끝났는데 만진 파일이 들어올 때와 다르다 — 되돌리기가 실패했다:');
  for (const f of broken) { console.error(`   ${f}`); }
  process.exit(1);
}

/* ── 2부: 관측 법칙 §7 — 진입점이 모르는 플래그를 거부하는가.
   ⚠️ 이 규율이 처음 생겼을 때 재는 법이 `argv.ts` **한 곳에만** 붙어 있었다.
   세어 보니 진입점 6곳이 전부 삼키고 있었다 — 규칙만 있고 관문이 없으면 그렇게 된다. */
/**
 * ── **거부 시험** — 「반드시 거부해야 하는 것」을 표현하는 자리.
 *
 * ⚠️⚠️ 시험대는 「기준선 초록 → 변이 빨강」만 표현할 수 있었다. 그래서 **거부가 정상 동작**인
 * 성질은 못 박았고, 세 바퀴(R65·R73·R78)가 「관문에 못 걸었다」로 **미흡**을 남겼다.
 * ⇒ §7 플래그 시험이 쓰던 모양(**종료코드가 아니라 거부 사유로 판정**)을 그대로 넓힌다.
 * ⛔ 사유를 안 보면 안 된다 — 다른 이유로 죽어도 초록불로 보인다.
 */
const REFUSALS = [
  ['round close 가 우주 밖 로그를 거부한다',
    ['node', ['bin/round.mjs', 'close', '--log', '/tmp/우주-밖-로그.md']], '이 우주의 로그여야 한다'],
  ['observe 가 모르는 은하 이름을 거부한다',
    ['node', ['observatory/observe.mjs', '--galaxy', '없는은하-시험']], '그런 은하가 없다'],
  ['lint 가 모르는 은하 이름을 거부한다',
    ['node', ['observatory/lint-drift.mjs', '--galaxy', '없는은하-시험']], '그런 은하가 없다'],
  ['galaxy 가 경로가 든 이름을 거부한다',
    ['node', ['bin/galaxy.mjs', '../탈출-시험', '--dir', '.', '--out', '/tmp/거부-시험.json']], '경로 구분자'],
  ['bigbang 이 PascalCase 아닌 별 이름을 거부한다',
    ['node', ['bigbang/bigbang.mjs', 'new', 'tiny-galaxy', 'shop', '../탈출', '--dry-run']], 'PascalCase'],
];

console.log('\n── 반드시 거부해야 하는 것\n');
let accepting = 0;
for (const [name, [command, args], reason] of REFUSALS) {
  const { code, out } = await run(command, args);
  const refuses = code !== 0 && out.includes(reason);
  console.log(`  ${refuses ? '✅' : '❌'} ${name}  exit=${code}`);
  if (!refuses) {
    console.error(`     ⛔ 거부해야 하는데 안 했다(또는 사유가 다르다: 「${reason}」을 기대했다).`);
    accepting += 1;
  }
}

/**
 * 진입점 — **손으로 적지 않는다.**
 *
 * ⛔ 실측(R91): 여기는 원래 7개짜리 손 목록이었다. `universe init` 은 진입점인데 아무도 안
 * 넣었고, 그래서 **프로젝트 내내 모르는 플래그를 삼켰다** — 이 갈래는 매번 「7곳이 거부한다」고
 * 초록불을 냈다. 관측 법칙 §9 그대로다: **열거 밖은 영영 안 보인다.**
 *
 * 그래서 `bin/universe.mjs` 의 배분표에서 **찾아낸다.** 위치 인자가 필요한 명령만
 * 아래 `POSITIONALS` 에 적고, 거기 없는 것은 플래그 하나만 던진다.
 */
const routerSrc = await readFile(join(ROOT, 'bin/universe.mjs'), 'utf8');
const routerBlock = routerSrc.slice(routerSrc.indexOf('const SUBCOMMANDS'),
  routerSrc.indexOf('};', routerSrc.indexOf('const SUBCOMMANDS')));
/** 위치 인자가 없으면 다른 이유로 죽어 「삼켰다」로 오인된다. */
const POSITIONALS = {
  new: ['_x', '_y', 'Z'],
  round: ['audit'],
  init: ['--dir', 'docs'],
};
const ENTRY_POINTS = [...routerBlock.matchAll(/^\s*([a-z-]+):\s*'([^']+)'/gm)]
  .map(([, name, file]) => [`universe ${name}`,
    /* ⚠️ 전부 `node` 로 돌렸다가 `.sh` 진입점이 「다른 이유로 죽었다」로 나왔다 — 도구를
       못 돌린 것을 삼킨 것으로 읽는 자리다(R69 가 가른 그 구분). */
    [file.endsWith('.sh') ? 'bash' : 'node',
      [file, ...(POSITIONALS[name] ?? []), '--존재하지-않는-플래그']]]);

/**
 * ── **말 시험** — 도구가 **맞는 말을 하는가.**
 *
 * ⚠️⚠️ 거부 시험(R79)은 「멈춰야 할 때 멈추는가」를 본다. 그런데 **멈추지 않는 것이 옳고
 * 말만 달라져야 하는** 성질이 있다 — R73 의 `--promote` 가 그렇다(이미 판단한 것은 안 올리고
 * 「올릴 것이 없다」고 말해야 한다). 종료코드는 **양쪽 다 0** 이라 거부 시험으로는 못 잡는다.
 * ⛔ 그래서 **말을 본다.** 도구의 말도 산출물이다(R78 에서 그렇게 적었다).
 */
const SAYINGS = [
  /* ⚠️ **시험이 실패할 때 저장소를 건드리면 안 된다.** 이 명령은 말이 틀릴 때(=필터가 깨졌을 때)
     성운에 줄을 덧붙인다 — 시험 자체가 오염원이 되는 것이다(R62 의 잔해와 같은 종류).
     그래서 만진 파일을 **들어올 때의 내용으로 되돌린다.** */
  ['learn --promote 가 이미 판단한 것을 다시 안 올린다',
    ['node', ['observatory/learn.mjs', '--promote']], '올릴 것이 없다', 'nebula/README.md'],
  ['observe 가 규칙의 주인을 빠짐없이 셌다고 말한다',
    ['node', ['observatory/observe.mjs']], '주인 없는 규칙 없음'],
  /* ⛔ **「못 쟀다」는 종료코드가 없다 — 그래서 변이 갈래로는 안 잡힌다.** 은하가 컴파일
     명령을 하나도 선언하지 않으면 1차는 그냥 통과하는데, R44 는 그 자리에서 정확히 당했다
     (별이 `tsc` 를 깼는데 관문은 ✅ 라고 했다). 여기서는 **말**로 잰다 — 조용히 넘어가면
     이 시험이 죽는다. R90 이 진짜 은하에서 관문이 도는 것을 확인하며 이 틈을 봤다. */
  ['컴파일 명령이 하나도 없으면 「못 쟀다」고 말한다',
    ['node', ['bin/universe.mjs', 'new', 'tiny-galaxy', 'shop', 'SayProbe']],
    '컴파일을 못 쟀다', 'galaxies/tiny-galaxy.json',
    /* ⚠️ 처음엔 줄을 지우는 변이를 썼는데 **쉼표가 남아 JSON 이 깨졌고**, 그러자 도구가
       「없는 은하」라고 **틀린 이유**를 댔다 — 그 자체가 이 바퀴의 두 번째 결함이었다.
       여기서는 그 결함이 아니라 「컴파일 명령이 없다」를 재야 하므로 JSON 을 살려서 지운다. */
    (text) => JSON.stringify((() => {
      const g = JSON.parse(text);
      delete g.commands.build;
      delete g.commands.typecheck;
      delete g.commands.extraGates?.typecheck;
      return g;
    })(), null, 2),
    'fixtures/tiny-galaxy/src/components/shop/SayProbe'],
  /* ⛔ 그 두 번째 결함을 여기서 잠근다 — **틀린 이유를 대는 것이 이유를 안 대는 것보다 나쁘다.** */
  /* ⛔ **도피구는 세어야 도피구다(R65).** 실측(R102): `forced:` 로 닫힌 라운드가 **0건**이라
     이 보고는 한 번도 안 나왔다 — 「0은 무죄가 아니다」의 보고판이다.
     ⚠️ 감사는 도피구를 **죄로 세지 않는다**(exit 0) — 그래서 변이 갈래로는 못 잰다.
     쓴 것 자체는 죄가 아니고 **세지 않는 것이 죄**라서, 여기서 **말**로 잰다. */
  ['도피구로 닫힌 라운드를 감사가 말한다',
    ['node', ['bin/round.mjs', 'audit']], '빨간 관문을 넘어 닫은 라운드',
    'log/2026-09-05-21-33-기록-없이-관문을-넘는-자리-도피구를-센다.md',
    (text) => text.replace(/^closed: (.+)$/m, 'closed: $1\nforced: 가짜 관문\nforcedWhy: 시험이다')],
  ['깨진 좌표를 「없는 은하」라고 하지 않는다',
    ['node', ['bin/universe.mjs', 'new', 'tiny-galaxy', 'shop', 'BrokenProbe']],
    '좌표를 못 읽었다', 'galaxies/tiny-galaxy.json',
    () => '{ "name": "tiny-galaxy", 깨진JSON }', null, true],
  /* ⛔ **판올림 경로가 없었다(R91).** `check` 는 배달본이 낡으면 「다시 깔고 나서 다시 재라」고
     말하는데 `init` 은 거부했고, 유일한 길인 `--force` 는 **은하·성운·로그를 지웠다** —
     도구가 시키는 대로 하면 그 팀의 것이 사라진다. 안내에 `--update` 가 없으면 그 자리로 돌아간다. */
  /* ⚠️ `--dir` 는 **이미 있는 폴더**를 짚어야 한다. 처음엔 `--dir universe` 로 썼는데
     그 폴더가 없어서 **우주 안에 우주를 깔았다** — 시험이 오염원이 된 것이다(R62 의 잔해와 같다). */
  /* ⛔ **좌표를 만들고 목록에 안 올리면 관측이 「아무것도 안 재고 초록불」을 낸다(R121).**
     새 사람이 문서대로 친 첫 길에서 실제로 그랬다 — 그 침묵을 잰다. */
  ['좌표만 있고 목록이 비면 초록불을 안 준다',
    ['node', ['observatory/observe.mjs']], '`galaxies` 에 이름을 올려라',
    'universe.config.json', (text) => JSON.stringify({ ...JSON.parse(text), galaxies: [] }, null, 2), null, true],
  /* ⛔ **git 저장소가 아니면 커밋 관문은 못 돈다(R123).** 조용히 깔고 「커밋 관문」이라
     소개하면 **켤 수 없는 것을 준 것**이다. 그 말을 잰다.
     ⚠️ `--dir /tmp/…` 은 저장소 밖이라 git 이 없다 — 그 자리를 그대로 쓴다. */
  /* ⛔ **발행 경로를 아무 시험도 안 태웠다(R128).** R03 이 「실제 발행 경로는 미검증
     (자격증명 없음)」으로 적어 둔 뒤로 그대로였다 — 그런데 `fetch` **앞까지는 다 잴 수 있다.**
     ⚠️ 자격증명이 없을 때 **조용히 아무것도 안 하면** 사람은 발행된 줄 안다. 거부해야 한다. */
  ['자격증명이 없으면 발행을 거부하고 처방을 준다',
    ['node', ['beacon/publish.mjs']], '자격증명이 없다', null, null, null, true],
  ['dry-run 은 무엇을 어디로 보낼지 말한다',
    ['node', ['beacon/publish.mjs', '--dry-run']], '네트워크를 쓰지 않는다'],
  ['git 저장소가 아니면 커밋 관문이 못 돈다고 말한다',
    ['node', ['bin/init.mjs', '--dir', '/tmp/universe-git-probe', '--dry-run']], 'git 저장소가 아니다'],
  ['이미 깔린 곳에서 판올림 길을 안내한다',
    ['node', ['bin/init.mjs', '--dir', 'docs']], '--update', null, null, null, true],
];

console.log('\n── 도구가 맞는 말을 하는가\n');
let mute = 0;
/* ⛔ 이 갈래는 `code === 0` 을 요구했다 — **거부하면서 하는 말은 표현할 수 없었다**(R90).
   「좌표를 못 읽었다」는 죽으면서 하는 말이라, 이 틀에서는 영영 못 재는 말이었다.
   그래서 죽어야 하는 말은 `mustDie` 로 적는다. */
for (const [name, [command, args], expected, touches, mutate, cleanup, mustDie] of SAYINGS) {
  const original = touches ? await readFile(join(ROOT, touches), 'utf8').catch(() => null) : null;
  /* 말을 재려면 **그 말이 나오는 상황을 만들어야** 하는 것도 있다. 되돌리기는 아래 공통 경로가 한다. */
  if (mutate && original !== null) {
    await writeFile(join(ROOT, touches), mutate(original), 'utf8');
  }
  const { code, out } = await run(command, args);
  if (cleanup) {
    await rm(join(ROOT, cleanup), { recursive: true, force: true });
  }
  if (original !== null) {
    await restoreFrom(touches, original);
  }
  const says = (mustDie ? code !== 0 : code === 0) && out.includes(expected);
  console.log(`  ${says ? '✅' : '❌'} ${name}  exit=${code}`);
  if (!says) {
    console.error(`     ⛔ 「${expected}」라고 말해야 하는데 안 했다.`);
    mute += 1;
  }
}

console.log('\n── 관측 법칙 §7 — 모르는 플래그를 거부하는가\n');
let swallowing = 0;
for (const [name, [command, args]] of ENTRY_POINTS) {
  const { code, out } = await run(command, args);
  /* ⚠️ **exit≠0 만 보면 안 된다.** `bigbang new _x …` 는 은하가 없어서도 1 로 죽는다 —
     플래그를 삼켜도 초록불로 보였을 것이다. 거부 **사유**까지 확인한다.
     이 우주가 반복해 온 실패가 「엉뚱한 것을 재고 통과라 부르는 것」이다. */
  const rejects = code !== 0 && out.includes('모르는 플래그');
  console.log(`  ${rejects ? '✅' : '❌'} ${name}  exit=${code}${code !== 0 && !rejects ? ' (다른 이유로 죽었다 — 플래그를 삼켰다)' : ''}`);
  if (!rejects) { swallowing += 1; }
}
if (swallowing > 0) {
  console.error(`\n⛔ 모르는 플래그를 삼키는 진입점 ${swallowing}곳. 공짜 모드인 줄 알고 돈을 쓰게 된다.`);
}

/* ── 3부: 동시 실행 잠금이 정말 무는가.
   **지금 이 프로세스가 잠금을 쥐고 있다** — 자식을 띄우면 거부돼야 한다.
   ⚠️ 종료코드만 보지 않는다(§7 과 같은 이유). 자식은 다른 이유로도 죽을 수 있다. */
console.log('\n── 동시 실행 잠금\n');
const sibling = await run(process.execPath, [join(ROOT, 'observatory/verify-checks.mjs')]);
const refused = sibling.code !== 0 && sibling.out.includes('변이 중이다');
console.log(`  ${refused ? '✅' : '❌'} 잠금을 쥔 채 자식을 띄우면 거부한다  exit=${sibling.code}`);
if (!refused) {
  console.error('  ⛔ 두 실행이 동시에 변이하면 서로의 구조 파일을 덮어 **되돌릴 원본이 사라진다.**');
}

if (notBiting + swallowing + accepting + mute + (refused ? 0 : 1) > 0) {
  console.error(`\n⛔ 안 무는 검사 ${notBiting}건. 무는 것이 확인되지 않은 검사는 장식이다.`);
  if (unmeasurable > 0) {
    console.error(`   ⚪ 그와 별개로 ${unmeasurable}건은 **여기선 못 쟀다**(증거가 없다) — 통과로 세지 마라.`);
  }
  process.exit(1);
}
console.log(`\n✅ 검사 ${checks.length}종 · 변이 ${CASES.length}건 전부 물었고, 진입점 ${ENTRY_POINTS.length}곳이 모르는 플래그를 거부하고, 거부 시험 ${REFUSALS.length}건과 말 시험 ${SAYINGS.length}건이 지켜지며, 동시 실행이 막힌다.`);
/* ⛔ 이 줄은 두 번 거짓이었다. 처음엔 「전부 사유로 판정한다」고 했는데 **변이 갈래는
   종료코드만 봤다**(R89). 그다음엔 「대부분 종료코드」라고 고쳤는데, R95 가 36건 전부에
   사유를 박았다. **말은 실측에서 나와야 한다** — 그래서 수를 찍는다. */
const allReasoned = reasonChecked === CASES.length;
console.log(allReasoned
  ? `   판정은 종료코드가 아니라 **거부 사유**로 한다 — ${reasonChecked}/${CASES.length} 건 전부. 다른 이유로 죽으면 ⚠️ 로 갈린다.`
  : `   ⚠️ 변이 갈래의 판정은 **일부만 사유**다 — 거부 사유까지 확인한 것은 ${reasonChecked}/${CASES.length} 건이다.`);
