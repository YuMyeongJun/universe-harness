# @core/fe-agent-contracts

토스 표준 기반 **프론트엔드 공통 계약**과 WikiSkill 추출 프로토콜.
규칙과 프롬프트만 있고 **실행 루프가 없다** — 그것은 코어가 한다.

## 두 레인

관문은 두 레인으로 돈다. **결정론 레인이 먼저** 돌고, 걸리면 LLM 을 부르지 않는다.
재현 가능한 사유가 이미 있는데 비결정 판정을 덧붙일 이유가 없고, 토큰도 아낀다.

| 레인 | 무엇을 보나 |
|------|-------------|
| 정적(결정론) | 기계로 셀 수 있는 것 — 임의 값, 복사본 state, 시맨틱 요소, 이름 형태 |
| 판정(LLM) | 기계가 못 세는 것 — 이름이 의도를 말하는가, 응집이 맞는가, 키보드로 도달 가능한가 |

## 규칙 묶음(preset)

| preset | 내용 | 기본 |
|--------|------|------|
| `toss` | 의도 기반 네이밍 · 얼리 리턴 · 복사본 state · 응집 | 켬 |
| `a11y` | 시맨틱 요소 · 접근 가능한 이름 · 키보드 도달 | 켬 |
| `tailwind` | 임의 값 금지 · raw hex 금지 · 클래스 가독성 | 켬 |
| `house-style` | 화살표 함수만 · 클래스 금지 · `I` 접두사 | **끔(opt-in)** |

`house-style` 은 보편 규칙이 아니라 한 조직의 합의다. 합의 없는 저장소에 걸면 관문이 헛돌고,
**헛도는 관문은 에이전트가 무시하는 법부터 배우게 한다.**

## 쓰는 법

```ts
import { createContractEvaluator, resolveRulePresets } from '@core/fe-agent-contracts';

const evaluator = createContractEvaluator({
  baseRules: resolveRulePresets(['toss', 'a11y', 'tailwind']),
  staticOnly: true,   // 판정 레인을 끄고 결정론 레인만 (오프라인·CI 스모크)
});
```

## 규칙을 고칠 때

**작은 표본에서 오탐 0 은 아무것도 보장하지 않는다.** 실제 코드베이스에 걸어 보고 표본을
눈으로 세라 — 이 패키지도 1,227개 파일에 걸고 나서야 오탐 4종·153건을 발견했다
(`temp\w*` 가 `template…` 을 먹고, 리터럴 기본값을 복사본 state 로 오인하고, `import` 문을
가로지르고, **토큰을 쓰는 `bg-[var(--x)]` 를 벌하고** 있었다).

```bash
yarn harness scan --rule <규칙-id> --sample 20
```

절차와 회귀 테스트 규칙은 [CONTRIBUTING §3](../../../../../CONTRIBUTING.md) 참고.

## WikiSkill 추출

성공(`SOLVED`) 궤적에서만 카드를 뽑는다. **재는 명령이 없는 카드**와 **존재하지 않는 경로를
가리키는 카드**는 버려진다 — 0장도 정당한 결과다. 이 스크립트는 지식을 만드는 것이 아니라
**필터**이고, 무엇을 넣지 않을지가 본체다.
