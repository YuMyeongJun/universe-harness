---
name: quick-start
title: 퀵스타트 — 5분
type: doc
parent: docs
related: [usage, bigbang]
description: 설치부터 첫 별이 태어나고 「끝났는가」를 묻기까지, 순서대로.
---

# 퀵스타트 — 5분

> 목표: **법칙이 우리 코드에서 무엇을 잡는지 보고, 별 하나를 태워 본다.**

**길은 일곱 칸이고, 칸마다 「친다 → 이게 나온다」 둘뿐이다.** 곁길과 함정은 본문에서 빼서 아래
[막히면 여기](#막히면-여기) 에 모아 뒀다 — 막히기 전에는 안 읽어도 된다. 이 순서는 관문
`universe quickstart` 가 **빈 저장소에서 매 바퀴 그대로 밟는다.** 문서와 도구가 갈라지면 그
관문이 빨개진다.

## 0. 전제

| | |
|---|---|
| Node | **22.6+** (엔진이 최신 fs API 를 쓴다) |
| 대상 저장소 | **git 저장소**여야 한다 — 관측이 커밋 SHA 를 기록한다 |
| 스택 | React + Vite (다른 스택은 플러그인이 필요하다) |
| 패키지 매니저 | npm · pnpm · yarn 1 · yarn berry — **아무거나** ([무엇으로 쟀는지](#무엇을-쟀고-무엇은-못-쟀나)) |

이름이 둘이라는 것만 먼저 알고 가면 된다.

| 무엇 | 이름 |
|---|---|
| npm 꾸러미 (깔 때) | **`universe-front-harness`** |
| 명령 (깐 뒤 치는 것) | **`universe`** |

⛔ **`npx universe` 를 치지 마라** — npm 의 그 이름은 **남의 패키지**(crossfilter/universe)다.
우리 것은 뒤까지 붙인 `npx universe-front-harness` 다. → [왜 이름이 둘인가](#왜-이름이-둘인가)

## 1. 깐다

**친다**
```bash
cd <당신의 저장소>
npm i -D universe-front-harness
./node_modules/.bin/universe init
```
매니저마다 첫 줄과 부르는 이름이 다르다. 나머지는 전부 같다.

| 매니저 | 깔기 | 그 뒤 부르는 이름 |
|---|---|---|
| npm | `npm i -D universe-front-harness` | `./node_modules/.bin/universe` |
| pnpm | `pnpm add -D universe-front-harness` | `./node_modules/.bin/universe` |
| yarn 1 | `yarn add -D universe-front-harness` | `./node_modules/.bin/universe` |
| yarn berry (`nodeLinker: node-modules`) | `yarn add -D universe-front-harness` | `./node_modules/.bin/universe` |
| yarn berry (기본 = PnP) | `yarn add -D universe-front-harness` | `yarn universe` |

> **아래 2~7 의 명령은 전부 같은 꼴이다.** yarn berry(PnP)면 `./node_modules/.bin/universe` 를 `yarn universe` 로 바꿔 친다.

**이게 나온다** — `universe/` 가 생기고, `.gitignore` 에 `.harness/`(관측 산출물)가 더해진다. 안에는
**법칙과 관측소**가 들어 있다. 은하·성운·로그는 비어 있다 — **그것은 당신 저장소의 것**이라 배달되지 않는다.

⛔ **선언됐는데 꾸러미에 없는 것이 있으면 `init` 이 막는다**(exit 1). 예전엔 조용히 건너뛰어서
**덜 깔린 우주**가 초록으로 끝났고, 그 자리의 기능은 아무도 모르게 없었다.

**막히면** → [yarn berry 를 PnP 로 쓸 때](#yarn-berry-를-pnp-로-쓸-때) · [레지스트리에 못 닿을 때](#레지스트리에-못-닿을-때) · [우주 자신을 고치는 사람](#우주-자신을-고치는-사람) · [판올림은 두 걸음이다](#판올림은-두-걸음이다) · [명령이 길어 보일 때](#명령이-길어-보일-때)

## 2. 은하를 등록한다

은하 = 법칙이 적용되는 저장소 하나. **손으로 쓰지 마라** — 읽어낼 수 있는 것은 읽어 준다.

**친다**
```bash
./node_modules/.bin/universe galaxy my-app --dir .
```
**이게 나온다** — `package.json` 에서 읽어낸 것은 채우고, **못 읽은 자리는 `TODO:` 로 남긴다.**
태양계(별이 태어날 폴더)는 짐작하지 않고 후보만 보여 준다. `TODO:` 가 남아 있으면 다음 단계가
**재기를 거부한다** — 초안이 완성본 행세를 못 하게. 채우고 나면 이런 모양이다.

```jsonc
{
  "name": "my-app",
  "path": "/절대/경로/my-app",        // 이 저장소
  "appWorkspace": "@acme/app-web",    // 모노레포가 아니면 ""
  "appDir": "apps/web",               // 단일 앱이면 "."
  "laws": ["tokens", "semantics", "naming", "flatness"],
  "commands": {
    "build": "yarn build",
    "test": "yarn test:run",
    "lintJson": "yarn workspace <WORKSPACE> exec eslint <TARGET> --format json -o <OUT>"
  },
  "lintTargets": [{ "workspace": "@acme/app-web", "target": "./src" }],
  "solarSystems": [
    { "name": "dashboard", "srcDir": "src/components/pages/dashboard" }
  ]
}
```

⚠️ `laws` 에 **`form` 을 넣을지는 팀 합의로 정한다** — 화살표 함수·클래스 금지·`I` 접두사는
보편 규칙이 아니라 한 조직의 결정이다. 합의 없이 켜면 관문이 헛돈다.

## 3. 법칙이 무엇을 잡는지 본다

**친다**
```bash
./node_modules/.bin/universe observe
```
**이게 나온다**
```
── 커버리지 — 규칙 20 · 법칙이 덮은 것 19 · 성운 1
  ✅ 주인 없는 규칙 없음

── 은하 my-app — apps/web/src
  ⚠️ 토큰 법칙          651건  기준선 없음 — `--update` 로 심어라
          640  tailwind/arbitrary-value
            8  tailwind/theme-hardcoded
            3  tailwind/class-legibility
  ⚠️ 시맨틱 법칙          59건  기준선 없음
```
**이 수치가 당신 코드의 현재 상태다.** 놀랄 수 있다 — 놀라는 것이 정상이다. 대부분의
프로젝트에서 접근성 위반은 **어떤 게이트도 보지 못한 채** 쌓여 있다.

## 4. 기준선을 심는다

**친다**
```bash
./node_modules/.bin/universe observe --update
```
**이게 나온다** — 지금 수치가 은하 파일의 `observed.laws` 에 기준선으로 들어간다.
**앞으로 이 수가 늘면 관측소가 막는다.** 줄이는 것이 목표다.

⚠️ 워킹트리가 더러우면 `--update` 는 거부한다 — 커밋에 귀속되지 않는 수는 기준선이 될 수 없다.

## 5. 첫 별을 태운다

**친다**
```bash
./node_modules/.bin/universe new my-app dashboard DashboardToday
```
**이게 나온다**
```
💥 빅뱅 — 은하 my-app · 태양계 dashboard · 별 DashboardToday
   + DashboardToday.tsx        (42줄)
   + useDashboardToday.ts      (33줄)
   + index.ts                  ( 4줄)
   + DashboardToday.test.tsx   (23줄)

── 관문 — 은하가 켠 법칙 4개 · 규칙 11개
   ✅ 태어난 별이 법칙을 지킨다.

⭐ 별이 태어났다
```
관문은 셋이 차례로 돈다.

| 순서 | 무엇을 재나 | 못 지나면 |
|---|---|---|
| 법칙 관문 | 태어날 코드가 은하가 켠 법칙을 지키는가 | **파일을 아예 안 쓴다** — 태어나는 별은 법칙을 지킨 상태로만 존재한다 |
| 컴파일 관문 | 그 은하에서 정말 서는가 (은하가 선언한 명령으로) | 파일을 **남겨 두고** 되돌리는 명령을 알려 준다 — 무엇이 깨졌는지 봐야 하므로 |
| 집안 규칙 관문 | 은하의 lint (`commands.lintFix`) 를 **별의 폴더에만** 건다 | 그 은하의 규칙대로 고쳐 준다 |

⛔ 남의 코드는 건드리지 않고, 템플릿에 그 팀의 정렬 규칙을 박지도 않는다 — 은하마다 다르다.
은하가 `commands.test` 를 선언하지 않았으면 **행동 계약(`*.test.tsx`)을 안 만든다.** 안 만들었다고
화면에서 말한다 — 그 별에는 지켜 줄 계약이 없다는 뜻이다.

## 6. 끝났는지 묻는다

**친다**
```bash
./node_modules/.bin/universe loop --galaxy my-app
```
**이게 나온다**

| 종료코드 | 뜻 |
|---|---|
| 0 | **판단하지 않은 fail 0** — 이 회전에서 멈춰도 된다 |
| 1 | 판단 안 한 fail 이 남았다 |
| 3 | ⚪ **못 쟀다** |

⛔ **종료 조건은 「fail 0」이 아니다.** 「fail 0」을 목표로 두면 **가장 싼 해법이 단정을 약하게
만드는 것**이 된다. 그래서 「**판단하지 않은** fail 0」이다.

갓 만든 은하는 `commands.e2e` 를 선언하지 않았으니 **처음엔 ⚪ 가 나온다** — 「화면이
멀쩡하다」가 아니라 **안 쟀다**는 뜻이다. 축을 붙이려면 좌표에 적어라:
```json
"commands": { "e2e": "npx playwright test --reporter=json > .universe/e2e.json" }
```
`universe clone`·`universe galaxy` 는 저장소에 Playwright 가 있으면 이 줄을 초안에 적어 준다.
판정은 사람이 붙인다. 판정을 붙이면 그 **붙인 주행을 파일로도** 남기고,
`universe loop --galaxy my-app --report <그 파일>` 이 그것을 읽어 「끝났다」고 말한다.

**이 문서가 밟은 것은 사람의 계획 중 어디인가.** 계획은 여기까지 온다:
```
주소 → 받기 → 좌표 → 들이기 → 관측 → 화면 시험 → 판정 → 끝났는가 → 반복
```
이 문서는 **저장소가 이미 그 기계에 있는** 길(3번 = `galaxy`)로 들어갔다. 주소만 있을 때는 앞의 두 칸이
`universe clone <주소>` → `universe adopt <초안파일>` 이다([사용법](02-usage.md) 의 `clone`·`adopt` 절).

## 7. 그 바퀴를 반복한다

**친다**
```bash
./node_modules/.bin/universe repeat --galaxy my-app
```
**이게 나온다** — `loop` 이 **한 번 묻는 것**이라면 `repeat` 는 그것을 **fail 0 까지 돌리는 것**이다.

⛔ **판정은 자동으로 안 붙인다** — 붙이면 「판단하지 않은 fail 0」이라는 종료 조건이 그 자리에서
무의미해진다. 돌리고 · 세고 · **멈출 때를 말할** 뿐이다.
**「끝날 때까지」 무한히 돌지 않는다.** 끝났다 · 안 줄어든다 · 바퀴를 다 썼다(`--max`, 기본 5) ·
못 쟀다, 넷에서 멈춘다([사용법](02-usage.md) 의 `repeat` 절에 종료코드 표가 있다).

---
# 막히면 여기

## 왜 이름이 둘인가

꾸러미 이름은 npm 전체에서 겹치면 안 되는데 `universe` 자리는 이미 남이 쓴다. 명령 이름은 **사람이 손으로
치는 것**이라 짧아야 한다. 그래서 꾸러미는 `universe-front-harness`, 그 안의 명령은 `universe` 하나다.
```bash
npx universe-front-harness init     # ⛔ 뒤 한 조각을 빼면 남의 패키지다
```
실측(R52): 문서가 **그 짧은 이름을 네 번** 시키고 있었고, 그대로 따라 하면 **엉뚱한 것을 내려받았다.**
npm 에 올라간 뒤에도 그 경고는 그대로다 — 바뀐 것은 하나뿐이다: **우리 이름이 생겼다.**

⚠️ 꾸러미에 명령이 **하나뿐이면** `npx` 가 그것을 골라 돌린다 — 실측(2026-09-08 · npm 11.17):
꾸러미를 `npm exec` 에 물려 부르니 이름을 안 대도 도움말이 나왔다(`libnpmexec` 의
`get-bin-from-manifest` 가 그렇게 고른다).

**깐 뒤에는 왜 `npx` 형태를 안 가르치는가.** 깐 저장소 안에서는 그 형태도 로컬 것을 부른다(실측
2026-09-09: `init`·`observe`·`galaxy` 셋 다 exit 0). ⛔ **그런데 안 깐 곳에서 같은 줄을 치면 npm 의
짧은 이름(남의 패키지)을 진짜로 내려받는다.** 같은 글자가 자리에 따라 다른 것을 가리키는 처방은
안 가르친다(R52). 이 규율은 **검사로 지킨다**: 문서에 그 형태를 적으면 부품 시험이 문다. 실제로
물었다.

## 명령이 길어 보일 때

**`--universe` 는 안 붙여도 된다.** 도구가 저장소 뿌리에서 `universe/` 를 스스로 찾는다(실측:
붙이든 안 붙이든 같은 출력·같은 종료코드). 예전 문서는 모든 줄에 그것을 붙였다 — **안 써도 되는
것을 가르치면 명령이 길어 보이고, 긴 명령은 아무도 안 친다.** 우주가 이상한 자리에 깔렸을 때만
`--universe <경로>` 로 겨눈다.

⚠️ **짧게 적으려다 한 칸만 어긋난 적이 있다.** 예전 문서는 6번 칸에만
`universe loop --galaxy my-app` 이라고 적었는데, 이어 붙이지 않은 사람에게는 `command not found` 고,
이어 붙였어도 `--universe` 가 없으면 **깔린 폴더가 아니라 cwd 에서 위로 찾았다.**
그래서 지금은 2~7 이 **한 꼴**이다.

길면 별칭을 걸어라 — 도구가 아니라 당신의 셸이 할 일이다:
```bash
alias u='./node_modules/.bin/universe'
u observe
```
⚠️ **엔진은 `universe/` 안에 배달되지 않는다 — 꾸러미가 들고 있다.** 그래서 명령은 **깐 꾸러미의
CLI 로 부른다.** 깔린 폴더 안의 `observatory/observe.mjs` 를 직접 부르면 엔진을 못 찾는다.

## 사설 레지스트리·토큰이 걸릴 때

**이 우주는 의존이 0개다**(`package.json` 에 `dependencies` 가 **아예 없다**). 그래서 사설
레지스트리·스코프·`NODE_AUTH_TOKEN` 같은 그 저장소의 설정과 **아무 상관이 없다** — `npm` 을 못
쓰는 저장소도 자기 매니저로 그대로 깐다.

⚠️ 이 줄이 문서에 없어서 **채택이 막힌 적이 있다**(2026-09-08). yarn berry 저장소에서 「`npm i` 를
못 쓴다」로 멈추고 tar 를 손으로 풀었다 — 안 그래도 됐다.

## yarn berry 를 PnP 로 쓸 때

**커밋 관문이 안 돈다.** 실측(2026-09-08): PnP 기본 배치에서는 `node_modules/.bin/` 이 아예 없다.
명령은 `yarn universe …` 로 전부 도는데, **커밋 훅은 그 이름을 못 찾는다** — 훅은 저장소의
`node_modules/.bin/universe` · 우주 저장소의 `bin/universe.mjs` · PATH 의 `universe` 셋만 본다.

⛔ 그때 훅은 **조용히 넘어가지 않고 커밋을 막는다**(`⛔ 법칙 관측 — 재지 못했다`). 안 잰 것이
통과로 보이는 자리를 안 만든다 — 그래서 **막힌 것이 옳다.** 푸는 법은 둘이다:
```yaml
# .yarnrc.yml — 권장. 이러면 훅까지 그대로 돈다(실측: 관문 통과)
nodeLinker: node-modules
```
또는 우주를 전역으로 깔아 PATH 에 올린다(`npm i -g universe-front-harness`).

## 레지스트리에 못 닿을 때

사내망이라 npm 레지스트리를 못 보거나, **아직 안 올라간 판**(고치는 중인 것)을 재야 할 때다.
꾸러미 파일로 깐다.
```bash
cd <우주-저장소>
npm pack --pack-destination <저장소 밖 어딘가>   # universe-front-harness-<판>.tgz 가 생긴다
```

| 매니저 | 깔기 |
|---|---|
| npm | `npm i -D <어딘가>/universe-front-harness-<판>.tgz` |
| pnpm | `pnpm add -D <어딘가>/universe-front-harness-<판>.tgz` |
| yarn 1 | `yarn add -D file:<어딘가>/universe-front-harness-<판>.tgz` |
| yarn berry | `yarn add -D <어딘가>/universe-front-harness-<판>.tgz` |

⛔ **`<판>` 을 여기 손으로 적지 않는다** — `npm pack` 이 찍는 파일 이름을 그대로 쓴다. 문서에 박힌
판 번호는 다음 판올림에 바로 거짓이 된다(이 저장소가 여러 번 데인 자리다).
⚠️ **저장소 안에 떨구지 마라**(`--pack-destination` 이 그래서 있다) — `.gitignore` 에 `*.tgz` 가
없어서(실측) 꾸러미가 `git status` 에 그대로 남고, 실수로 커밋될 자리에 놓인다.

## 판올림은 두 걸음이다

```bash
npm i -D universe-front-harness@latest      # ① 꾸러미(=기계와 엔진)를 새로 받는다
./node_modules/.bin/universe init --update  # ② 깔린 universe/ 를 다시 깐다 — 은하·성운·로그는 그대로
```
⛔ **①만 하고 ②를 빼먹으면 깔린 `universe/` 는 옛 판 그대로다.** 새 법칙·궤도가 생겨도 목록에 안
이어지고, 그 자리는 **아무 말 없이** 안 돈다 — 안 잰 것이 통과로 보이는 자리다.

## 우주 자신을 고치는 사람

⚠️ 이 길은 소비 저장소용이 아니다. 여기서 도는 것은 **배달본이 도는 증거가 아니다** — 심링크
덕에 원본에서만 멀쩡한 결함이 실제로 있었다(2026-09-08 에 엔진 `dist` 로 두 번).
```bash
cd <우주-저장소>
npm link          # `universe` 를 잇는다 (되돌리기: npm rm -g universe-front-harness)
```
안 이어 붙여도 전부 그대로 쓴다 — `universe X` 를 `node <우주-저장소>/bin/universe.mjs X` 로 바꿔
치면 된다(도구도 이어져 있지 않으면 **그 형태로** 알려 준다).

## 무엇을 쟀고 무엇은 못 쟀나

⛔ 「전부 실측」으로 뭉뚱그리지 않는다. 잰 것과 안 잰 것을 갈라 적는다.

| 잰 것 | 무엇으로 | 판정 |
|---|---|---|
| 매니저 넷 · 깔기 → `init` → `observe` | 2026-09-08 · **꾸러미 파일(tgz)** · npm 11.17 · pnpm 11.24 · yarn 1.22 · yarn berry 4.18 | ✅ 전부 exit 0 |
| 꾸러미 이름을 바꾼 뒤 다시 | 2026-09-08 · npm · pnpm · yarn 1 (tgz) | ✅ 전부 exit 0 |
| **레지스트리에서 받아 깔기** | — | ⚪ **못 쟀다** |

마지막 줄을 ✅ 로 접지 않는다. 받아 오는 자리만 다르고 tarball 은 같은 것이지만, **같을
것이다**는 잰 것이 아니다 — 이 저장소의 어휘는 0/1/**3**이다. 레지스트리에서 처음 깐 사람이 이
칸을 채워라.

---
## 다음

- [사용법](02-usage.md) — 명령 전부
- [심화](03-advanced.md) — 법칙 추가 · 힘 발견 · 궤도
- [결과 예측](05-expectations.md) — 무엇을 기대할 수 있고 무엇은 아닌가
