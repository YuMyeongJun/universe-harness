---
name: cohesion
title: 응집 법칙
type: law
scope: matter
applies_to: ["**/*.tsx"]
rules: [quality/cohesion]
parent: laws
related: [observation, flatness]
description: 한 컴포넌트가 boolean prop 으로 여러 화면을 겸업하지 않는다. 위반은 **정의하는 쪽**에서 본다 — 고칠 수 있는 자리가 거기다.
---

# 응집 법칙 (Cohesion)

> boolean prop 이 셋을 넘으면, 그것은 컴포넌트가 아니라 **분기표**다.

## 규칙

한 여는 태그에 boolean prop 이 **3개 이상**이면 위반이다.
축약형(`<Foo bar />`)과 리터럴(`bar={true}`)을 함께 센다.

```tsx
// ⛔ 하나가 여러 화면을 겸업한다
<FormModal shouldCloseOnOverlayClick={false} shouldCloseOnEsc={false} showCloseButton={false} />

// ✅ 쓰임이 다르면 컴포넌트가 다르다
<AlertModal />
```

## 왜

boolean prop 셋이면 조합이 여덟이다. 그 여덟을 **한 컴포넌트가 다 감당**하고 있다는 뜻이고,
읽는 사람은 어느 조합이 실제로 쓰이는지 알 수 없다.
호출부마다 다른 화면이 나오는데 이름은 하나다.

## 재는 법

```bash
universe observe --law cohesion --sample 20
```

### ⚠️ 정규식으로 세지 마라

이 규칙은 **처음에 0건을 냈다.** 위반이 없어서가 아니라 **탐지가 셋 다 어긋나서**였다(2026-09-04 실측).

| 옛 정규식이 요구한 것 | 실제 JSX |
|---|---|
| 첫 prop 이 `is*` | `shouldCloseOnEsc`·`showCount`·`useHighlight` 로 시작한다 |
| 전부 `={true}`/`={false}` | boolean prop 은 **대개 축약형**(`<Foo bar />`) |
| 셋이 딱 붙어 있을 것 | `className` 한 줄만 끼면 놓친다 |

**0건은 무죄가 아니다.** 규칙을 JSX 여는 태그 훑개(문자열·주석·중괄호 인지)로 바꾸자
같은 코드에서 **21건**이 나왔고, 21건 전부 소스를 열어 확인해 **오탐 0** 이었다.

⚠️ 훑개는 새 오탐 통로를 연다 — **제네릭 인자 목록이 여는 태그와 똑같이 생겼다.**
`<TData, TError, TVariables, TContext>` 같은 것이 26건 중 5건 섞였다.
최상위 `,` 나 `extends`/`keyof`/`typeof` 가 보이면 버리는 가드가 **반드시** 있어야 한다.

### 쓰는 쪽을 껐을 때 무엇을 잃었나 — 실측 (R116)

살아 있는 은하(파일 1,407개)에서 **여는 태그 하나에 boolean 축약 prop 이 3개 이상**인 자리를 셌다.

| | 자리 |
|---|---:|
| 전체 | **29** |
| 그중 **우리가 정의한** 컴포넌트 | **0** |
| 남의 것(`Input`·`Modal`·`Carousel`) | **29** |

**맞바꿈이 옳았다.** 쓰는 쪽을 켜면 고칠 수 없는 자리 스물아홉을 벌하고, 얻는 것은 없었다.
⚠️ 이것은 **이 은하의 수**다. 자기 프리미티브를 많이 쓰는 팀에서는 달라질 수 있다.

⛔ **이 수를 세 번 틀렸다(R116·R117).** ① 손 정규식이 중괄호 안의 식별자를 축약 prop 으로 세어
**41**. ② 중괄호를 통째로 걷었더니 `={false}` 까지 사라져 **8**. ③ **엔진의 훑개를 부품으로
꺼내 쓰자 29** — 이것이 맞다(문자열·주석·중괄호·제네릭 인자를 다 안다).
**결론(우리 것 0)만 세 번 다 같았다.**

⇒ 밖에서 이 법칙과 같은 것을 재려면 **`booleanPropsOf`·`jsxTagEnd` 를 쓴다.** 정규식을 새로
쓰지 않는다 — 세 번 다 틀렸다.

## 위반 시

**컴포넌트를 쪼갠다.** boolean 을 지우는 것이 아니라 쓰임을 가른다.

실측 은하에서 21건은 **두 컴포넌트로 수렴했다**(boolean prop 10개짜리 하나, 16개짜리 하나).
처방이 가리키는 자리가 정확히 그 둘이다 — 21곳을 고칠 일이 아니라 2곳을 쪼갤 일이다.
