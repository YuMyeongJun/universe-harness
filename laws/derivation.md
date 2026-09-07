---
name: derivation
title: 파생 법칙
type: law
scope: matter
applies_to: ["**/*.ts", "**/*.tsx"]
rules: [quality/copy-state]
parent: laws
related: [observation, flatness]
description: 파생값은 **계산**이지 저장이 아니다. props 를 state 로 복사하거나 `useEffect` 로 state 를 동기화하면 진실이 둘이 된다.
---

# 파생 법칙 (Derivation)

> 같은 진실을 두 곳에 두면, 둘은 반드시 갈라진다.

## 규칙

- props 를 `useState` 초기값으로 **복사**하지 않는다.
- `useEffect` 안에서 **state 세터를 불러 동기화**하지 않는다.

```tsx
// ⛔ 진실이 둘 — prop 이 바뀌어도 state 는 그대로다
const [rows, setRows] = useState(value);

// ✅ 파생값은 렌더 중 계산한다. 정말 리셋이 필요하면 `key` 로 리마운트한다
const rows = useMemo(() => sort(value), [value]);
```

## 왜

복사한 순간 **어느 쪽이 진짜인지 아무도 모른다.** prop 이 바뀌면 화면이 낡고,
그것을 고치려고 `useEffect` 를 붙이면 렌더가 한 번 더 돌면서 깜빡인다.
버그는 복사한 자리가 아니라 **한참 뒤 다른 화면에서** 나타난다.

## 재는 법

```bash
universe observe --law derivation --sample 20
```

### ⚠️ 이름으로 세지 마라 — 두 오탐이 실측으로 드러났다

살아 있는 은하(파일 1,407개)에 걸었더니 **13건 중 8건이 오탐**이었다(R107).

| 오탐 | 건수 | 왜 옳은 코드인가 | 어떻게 갈랐나 |
|------|-----:|------------------|---------------|
| `useState(defaultValue)` | 3 | `default*` 는 React·Radix 가 「**처음 값만 준다**」는 뜻으로 쓰는 이름이다 — state 로 옮기는 것이 **비제어 컴포넌트의 정석**이다 | 접두사로 뺀다. 어휘 나열이 아니라 **API 관례**다 |
| `useEffect(() => setLocalStorage(…))` | 5 | `setLocalStorage` 는 `useStorageUtils()` 가 준 **저장소 쓰기 함수**다 | **같은 파일의 `useState` 가 선언한 세터**만 본다 — 이름이 아니라 **선언**으로 |

⚠️ 두 오탐 모양은 엔진 계약 시험의 **known-negative** 로 박혀 있다. 가드를 끄면 시험이 문다.

## 위반 시

고치는 자리는 **복사한 곳**이다. 계산으로 바꾸거나, 정말 리셋이 필요하면 `key` 를 준다.
⚠️ `useEffect` 로 덧대는 것은 고치는 것이 아니라 **진실을 셋으로 만드는 것**이다.
