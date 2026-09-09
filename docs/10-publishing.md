---
name: publishing
title: 배포 — npm 에 올린다
type: doc
parent: docs
related: [contributing, redshift, quick-start, 08-architecture]
description: 판을 올리고 npm 에 올리기까지. ⛔ 원본이 도는 것과 배달본이 도는 것은 다르고, 그 둘을 가르는 관문이 마지막 문이다.
---

# 배포 — npm 에 올린다

> **이 문서는 유지보수자의 것이다.** 쓰는 사람은 [퀵스타트](01-quick-start.md) 로 간다.

**절의 순서가 곧 안전장치다** — 판 → 관문 → 배달본 → 무엇이 실리는지 보기 → 올리기 → 다시 재기.
앞을 건너뛰면 뒤가 무엇을 재는지 알 수 없게 되므로, 순서대로 읽고 순서대로 친다.
각 절은 **무엇**을 하는 자리인가 → **어떻게** 치는가 → 그 자리의 **함정** 순이다.

## 0. 먼저 — 이름이 둘이다

| | 이름 | 어디서 쓰나 |
|---|---|---|
| **패키지** | `universe-front-harness` | `npm i` · `npm rm -g` · `npm publish` · `package.json` 의 `name` |
| **명령** | `universe` | 터미널에서 치는 것 · `package.json` 의 `bin` |

npm 의 `universe` 는 남의 패키지다(crossfilter/universe — 데이터셋 탐색 도구).
그래서 패키지 이름만 `-harness` 를 달았고 **명령 이름은 안 바꿨다** — 문서·도움말·메뉴가
전부 `universe X` 를 가르치고 있어서, 명령을 바꾸면 그 모든 자리가 한꺼번에 낡는다.

### ⚠️ 함정 — 되돌릴 때 헷갈린다

`npm rm -g` 는 **패키지 이름**을 받는다 → `npm rm -g universe-front-harness`.
명령 이름으로 지우면 아무것도 안 지우거나 남의 것을 건드린다.

## 0-1. 위키 전파와 npm 배포는 다른 일이다

| 무엇 | 어디로 | 무엇을 쓰나 |
|---|---|---|
| **npm 배포** | npm 레지스트리 | 이 문서 |
| **위키 전파** | git 위키 / Confluence | `beacon/publish.mjs` — `npm run beacon:publish` |

### ⛔ 함정 — 둘을 같은 동작으로 묶으면 dry-run 이 진짜 발행을 한다

실측(2026-09-08): 위키 발행 스크립트가 `package.json` 에 **`publish` 라는 이름**으로 있었다.
그 이름은 npm 의 **수명주기 스크립트 이름**이라 `npm publish` 가 발행 뒤에 자동으로 부른다.
그래서 **`npm publish --dry-run` 한 번에 Confluence 문서가 진짜로 발행됐다.**
`--dry-run` 은 레지스트리 업로드만 막을 뿐 **수명주기 스크립트의 네트워크 호출은 안 막는다.**
⇒ 이름을 `beacon:publish` 로 바꿔 그 고리를 끊었다. **새 스크립트를 더할 때 npm 이 예약한
이름(`publish`·`prepare`·`prepack`…)을 쓰지 마라** — 안 부른 것이 저절로 돈다.

---

## 1. 판을 올린다

**판은 두 자리에 산다.** 갈리면 부품 시험이 문다
(`버전이 두 자리에서 갈렸다 — package.json … · universe.config.json …`).

```bash
# 두 파일의 "version" 을 같은 값으로 손으로 맞춘다
#   package.json
#   universe.config.json
```

어느 자리를 올릴지는 `redshift/README.md` 의 표가 정한다 — 요약하면 **법칙이 더 많이 잡게
바뀌면 Minor 이상**이다. 소비 은하의 게이트가 갑자기 빨개지기 때문이다.

### 1-1. 적색편이 기록을 남긴다 — 없으면 막힌다

`redshift/v<판>.md` 를 쓴다. 필수 절은 **왜 · 바뀐 것 · 검증(실측)** 이다.

#### ⚠️ 함정 — 「버전마다 남긴다」는 적어 두는 것만으로는 안 지켜진다

적색편이는 그렇게 적혀 있었는데 기록이 v0.5.0 에서 멈춘 채 판은 0.8.0 이었다 —
**세 판이 기록 없이 지나갔고**, 무엇이 바뀌었는지 지금도 알 수 없다. **지어내지 않는다.**
그 빈자리가 이 관문의 근거다.

### 1-2. 문서의 「지금 상태」를 다시 찍는다

```bash
node bin/universe.mjs facts
node bin/universe.mjs facts --check
```

#### ⛔ 함정 — 판 번호를 문서에 손으로 적으면 낡는다

그 자리는 **여덟 판 동안 낡아 있었다**(R84) — 판이 0.9.0 인데 README 는
「v0.1.0, 아직 빅뱅도 관측소도 붙지 않았다」라고 말하고 있었다.
**가장 먼저 읽히는 자리가 가장 낡았다.** 이제 생성 블록(`<!-- FACTS:BEGIN -->`)이 말한다.

## 2. 관문 전부

```bash
node bin/universe.mjs check > /tmp/check.log 2>&1; echo "exit=$?"
```

엔진을 안 빌드했으면 절반을 못 잰다: `cd observatory/engine && npm install && npm run build`.

### ⛔ 함정 — 파이프 뒤에서 종료코드를 읽지 마라

관측 법칙 §3 이다. `cmd | tail` 의 `$?` 는 `tail` 의 것이라 **실패가 성공으로 보인다.**
그래서 위의 명령이 파이프 대신 파일로 받는다.

## 3. 마지막 문 — **배달본이 도는가**

```bash
node observatory/verify-delivery.mjs > /tmp/delivery.log 2>&1; echo "exit=$?"
```

이 검사는 흉내가 아니다. 진짜로:

1. `npm pack` 으로 꾸린다
2. **빈 저장소**를 만들어 그 꾸러미를 깐다
3. `init` 을 친다 — 소비자가 제일 먼저 치는 명령
4. `observe` 와 `check` 를 **거기서** 돌린다
5. 소비자용 관문이 **전부 실렸는지** 대조한다

안을 들여다보려면 `--keep` 을 준다 — 임시 소비 저장소를 지우지 않는다.

### ⛔ 함정 — 원본이 도는 것은 배달본이 도는 것과 다르다

원본에는 모든 파일이 있으니 언제나 초록불이다. 실측: 배달 목록에 `lib/` 이 없어
**42커밋 동안 배달본이 깨져 있었다** — 배달되는 `observatory/*.mjs` 가 `../lib/*.mjs` 를
import 하는데 그것이 없어 `ERR_MODULE_NOT_FOUND` 로 죽었다.
**아무도 배달본을 돌려본 적이 없어서** 몰랐다.

**링크도 여기서 갈린다.** `docs/` 는 배달되지만 `galaxies/`·`redshift/`·`log/`·
`CONTRIBUTING.md` 는 **배달되지 않는다.** 문서에서 그쪽으로 상대 링크를 걸면 원본에서는
성하고 **배달본에서만 깨진다** — 실제로 그렇게 깨진 적이 있다.
⇒ 배달 안 되는 것은 링크가 아니라 **`코드 표기`** 로 적는다.

## 4. 두 명부가 갈리면 안 된다

배달물의 목록이 **두 자리**에 있다. 성질이 달라서 합칠 수가 없다:

| 자리 | 무엇을 정하나 |
|---|---|
| `package.json` 의 `files` | **꾸러미에 무엇이 실리나** — npm 이 읽는다 |
| `lib/delivered.mjs` 의 `DELIVERED` | **`init` 이 소비 저장소에 무엇을 깔아 주나** |

지금은 둘이 갈리면 `init` 이 ⛔ 로 말하고 **exit 1** 한다:
`배달 목록에 선언됐는데 **꾸러미에 없다**`.
그리고 소비자용 관문(`lib/gates.mjs` 에서 `scope` 가 `universe` 가 아닌 것)의 파일은
**전부 `files` 에 실려야 한다.** 안 실으면 그 관문은 소비 저장소에서
「⏭ 없다 — 배달되지 않는 것이다」로 **영영 건너뛴다.** 거짓말은 아니지만
**제품이 하는 일이 아무도 모르게 줄어든다.**

글로브의 끝 `/**` 도 지우지 마라 — `…/**/dist` 로만 적으면 npm 이 **디렉터리만** 맞히고
안의 파일을 안 싣는다. 엔진이 **껍데기**로 배달되고, 그러면 소비 저장소에서 `observe` 가
못 돈다(이 제품의 핵심 측정이다).

### ⛔ 함정 — 갈린 명부는 초록불로 갈린다

실측 사고(2026-09-08): `DELIVERED` 는 `.githooks` 를 **배달한다고 선언**하고 이유까지 적어
뒀는데(「안 배달하면 죽은 규칙이 HEAD 에 며칠 산다」), `files` 에는 없었다. 그리고 `init` 이
**말없이 건너뛰었다** — `init` 은 초록으로 끝나고, 소비 저장소에서는 `universe hooks --install`
만 죽었다. **위반이 늘어난 채로 커밋이 그냥 통과했다.**

## 5. 무엇이 실리는지 **먼저 본다**

```bash
npm publish --dry-run > /tmp/dryrun.log 2>&1; echo "exit=$?"
```

출력에서 볼 것: **파일 수와 크기**, 그리고 **없어야 할 것이 없는가**
(`galaxies/`·`log/`·`nebula/`·`.secret/`·`fixtures/`).

`prepublishOnly` 를 `prepack` 이나 `prepublish` 로 바꾸지 마라. `prepack` 은 `npm pack` 때도
돌아 **자기 자신을 재귀로 부른다**(배달 검사가 안에서 `npm pack` 을 친다). `prepublish` 는 폐기됐다.

### ⚠️ 함정 — `--dry-run` 도 수명주기 스크립트를 진짜로 돌린다

업로드만 안 할 뿐이다. 이 저장소의 `prepublishOnly` 는 §3 의 배달 검사라, dry-run 한 번이
**꾸리고 깔고 돌린다.** 그것은 의도한 것이다 — 대신 §0-1 의 사고처럼 **네트워크를 쓰는
스크립트가 거기 끼면 dry-run 이 진짜 부작용을 낸다.**

## 6. 올린다

```bash
npm publish > /tmp/publish.log 2>&1; echo "exit=$?"
```

### ⛔ 함정 — `--ignore-scripts` 는 §3 의 마지막 문을 통째로 끈다

관문을 건너뛰고 올리지 마라.

## 7. 올린 뒤 — **진짜 레지스트리에서 다시 잰다**

꾸러미가 도는 것과 레지스트리에서 받은 것이 도는 것은 또 다르다. `npm pack` 은 로컬 파일을
그대로 쓰지만 레지스트리는 이름·판·`bin` 해석을 자기 방식으로 한다.

```bash
mkdir /tmp/universe-postpublish && cd /tmp/universe-postpublish
npm init -y
npm i -D universe-front-harness
./node_modules/.bin/universe init  > /tmp/post-init.log  2>&1; echo "exit=$?"
./node_modules/.bin/universe check > /tmp/post-check.log 2>&1; echo "exit=$?"
```

**빈 폴더에서 해라.** 우주 저장소 안이나 이미 깐 저장소에서 재면 원본의 파일이 구멍을 메워
**배달 구멍이 안 보인다** — §3 이 존재하는 이유와 같은 함정이다.

### ⚠️ 함정 — 확인할 때는 `npx` 를 쓰지 않는다

깐 것이 도는지 보는 자리인데, `npx` 는 못 찾으면 **레지스트리에서 받아 와서** 돈다 —
즉 「깔린 것이 돈다」와 「받아 온 것이 돈다」를 못 가른다. 확인은 애매하지 않은 경로로 한다.
그리고 `npx` 로 칠 때 쓰는 이름은 **명령 이름이 아니라 꾸러미 이름**
(`universe-front-harness`)이다 — 명령 이름 쪽은 남의 패키지다(§0). 매일 쓰는 자리의 안내는
[README](../README.md) 와 [퀵스타트](01-quick-start.md) 에 있다.

## ⚪ 아직 못 잰 것

⛔ **모르는 것을 초록으로 접지 않는다.** 배포 시점에 이 문서가 **재지 못한 것**:

| 무엇 | 왜 못 쟀나 |
|---|---|
| 설치 없이 `npx <패키지이름>` 한 방으로 도는가 (깔지 않고 바로) | 레지스트리에 올라간 뒤에만 잴 수 있다. 올리고 나서 §7 에 더해라 |
| 다른 매니저(`pnpm`·`yarn`)로 **레지스트리에서** 깔기 | 넷 다 실측했지만 **그때는 `npm pack` 한 꾸러미로** 했다 — 레지스트리 경로는 아직이다 |
| 판을 내린 뒤(`npm unpublish`) 무엇이 깨지나 | 안 해 봤다. ⛔ 짐작을 적지 않는다 |
