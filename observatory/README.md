---
name: observatory
title: 관측소
type: index
parent: universe
related: [observation, light-speed]
description: 별이 실제로 도는지 기계가 재는 곳. 이 우주가 정원과 갈리는 지점이다.
---

# 관측소 (Observatory)
> **형식이 아니라 동작을 잰다.**

## 무엇을 하는 기관인가
다른 기관들은 「이렇게 하라」고 말한다. 관측소는 **「지금 정말 그런가」를 기계에게 묻는다.**
재는 대상이 셋이라 장치도 셋이고, 셋은 서로를 대신하지 못한다 — 무엇을 고쳤는지에 따라 부르는 것이 달라진다.

| 장치 | 무엇을 보나 | 언제 부르나 |
|------|------------|------------|
| `verify-laws.sh` | **우주 자신의 형식** — frontmatter · 필수 절 · config 정합 | 우주 문서를 고칠 때마다 |
| `observe.mjs` | **은하의 법칙 위반 수** + 문서에 적힌 수치가 낡았는가 | 법칙을 고칠 때 · 주기적으로 |
| `verify.mjs` | **별이 도는가**(게이트) + **법칙을 지키는가**(관문) | 코드를 고친 뒤 |

## 재는 법 — 어떻게 부르는가
```bash
universe laws          # 우주 자신의 형식 검사
universe links         # 문서 링크가 실재하는 곳을 가리키는가
universe observe       # 은하의 법칙 위반을 잰다
universe verify        # 게이트 + 관문
```

명령이 아직 안 이어져 있으면 `universe X` 를 `node <저장소>/bin/universe.mjs X` 로 바꿔 치면 같다. 실측 (실측 은하 A · `--static-only`):

```
[CONTRACT SKIPPED] 변경된 소스가 없다
✅ lint:@acme/app-web  error 0 · warning 63
✅ lint:@shared/modules · @shared/components   error 0
✅ build / test / typecheck:e2e / typecheck:node   exit 0
```

## 무엇을 끼워 뒀나
이미 만들어 둔 엔진을 끼운다 — `fe-agent-harness`(빌드·selftest 통과 상태).

| 층 | 무엇 | 우주에서의 역할 |
|----|------|----------------|
| 게이트 | lint(JSON 산출) · build · test · typecheck | 별이 **도는가** |
| 관문(Contract) | 법칙의 결정론 레인 + 판정 레인 | 별이 **법칙을 지키는가** |
| 스테이지 채점 | 샌드박스에 결함을 심고 고치게 한 뒤 잰다 | 우주가 **가르치는가** |
| 토큰 감사 | 라운드당 비용 | 아직 없음 → 성운 |

엔진은 `observatory/engine` 에 **벤더링**돼 있다. 정본은 `fe-agent-harness` 저장소라 이것은 **자산이 아니라 산출물**
이다(보존 법칙 §자산 vs 산출물) — 그래서 `verify-laws.sh` 가 문서 법칙에서 제외한다. 경로는 `universe.config.json`
의 `observatory.path` 가 들고 있다.

```bash
cd observatory/engine && npm install && npm run build && npm run selftest
```

## 함정
- ⛔ **게이트가 빨간불이면 채점하지 않는다.** 죽은 빌드 위의 수치는 전부 거짓이다.
- ⛔ **파이프 뒤에서 판정하지 않는다**(관측 법칙 §3). 판정이면 파일로 떨구고(`cmd > log 2>&1; echo "exit=$?"`) 그다음에 걸러라.
- **`observatory.path` 에 절대경로를 박지 마라.** 그 값은 **우주 루트 기준 상대경로**(`observatory/engine`)이고 스크립트가 `path.resolve(root, …)` 로 푼다. 박으면 이 우주는 그 노트북에서만 돈다.
- 게이트는 **중앙에서 한 번만** 돌린다. 타입 인지 lint 저장소에서 동시에 돌리면 10.3초짜리가 21분이 된다.

## 왜 이렇게 정했나
- **왜 형식이 아니라 동작인가** — 앞선 두 정원은 frontmatter·필수 절 같은 **형식**만 lint 로 검사하고 동작은
  사람이 봤다. 그 대가가 기록에 남아 있다: 릴리스 가드가 낡아 운영 배포가 즉시 실패했고, 패키지 핀 간극으로
  **6일간 설치가 조용히 깨져** 있었다. 형식 lint 는 못 잡는다 — 우주와 정원이 갈리는 지점이 여기다.
- **왜 관문이 게이트보다 먼저인가** — 관문이 **싸기 때문**이다. 이름 하나 때문에 20분짜리 빌드를 돌릴 이유가 없다. `verify.mjs` 는 변경된 파일만 관문에 걸고, 막히면 게이트를 아예 돌리지 않는다.

## 무엇이 붙었나 (2026-09-04 · P2)
| 엔진 자산 | 우주에서의 장치 | 상태 |
|-----------|----------------|------|
| `scanCodebase` + `RULE_PRESETS` | `observe.mjs` — 법칙별 위반 실측 · 커버리지 · **문서 드리프트** | ✅ |
| 게이트(lint JSON · build · test · typecheck) | `verify.mjs` | ✅ |
| 관문 Contract (정적 + 판정 2레인) | `verify.mjs` — 은하가 켠 법칙만 건다 | ✅ |
| 형식 검사(우주 자신) | `verify-laws.sh` | ✅ |
| 샌드박스 · 스테이지 · reward · 궤적 | **P3 빅뱅** — 별이 태어나는 자리에서 채점한다 | ⬜ |
| S3/CloudFront 배포 시뮬레이터 | 은하가 정적 배포를 할 때 | ⬜ |
| 토큰 경제 감사 | 성운 | ⬜ |
