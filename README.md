# common-qa-harness

정책서 → TC 티켓 → Playwright 자동 테스트로 이어지는 QA 파이프라인.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/tc-ticket-template.md](docs/tc-ticket-template.md) | TC 티켓 표준 양식 (현재 v1.1) |
| [docs/tc-lessons.md](docs/tc-lessons.md) | 각 필드의 근거 — 세 저장소 실측 종합 |

## 이 저장소가 지키려는 것

데인 것은 전부 **"틀린 답"이 아니라 "아무것도 안 잰 초록"** 이었다.

- 404 페이지는 본문 65자·입력 0개·버튼 1개라 **"위반 0건"으로 보인다**
- 요소 0개는 "위반 없음"이 아니라 **미도달·셀렉터 오류 신호**다
- 하한·fallback에서의 일치는 **"따라간다"를 증명하지 못한다**
- 에이전트가 TC도 쓰고 스크립트도 쓰면 **자기 채점**이다

그래서 각 TC마다 한 번씩 묻는다:
**"이게 통과했을 때, 아무것도 안 재고도 통과할 수 있는 경로가 있는가."**

## 도구

| 명령 | 하는 일 | 종료 코드 |
|---|---|---|
| `npm run lint:tickets -- <경로>` | TC 티켓(마크다운) 형식 관문 | `0` 통과 / `1` 위반 / **`3` 못 쟀다** |
| `npm run lint:tickets -- --format sheet <경로>` | 16컬럼 시트 스펙 JSON 관문 (G0~G7) | 〃 |
| `… --format sheet --features-dir <경로>` | 위에 더해 `대분류` 를 지식 **폴더 이름**과 대조 (파일은 안 연다) | 〃 |
| `… --require-features-dir` | `--features-dir` 없이 돌면 통과가 아니라 `3` | 〃 |
| `… --json` | 기계가 읽는 출력 (`{ok, exitCode, findings[]}`) | 〃 |

`--json` 의 `findings[]` 항목: `file` · `rule` · `severity`(`violation`\|`unmeasured`) · `tab` · `rowIndex`(스펙 행 순서, 1-based) · `message` · `why`.
`severity` 가 `error` 가 아니라 `violation` 인 이유 — 도구 오류와 헷갈리지 않게 하려는 것이다.
| `npm run gate:redfirst -- <spec> -- <실행명령>` | 생성된 spec 이 "처음부터 통과"하지 않는지 | `0` 수용 / `1` 거부 / **`3` 못 쟀다** |
| `npm test` | 변이 시험 — 각 검사가 실제로 무는지 | |

`exit 3` 은 실패도 통과도 아니다. 대상 파일이 0개이거나 spec 을 받지 못한 경우다.
**0개는 "위반 없음"이 아니라 검사가 아무것도 안 본 것이다.**

## 다른 저장소에서 부르기 (제로 런타임 의존)

`dist/` 는 **커밋되지 않는다**(빌드 산출물). 클론한 뒤 한 번 빌드하면 `node` 로 바로 돈다 —
`tsx` 도 다른 런타임 의존도 필요 없다.

```bash
git clone https://github.com/YuMyeongJun/qa-harness.git
cd qa-harness && npm ci && npm run build
```

그 뒤 **형제 폴더 상대경로**로 부른다. 두 저장소를 같은 부모 폴더 아래 클론하는 것이 규약이다:

```bash
node ../qa-harness/dist/lint/cli.js --format sheet <스펙.json>
node ../qa-harness/dist/lint/cli.js --format sheet --features-dir <지식폴더> <스펙.json>
```

⚠️ **절대경로를 호출하는 쪽에 박지 마라.** 팀원마다 홈 디렉토리가 다르고 Windows 가 섞인다.
⚠️ 폴더 이름은 **저장소 이름(`qa-harness`)** 이다. 클론하면 그 이름이 된다.

## 구성

```
src/
├── config/types.ts      프로젝트별 설정 계약 (앱 고유값은 전부 여기로)
├── lint/                ① TC 정적 관문 — 프로젝트 무관
│   ├── core.ts            판정 어휘(IFinding·Severity) — 입력 형식이 달라도 하나다
│   ├── parse.ts/rules.ts  마크다운 티켓 (규칙 9종)
│   └── sheet/             16컬럼 시트 스펙 (G0~G7 13종 + ⚪ 4종)
├── guards/              ② Playwright 가드 — config 주입식, 앱을 알지 않는다
│   ├── measure.ts         assertMeasured / assertFollows / assertContrast
│   └── reach.ts           createReach — 404·얇은 본문·의도치 않은 리다이렉트를 던진다
├── gate/redFirst.ts     ③ 빨간불 관문 — 자기 채점 방지
└── github/guards.ts     ④ 원격 계층 가드 — API 가 만드는 거짓 통과 자리
tests/                   변이 시험 (검사가 죽어 있는지 확인하는 층)
```

새 프로젝트에 붙이려면 `qa-harness.config.example.ts` 를 복사해 라우트와 404 문구만 채우면 된다.

## 원격 계층 가드 (`src/github/guards.ts`)

⭐ **「호출이 성공했다」와 「잴 것이 있었다」를 다른 칸에 둔다.**

| 가드 | 막는 자리 |
|---|---|
| `assertQueryMeasured` | 200 + 빈 배열. 라벨 소실·쿼리 오류·권한 부족이 **"없음"으로 읽히는** 자리 |
| `assertLabelsExist` | 라벨이 사라졌는데 쿼리가 조용히 빈 결과를 주는 자리 |
| `assertPaginationExhausted` | 페이지가 끊겼는데 부분 결과를 전체로 읽는 자리 |
| `assertWriteVerified` | **쓰기 성공 ≠ 쓰기 확인.** 쓰고 나서 다시 읽어 확인한다 |
| `assertNotRateLimited` | rate limit 을 성공으로 세지 않는다 (⚪ 로 던진다) |
| `assertScopeOrUnmeasured` | 스코프가 없는데 조용히 건너뛰어 "동기화됐다"로 읽히는 자리 |
| `repoCoordinateOf` | 저장소 주소를 코드에 적지 않고 **`origin` 에서 파생**한다 |

**좌표는 지어내지 않는다.** GitHub Enterprise 는 일부러 `null` 이다 — 그 호스트의 위키 주소 규칙을
확인한 적이 없기 때문이다. 확인 안 한 것을 맞다고 가정하는 것이 지어내기다.
SSH 짧은 형식(`git@github.com:o/r.git`)은 `null` 이 아니다 — 모르는 호스트가 아니라 **아는 호스트의 다른 표기**다.

**같은 `null` 에 두 판정을 준다. 판정은 「무엇을 하려던 참이었나」가 정한다:**

| 부르는 쪽 | `null` 이면 | 왜 |
|---|---|---|
| **쓴다** (`requireRepoCoordinate`) | **실패** | 엉뚱한 저장소에 쓰면 되돌리기가 비싸다. 어디에 쓸지 모르는데 쓰지 않는다 |
| **잰다** (`repoCoordinateOf` → ⚪) | **못 쟀다** | 못 잰 건 아무것도 안 망친다. 실패로 내면 사람이 검사를 끈다 |

## 참고

- `universe-harness` — ⚪ "못 쟀다" 규율, 계약 우선 장치 (github.com/YuMyeongJun/universe-harness)
- `harness-01` — Playwright 거짓 통과 4종 실측
- `catalog-ppt-tc-case` — TC 150건 작성 경험, 분해 기준
- `qa-workflow` — 16컬럼 시트 규격 G0~G7, 실행 오케스트레이션. 시트 어댑터가 그 규격을 기계로 내린 것이다

## 시트 어댑터 (`--format sheet`)

`qa-workflow` 의 TC 문장 작성 규격은 **749줄 SKILL.md 끝의 산문 체크리스트 15줄**이 유일한 관문이었다.
산문 체크리스트는 모델이 바쁘면 흘린다. 그중 **기계로 잴 수 있는 13개**를 규칙으로 내렸다.

핵심 개념은 **액션 그룹** — 판별 키가 `no` 가 아니라 **`content`(테스트항목) 문자열 완전 일치**다.
그룹을 쪼개면 워커가 같은 액션을 여러 번 수행해 데이터가 파손되고 후속 행이 오판정된다.

**입력 형태가 전체/부분을 가른다** — 별도 필드가 필요 없다:

| | 명령 | 입력 | 번호 재시작 판정 |
|---|---|---|---|
| 전체 | `create-from-template --spec` | `{components: [...]}` 객체 | 항상 새 시트를 만들므로 **첫 그룹도 `1.` 이어야 한다** |
| 부분 | `append-rows --rows` | `[...]` 행 배열 | **첫 그룹만 ⚪**, 두 번째 그룹부터 잰다 |

번호 재시작 경계는 탭도 스펙도 아니라 **`소분류`(없으면 `중분류`) 그룹**이다.

⛔ **지식 베이스가 있어야 재는 것**(인용 원문 대조 · 분류 사전 · 명칭 근거 · 사전조건 판단)은
조용히 통과시키지 않고 **⚪ 로 이름을 부른다.** 조용히 넘기면 "다 쟀다"로 읽힌다.

⚠️ **유니코드 정규화**: 들어오는 자리에서 **NFC 로 한 번** 맞춘다. macOS 파일시스템은 한글을
NFD(자모 분해)로 돌려주고 JSON 값은 NFC 라, 정규화하지 않으면 비교도 길이도 전부 어긋난다
(실측: 지식 폴더 10개 중 7개가 NFD였고 `상담관리` 는 NFC 4자 / NFD 11자다).

⚠️ **언어 종속**: G2·G3 의 종결 어미 규칙은 한국어 문형이다. 다른 언어 프로젝트엔 서지 않는다.
조사 검출은 `을`·`를`·`에서`만 본다 — `이`·`가`는 `추가`·`참가` 같은 어절과 기계적으로 구별되지 않는다.
