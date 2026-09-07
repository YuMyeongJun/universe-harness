# @plugins/harness-react-vite

React + Vite + **AWS S3/CloudFront** 스택에 특화된 EnvHarness 플러그인.
코어를 상속해 게이트·배포 시뮬레이션·스테이지·배포 규칙을 채운다.

## CLI

```bash
fe-harness setup [--linked] [--shell]      # 프로젝트 배선(스크립트·run-agent)을 깐다
fe-harness init  [--force]                 # 저장소를 재서 설정 초안을 만든다
fe-harness scan  [--rule <id>] [--sample N]# 관문을 지금 코드에 걸어 본다 (게이트 아님)
fe-harness verify [--stage <id>] [--static-only]   # 지금 워킹트리를 검증한다
fe-harness list                            # 스테이지 목록
fe-harness run <stage-id> [--static-only] [--keep] # 훈련장 한 바퀴
fe-harness-wiki <궤적.jsonl>               # 성공 궤적 → 지식 카드
```

⚠️ **`run` 과 `verify` 를 헷갈리지 마라.**
`run` 은 격리 워크트리에 결함을 주입하고 **도구 없는 에이전트**가 고치게 하는 훈련이고,
`verify` 는 **지금 워킹트리**를 그대로 재는 작업 검증이다.

## 스테이지

| id | 가르치는 것 | 채점의 축 |
|----|------------|-----------|
| `s01-vite-monorepo-tangle` | 빌드가 초록불인데 초기 로드가 무거워지는 자리 | 산출물에서 잰 초기 청크 크기 · 청크 전략 형태 |
| `s02-spa-deeplink` | 정적 오리진에 디렉터리가 없어 나는 SPA 404 | 딥링크 200 **그리고** 없는 자산은 여전히 실패 |
| `s03-cache-invalidation` | 낡은 index × `--delete` → 흰 화면 | 연속 두 번 배포 재현 · 무효화 범위 |
| `s04-toss-quality` | 행동을 유지한 채 품질·접근성을 세운다 | 심어 둔 테스트가 계속 초록 · 관문 통과 |

배포 스테이지는 **네트워크를 쓰지 않는다.** `aws/simulate.ts` 가 S3+CloudFront 를 재현한다 —
배포 사고는 빌드가 초록불인 채로 나므로, 재현 장치가 없으면 이 축은 영원히 안 재진다.

## 설정

프로젝트 고유값은 전부 `fe-harness.config.json` 한 장에 있다.
도는 예시 한 장이 [`fixtures/tiny-galaxy/fe-harness.config.json`](../../../../../fixtures/tiny-galaxy/fe-harness.config.json) 에 있다 —
실제로 네 스테이지가 전부 도는 은하의 설정이다.

⚠️ 원본 저장소의 `examples/*.jsonc` 와 `schema/` 는 **우주로 벤더링할 때 안 가져왔다.**
없는 것을 가리키던 링크였고, 그래서 `universe links` 가 생겼다.

⚠️ 임계값(초기 로드 예산 등)은 **깨끗한 상태의 실측값 이상**이어야 한다.
아니면 결함을 다 고쳐도 통과할 수 없다(실측 사례: 예산 1229KB vs 기준선 1700KB).

## 얹는 법

[docs/02-usage.md](../../../../../docs/02-usage.md) — 우주에서 쓰는 법.
원본 하네스의 `docs/INTEGRATION.md`(연결 3방법과 `--preserve-symlinks` 함정)는 벤더링 대상이 아니었다.
