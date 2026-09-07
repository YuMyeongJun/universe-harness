# @plugins/harness-next

**Next.js(App Router)** 스택에 특화된 EnvHarness 플러그인.
코어를 **상속하지 않고** `PluggableHarness` 에 게이트·스테이지·경계 규칙을 **주입**한다.

## 왜 상속이 아니라 주입인가

코어에는 확장 경로가 둘 있다(`@core/fe-agent-harness/README.md`).
이 플러그인이 채워야 하는 자리는 셋뿐이다 — `buildAndTest` · `stages` · `staticRules`.
`IHarnessPlugin` 이 그 셋을 전부 받으므로 **상속 계층을 새로 세울 이유가 없다.**

| 코어 훅 | 이 플러그인 | 어떻게 |
|---------|-------------|--------|
| `executeBuildAndTest` | ✅ 채운다 | 플러그인의 `buildAndTest` (`gates.ts`) |
| `provideStages` | ✅ 채운다 | 플러그인의 `stages` (`stages/`) |
| `provideStaticRules` | ✅ 채운다 | 플러그인의 `staticRules` (`rules/boundaries.ts`) |
| `simulateDelivery` | ⛔ **비운다** | 아래 「배포는 왜 범위 밖인가」 |
| `provideLinkPaths` | — | 설정의 `project.linkPaths` 로 충분하다 |

⚠️ **상속으로 옮겨야 하는 신호는 하나다** — 플러그인 객체에 없는 훅(`provideLinkPaths` 등)을
덮어써야 할 때. 그전까지 상속은 비용만 늘린다.
`@plugins/harness-react-vite` 가 상속을 쓰는 것은 **배포 시뮬레이터와 `verify` 표면까지**
클래스에 붙였기 때문이고, 이 플러그인에는 그 둘이 없다.

## Next 가 React+Vite 와 무엇이 다른가 — 이것이 이 패키지의 존재 이유다

출처를 달지 않은 줄은 여기 없다. **추측으로 플러그인을 만들면 지어낸 지식이 남는다.**

| 축 | React + Vite | Next.js (App Router) | 출처 |
|----|--------------|----------------------|------|
| **빌드 산출** | `dist/` 한 갈래. `dist/index.html` 이 초기 로드의 진실 | `.next/` 가 **두 갈래**로 갈린다 — 브라우저로 가는 `.next/static/…`, 서버에서만 도는 `.next/server/…`. 산출 위치는 `next.config` 의 `distDir` 로 바뀐다 | [output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) — standalone 은 *"does not copy the `public` or `.next/static` folders by default"* |
| **라우팅** | 코드로 등록(`react-router` 등) | **파일 시스템이 라우트 테이블**이다. `app/x/page.tsx` 를 쓰면 `/x` 가 생긴다 — 등록 파일이 없다 | [file-conventions/page](https://nextjs.org/docs/app/api-reference/file-conventions/page) — *"A `page` file is required to make a route segment publicly accessible."* |
| **모듈 경계** | 없다. 모든 코드가 클라이언트로 간다 | `"use client"` 가 **모듈 그래프의 경계**다. 그 파일이 import 하는 것은 **전부** 클라이언트 번들에 들어간다 | [server-and-client-components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — *"all of its imports and the components it directly renders are included in the client bundle"* |
| **환경변수** | `import.meta.env.VITE_*` 만 노출 | `NEXT_PUBLIC_` 만 번들에 들어간다. **접두사가 없으면 빈 문자열로 치환된다** — 값이 새지는 않지만 코드는 브라우저로 가고 자격 증명 자리가 조용히 빈다 | 같은 문서 · "Preventing environment poisoning" |
| **초기 로드** | `index.html` 이 정적으로 무는 `<script>` 집합 | HTML + **RSC 페이로드**(서버 컴포넌트 렌더 결과 + 클라이언트 컴포넌트 자리표시자 + 넘긴 props)가 함께 온다. 클라이언트 청크는 그 자리표시자가 가리키는 것뿐이다 | 같은 문서 · "RSC Payload" |
| **린트** | `eslint` 직행 | `next lint` 와 `next.config` 의 `eslint` 옵션은 **16.0.0 에서 제거**됐다 → ESLint CLI 직행이 정답 | [config/eslint](https://nextjs.org/docs/app/api-reference/config/eslint) 버전 이력 |
| **타입체크** | 별도 `tsc --noEmit` 필요 | `next build` 가 **자기 안에서 돈다**(`typescript.ignoreBuildErrors` 로만 꺼진다) | [config/typescript](https://nextjs.org/docs/app/api-reference/config/typescript) |
| **배포** | S3/CloudFront 같은 정적 호스팅 하나로 수렴 | Node 서버 · Docker · 정적 export · 플랫폼 어댑터로 갈리고 **기능 지원 범위 자체가 대상마다 다르다** | [deploying](https://nextjs.org/docs/app/getting-started/deploying) 표 (Static export = *Limited*, Adapters = *Varies*) |

⚠️ **확인 못 한 것은 확인 못 했다고 적는다.**
- `.next/app-build-manifest.json` 이 App Router 라우트를 청크에 매핑한다는 것은 Next 13–15 에서는
  맞지만 **16 에서는 그 파일을 못 찾았다**(vercel/next.js #85774). 그래서 이 플러그인은
  **매니페스트를 읽지 않고** `static/chunks/**` 를 직접 훑는다. 매니페스트 이름을 코드에 박으면
  Next 버전이 오를 때 조용히 0건을 세게 된다.
- `self.__next_f.push(...)`(RSC 페이로드를 HTML 로 흘리는 전역)는 **공식 문서에 없다.** 구현 세부다.
  그래서 채점 축으로 쓰지 않는다.
- `.next/server/app/<route>.html`(정적으로 굳은 라우트의 산출)도 문서화돼 있지 않다.
  `output.ts` 의 `probePrerender` 가 **판정 불가를 판정 불가로** 내도록 준비만 해 뒀고,
  스테이지 채점에는 아직 쓰지 않는다.

## CLI

```bash
next-harness list                                    # 스테이지 목록
next-harness verify [--stage <id>] [--static-only]   # 지금 워킹트리를 검증한다
next-harness run s01-use-client-boundary [--keep]    # 훈련장 한 바퀴
```

⚠️ **`run` 과 `verify` 를 헷갈리지 마라.**
`run` 은 격리 워크트리에 결함을 주입하고 **도구 없는 에이전트**가 고치게 하는 훈련이고,
`verify` 는 **지금 워킹트리**를 그대로 재는 작업 검증이다.

## 게이트

싼 것 → 비싼 것. **하나라도 죽으면 뒤는 돌리지 않는다.**

```
lint(JSON 산출) → build → 빌드 산출 인구조사 → test → extraGates
```

세 번째 칸이 **Next 고유**다. Next 는 산출 위치를 `distDir` 로 바꿀 수 있어서, 설정이 틀리면
스테이지가 **없는 디렉터리를 훑고 「위반 0건」**을 낸다 — 그 실패는 초록불로 보인다.
그래서 「클라이언트 청크를 몇 개 실제로 셌는가」를 게이트 신호로 올려 둔다. 0개는 실패다.

## 스테이지

| id | 가르치는 것 | 채점의 축 |
|----|------------|-----------|
| `s01-use-client-boundary` | `"use client"` 경계가 잘못돼 서버 몫 모듈이 클라이언트 번들에 들어간다 | 산출물(`static/chunks/**`)에서 잰 서버 모듈 마커 · 서버 산출에는 남아 있는가 · 패널이 여전히 클라이언트인가 |

스테이지가 하나인 것은 **의도한 것**이다. 후보로 검토하고 뺀 것과 이유는
[`src/stages/index.ts`](src/stages/index.ts) 머리말에 적어 뒀다 —
요지는 「번들러가 흔들어 털어낼 수도 있는 결함」과 「문서화되지 않은 산출에 기대는 채점」을
넣지 않았다는 것이다. **재현되지 않는 결함을 심으면 「고쳤다」가 아니라 「원래 그랬다」를
초록불로 배우게 된다.**

### s01 이 재현하는 것

서버에서만 돌 생각으로 쓴 모듈(`ledgerGateway.ts` · 접두사 없는 env 를 읽는다)을
`"use client"` 컴포넌트가 import 한다. **빌드도 린트도 타입체크도 통과한다.**
틀린 것은 산출물의 모양이고, 두 가지가 동시에 일어난다:

1. 서버 몫 **코드가 브라우저로 간다** (`"use client"` 는 그 파일의 import 를 전부 끌고 온다)
2. 자격 증명 자리는 **빈 문자열로 치환**되어 조용히 잘못 돈다

고치는 길은 경계를 옮기는 것이다 — 서버 컴포넌트가 읽어 **직렬화 가능한 props** 로 내린다.
그러면 값은 RSC 페이로드(HTML)로 가고 `static/chunks` 로는 가지 않는다.

⚠️ `server-only` 패키지로 막을 수도 있지만 **설치를 전제하지 않는다.**
그것은 소비 저장소의 의존성을 바꾸는 일이고(엔진 원칙 위반), Next 문서도 설치를 optional 이라 적는다.

## Contract 정적 규칙 (레인: quality)

| id | 무엇을 막나 |
|----|------------|
| `next/env-in-client` | `"use client"` 파일에서 접두사 없는 `process.env` 읽기 |
| `next/use-client-in-barrel` | 배럴(`index.ts`)에 붙은 `"use client"` — 재수출 전부가 클라이언트 그래프로 간다 |
| `next/use-client-in-layout` | `layout` 에 붙은 `"use client"` — 서브트리가 통째로 클라이언트가 된다 |
| `next/pages-api-in-app-router` | `app/` 아래의 `getServerSideProps`/`getStaticProps` — **에러도 없이 무시된다** |

## 배포는 왜 범위 밖인가

**배포 시뮬레이터를 만들지 않는다.** React+Vite 플러그인의 `aws/simulate.ts` 같은 것이 여기엔 없다.

Next 배포는 하나로 수렴하지 않는다 — 공식 문서가 **대상별 기능 지원 표**를 따로 두고 있다:
Node 서버(All) · Docker(All) · 정적 export(**Limited**) · 어댑터(**Varies**).
정적 export 는 ISR · Server Actions · 이미지 최적화 기본 로더 · 쿠키 · 리라이트 등을
**아예 지원하지 않는다.**
([deploying](https://nextjs.org/docs/app/getting-started/deploying) ·
[static-exports](https://nextjs.org/docs/app/guides/static-exports))

즉 「Next 의 배포」라는 단일 대상이 없다. 하나를 골라 재현하면 나머지 저장소에서는
**전부 오탐**이 된다. 헛도는 관문은 에이전트가 **무시하는 법부터** 배우게 한다.

배포 축이 필요한 저장소는 그 스택에 맞는 플러그인을 따로 만들어 `extraStages`·`extraRules` 로
얹어라 — 이 플러그인은 그 자리를 비워 둔다.

## 설정

프로젝트 고유값은 전부 `next-harness.config.json` 한 장에 있다.
찾는 자리는 `<repoRoot>/next-harness.config.json` → `<repoRoot>/harness/next-harness.config.json`
(`--config` 로 직접 지정 가능). 주석(JSONC)과 후행 쉼표를 받는다.

```jsonc
{
  "project": {
    "appWorkspace": "@acme/web",   // 모노레포 워크스페이스 이름. 단일 앱이면 ""
    "appDir": "apps/web",          // 앱 디렉터리. 단일 앱이면 "."
    "appRouterDir": "src/app",     // ⚠️ `app` 인지 `src/app` 인지 반드시 실측하라
    "buildOutputDir": ".next",     // ⚠️ next.config 의 `distDir` 을 바꿨다면 여기도 바꿔라
    "linkPaths": ["node_modules", "apps/web/node_modules"]
  },
  "commands": {
    "build": "yarn build",         // 저장소의 스크립트를 부른다. `next build` 를 직접 부르지 않는다
    "test": "yarn test:run",
    "lintJson": "yarn workspace <WORKSPACE> exec eslint <TARGET> --format json -o <OUT>",
    "extraGates": { "typecheck": "yarn typecheck" }
  },
  "lintTargets": [{ "workspace": "@acme/web", "target": "." }],
  "contract": { "presets": ["toss", "a11y", "tailwind"] }
}
```

⛔ **설정을 안 쓰면 중립 기본값으로 돈다.** 그것이 가장 나쁜 실패다 —
엉뚱한 경로를 재고 초록불을 낸다. 그래서 로더가 경고를 내고, 게이트가 「인구조사 0개」로 막는다.

## 설계상 양보하지 않는 것

- **소비 저장소를 고치지 않는다.** 검증은 그 저장소의 기존 명령을 부르는 것뿐이다.
  `server-only` 설치도, `next.config` 수정도 요구하지 않는다.
- **게이트는 중앙에서 한 번만.** 스테이지도 에이전트도 게이트를 못 돌린다.
- **게이트가 빨간불이면 스테이지 채점을 하지 않는다.** 죽은 빌드 위의 수치는 전부 거짓이다.
- **0개를 훑은 것은 통과가 아니다.** 잰 개수를 항상 `measured` 에 싣는다.

## 스모크

```bash
npm run selftest -w @plugins/harness-next
```

Next 저장소도 네트워크도 없이 수 초 안에 돈다. 확인하는 것:
경계 규칙 4종 검출 · 정상 코드 오탐 0 · 산출물 리더 · **경로가 틀리면 인구조사가 실패** ·
**결함 상태와 고친 상태가 실제로 갈린다** · 지워서 통과시키기 차단 ·
App Router 가 없으면 주입 거부.
