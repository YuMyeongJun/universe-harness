---
name: quick-start
title: 퀵스타트 — 5분
type: doc
parent: docs
related: [usage, bigbang]
description: 설치부터 첫 별이 태어나기까지. 명령 다섯 줄.
---

# 퀵스타트 — 5분

> 목표: **법칙이 우리 코드에서 무엇을 잡는지 보고, 별 하나를 태워 본다.**

## 0. 전제

| | |
|---|---|
| Node | **22.6+** (엔진이 최신 fs API 를 쓴다) |
| 대상 저장소 | **git 저장소**여야 한다 — 관측이 커밋 SHA 를 기록한다 |
| 스택 | React + Vite (다른 스택은 플러그인이 필요하다) |

## 1. 우주를 깐다

⛔ **`npx universe` 를 치지 마라.** npm 의 `universe` 는 **남의 패키지**다
(crossfilter/universe — 데이터셋 탐색 도구). 이 우주는 **npm 에 배포되지 않았다** —
GitHub 에서 클론해서 쓴다. 실측(R52): 문서가 `npx` 를 시키고 있었고, 그대로 따라 하면
**엉뚱한 것을 내려받는다.**

### 0-1. `universe` 명령을 이어 붙인다 (한 번만)

⚠️ **이걸 안 하면 `universe` 를 쳐도 `command not found` 다.** 실측: 도움말과 대화형 입구가
`universe …` 라고 **가르치는데** 정작 그 이름이 기계에 없었다 — **도구가 틀린 말을 했다.**
(지금은 이어져 있지 않으면 도구가 `node …/bin/universe.mjs` 라고 **사실대로** 말한다.)

```bash
cd <우주-저장소>
npm link          # 되돌리기: npm rm -g universe
```

⛔ 안 이어 붙여도 **전부 그대로 쓸 수 있다** — 아래의 `universe X` 를 `node <우주-저장소>/bin/universe.mjs X` 로 바꿔 치면 된다.

```bash
cd <당신의 저장소>
node <우주-저장소>/bin/init.mjs
```

`universe/` 가 생기고, `.gitignore` 에 `.harness/`(관측 산출물)가 더해진다.
안에는 **법칙과 관측소**가 들어 있다. 은하·성운·로그는 비어 있다 —
**그것은 당신 저장소의 것**이라 배달되지 않는다.

⚠️ **엔진은 배달되지 않는다.** 그래서 아래 명령은 **우주 저장소의 CLI 로 부르고**
`--universe` 로 깔린 폴더를 겨눈다. 깔린 폴더 안에서 직접 부르면 엔진을 못 찾는다.

## 2. 은하를 등록한다

은하 = 법칙이 적용되는 저장소 하나. **손으로 쓰지 마라** — 읽어낼 수 있는 것은 읽어 준다.

```bash
node <우주-저장소>/bin/universe.mjs galaxy my-app --dir . --universe ./universe
```

`package.json` 에서 읽어낸 것은 채우고, **못 읽은 자리는 `TODO:` 로 남긴다.**
⛔ 태양계(별이 태어날 폴더)는 **짐작하지 않는다** — 후보만 보여 준다.
`TODO:` 가 남아 있으면 다음 단계가 **재기를 거부한다**(초안이 완성본 행세를 못 하게).

채우고 나면 이런 모양이다.

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

```bash
node <우주-저장소>/bin/universe.mjs observe --universe ./universe
```

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

**이 수치가 당신 코드의 현재 상태다.** 놀랄 수 있다 — 놀라는 것이 정상이다.
대부분의 프로젝트에서 접근성 위반은 **어떤 게이트도 보지 못한 채** 쌓여 있다.

## 4. 기준선을 심는다

```bash
node <우주-저장소>/bin/universe.mjs observe --universe ./universe --update
```

지금 수치가 은하 파일의 `observed.laws` 에 기준선으로 들어간다.
**앞으로 이 수가 늘면 관측소가 막는다.** 줄이는 것이 목표다.

⚠️ 워킹트리가 더러우면 `--update` 는 거부한다 — 커밋에 귀속되지 않는 수는 기준선이 될 수 없다.

## 5. 첫 별을 태운다

```bash
node <우주-저장소>/bin/universe.mjs new my-app dashboard DashboardToday --universe ./universe
```

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

**법칙 관문을 통과하지 못하면 파일을 쓰지 않는다.** 태어나는 별은 법칙을 지킨 상태로만 존재한다.

그다음 **컴파일 관문**이 돈다 — 별이 그 은하에서 정말 서는지 은하가 선언한 명령으로 잰다.
⚠️ 이쪽은 **파일을 쓴 뒤에** 잰다. 서지 않으면 파일을 **남겨 두고** 되돌리는 명령을 알려 준다 —
무엇이 깨졌는지 봐야 하기 때문이다.

그다음 **집안 규칙 관문**이 돈다 — 은하의 lint 를 **별의 폴더에만** 건다.
은하가 `commands.lintFix` 를 선언했으면 **우주가 방금 쓴 파일에만** 그것을 돌린다.
⛔ 남의 코드는 건드리지 않고, 템플릿에 그 팀의 정렬 규칙을 박지도 않는다 — 은하마다 다르다.

⛔ 은하가 `commands.test` 를 선언하지 않았으면 **행동 계약(`*.test.tsx`)을 안 만든다.**
안 만들었다고 화면에서 말한다 — 그 별에는 지켜 줄 계약이 없다는 뜻이다.

## 6. 끝났는지 묻는다

```bash
universe loop --galaxy my-app
```

사람의 계획은 여기서 끝난다: 재고 → TC → **화면 시험** → fail 목록 → **사람이 판정** → 다시.

| 종료코드 | 뜻 |
|---|---|
| 0 | **판단하지 않은 fail 0** — 이 회전에서 멈춰도 된다 |
| 1 | 판단 안 한 fail 이 남았다 |
| 3 | ⚪ **못 쟀다** |

⛔ **종료 조건은 「fail 0」이 아니다.** 「fail 0」을 목표로 두면 **가장 싼 해법이 단정을
약하게 만드는 것**이 된다. 그래서 「**판단하지 않은** fail 0」이다.

⚠️ 갓 만든 은하는 `commands.e2e` 를 선언하지 않았으니 **처음엔 ⚪ 가 나온다** —
「화면이 멀쩡하다」가 아니라 **안 쟀다**는 뜻이다. 축을 붙이려면 좌표에 적어라:

```json
"commands": { "e2e": "npx playwright test --reporter=json > .universe/e2e.json" }
```

⚠️ `universe clone`·`universe galaxy` 는 저장소에 Playwright 가 있으면 **이 줄을 초안에 적어 준다.**

판정은 콘솔에서 붙인다(`universe console` 이 그 화면이 서는지 잰다). 판정을 붙이면 콘솔이
**붙인 주행을 파일로도** 남기고, `universe loop --report <그 파일>` 이 그것을 읽어 「끝났다」고 말한다.

## 다음

- [사용법](02-usage.md) — 명령 전부
- [심화](03-advanced.md) — 법칙 추가 · 힘 발견 · 궤도
- [결과 예측](05-expectations.md) — 무엇을 기대할 수 있고 무엇은 아닌가
