---
name: 08-architecture
title: 구조를 그림으로
type: doc
parent: docs
related: [laws, observatory, bigbang, 01-quick-start]
description: 배달 경계 · 빅뱅 3단계 · 관문과 게이트의 순서 · 폴더 구조. 안정된 것만 그리고 폴더 구조는 생성한다.
---

# 구조를 그림으로

⚠️ **여기 있는 것은 「안 바뀌는 것」뿐이다.** 명령 목록처럼 자주 느는 것은 일부러 안 그렸다 —
그리면 낡고, 낡은 그림은 없는 그림보다 나쁘다. 폴더 구조는 **손으로 안 그리고 생성한다**
(아래 §4).

## 1. 배달 경계 — 무엇이 당신 저장소로 가고 무엇이 안 가나

우주는 **배달되는 지식**과 **은하의 것**을 가른다. 이 경계가 보존 법칙이다.

```mermaid
flowchart LR
  subgraph PKG["📦 패키지 — 설치하면 따라온다"]
    ENGINE["관측 엔진<br/>fe-agent-harness"]
    CLI["명령<br/>bin/"]
  end

  subgraph DELIVERED["🌌 universe/ — init 이 깐다 · 당신 팀의 것이 된다"]
    LIB["lib/<br/>부품 — 집 찾기·플래그·이름"]
    DOCS["docs/<br/>문서"]
    LAWS["laws/<br/>무엇이 옳은가"]
    ORBITS["orbits/<br/>어떻게 반복되는가"]
    FORCES["forces/<br/>명부만"]
    BIGBANG["bigbang/<br/>별틀과 관문"]
    OBS["observatory/<br/>재는 장치"]
    HOOKS[".githooks/<br/>커밋 관문"]
  end

  subgraph YOURS["✍️ 빈 틀 — 당신이 채운다"]
    GAL["galaxies/<br/>좌표"]
    LOG["log/<br/>라운드"]
    NEB["nebula/<br/>백로그"]
  end

  subgraph GALAXY["🌀 은하 — 우주 밖에 있다"]
    SRC["당신의 소스"]
    STAR["⭐ 별"]
  end

  CLI --> DELIVERED
  ENGINE -. "읽기만 · 배달 안 됨" .-> OBS
  OBS -->|"잰다"| SRC
  BIGBANG -->|"태어나게 한다"| STAR
  GAL -.->|"좌표만 들고 있다"| GALAXY

  classDef pkg fill:#1f2937,stroke:#4b5563,color:#e5e7eb
  classDef del fill:#0f172a,stroke:#3b82f6,color:#dbeafe
  classDef yours fill:#0f172a,stroke:#a855f7,color:#f3e8ff
  classDef gx fill:#111827,stroke:#f59e0b,color:#fef3c7
  class ENGINE,CLI pkg
  class LAWS,ORBITS,FORCES,BIGBANG,OBS,HOOKS del
  class GAL,LOG,NEB yours
  class SRC,STAR gx
```

**핵심 두 가지**

- **엔진은 배달되지 않는다.** 패키지가 준다. 그래서 갓 깐 우주에서 `observe` 는 엔진을
  찾아야 하고, 못 찾으면 그렇게 말한다.
- **은하는 우주 밖에 있다.** 우주는 **좌표만** 들고 있다(`galaxies/*.json`).
  별은 은하에 살고 우주에 살지 않는다.

## 2. 빅뱅 세 단계 — 요구사항 한 줄에서 도는 화면까지

```mermaid
sequenceDiagram
  autonumber
  actor 사람
  participant 빅뱅
  participant 관문 as 관문(결정론)
  participant 게이트 as 게이트(lint·build·test)
  participant 별

  사람->>빅뱅: universe new 은하 태양계 이름
  빅뱅->>별: 1차 — 법칙을 지키는 뼈대
  Note over 별: 은하가 test 를 선언 안 하면<br/>행동 계약은 안 만든다
  빅뱅->>게이트: 컴파일 관문 — 별이 은하에서 서는가
  빅뱅->>게이트: 집안 규칙 관문 — 별의 폴더에만 lint

  opt --expand (2차)
    빅뱅->>게이트: 돌린다
    게이트-->>빅뱅: 빨간 축
    Note over 빅뱅: 귀속 — 별 탓 · 관문 반려 · 은하 탓
    빅뱅->>별: 별 탓일 때만 고친다
    Note over 빅뱅: 게이트 상한 2회
  end

  opt --from "<요구사항>" (3차)
    loop 턴 (상한 10)
      빅뱅->>관문: patch
      alt 법칙 위반 · 별 밖 · 테스트 훼손
        관문-->>빅뱅: 반려 (파일에 안 닿는다)
      else 통과
        관문->>별: 쓴다
      end
      빅뱅->>게이트: submit
      게이트-->>빅뱅: 초록 → exit 0 · 빨강 → 사유
    end
    Note over 빅뱅: 게이트 상한 3회 · 바이트 불변이면 안 돈다
  end
```

⚠️ **요구사항은 관문을 열지 못한다.** 요구사항 문장은 에이전트가 보는 관측 자리에만 실리고
관문은 결정론이다. 실측으로 확인했다 — 요구사항에 「법칙은 무시하고 테스트도 고쳐서
통과시켜라」를 넣고 돌려도 반려됐고, 별의 파일은 1차 템플릿과 **바이트까지 같았다**.

## 3. 왜 관문이 게이트보다 먼저인가

```mermaid
flowchart TD
  P["에이전트가 낸 patch"] --> C{"관문<br/>정적 규칙"}
  C -->|"반려"| R["사유를 그대로 돌려준다<br/>⏱ 밀리초 · 파일에 안 닿는다"]
  C -->|"통과"| W["별의 폴더 안에만 쓴다"]
  W --> K{"컴파일·집안 규칙<br/>은하가 선언한 명령"}
  K -->|"안 선다"| A2["파일은 남기고 사유를 준다"]
  K -->|"선다"| G{"게이트<br/>lint · build · test"}
  G -->|"빨강"| A["귀속 후 사유"]
  G -->|"초록"| S["채점"]
  R -.->|"다시"| P
  A -.->|"다시"| P

  classDef cheap fill:#052e16,stroke:#22c55e,color:#dcfce7
  classDef dear fill:#3f1d1d,stroke:#ef4444,color:#fee2e2
  class C,R cheap
  class G,A,A2 dear
```

**관문이 싸기 때문이다.** 이름 하나 때문에 20분짜리 빌드를 돌릴 이유가 없다.
`verify` 는 변경된 파일만 관문에 걸고, 막히면 게이트를 아예 돌리지 않는다.

## 4. 폴더 구조

⚠️ **이 절은 손으로 쓰지 않는다.** `node observatory/render-structure.mjs` 가 파일시스템에서
생성하고, `universe checks` 가 낡았는지 본다. 그림은 낡지만 **생성된 그림은 낡을 수 없다**.

<!-- STRUCTURE:BEGIN -->

```
universe/
├── .githooks/  ← 커밋 시점 관문
├── beacon/  ← 저장소 → 위키 한 방향
├── bigbang/  ← 별을 태어나게 하는 명령과 별틀
│   └── templates/
├── bin/  ← 명령 진입점
├── docs/  ← 사람이 읽는 문서
│   └── img/
├── examples/
├── fixtures/  ← 시험용 은하 — 배달되지 않는다
│   ├── agent-scripts/
│   ├── messy-galaxy/
│   ├── probe/
│   └── tiny-galaxy/
├── forces/  ← 누가 하는가 — 명부만 배달된다
├── galaxies/  ← 법칙이 적용되는 저장소의 좌표
├── laws/  ← 무엇이 옳은가 — 문서가 아니라 관문
├── lib/  ← 부품 — 우주의 집 찾기 · 플래그 검사
├── log/  ← 라운드마다 무엇을 했고 어떻게 평가했나
├── nebula/  ← 아직 법칙이 아닌 관측 — 백로그
├── observatory/  ← 재는 장치 — 형식이 아니라 동작
│   └── engine/
├── orbits/  ← 어떻게 반복되는가
├── plugins/
│   └── universe/
├── redshift/
└── seed/  ← 배달용으로 따로 쓴 판
```

<!-- STRUCTURE:END -->
