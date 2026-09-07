/**
 * 레인: quality — **Next 의 서버/클라이언트 경계**.
 *
 * 공통 계약 패키지가 아니라 여기 있는 이유: 이 규칙들은 React Server Components 에 매여 있다.
 * Vite SPA 에 얹으면 전부 오탐이 된다(`"use client"` 라는 개념이 없다).
 *
 * 근거는 전부 Next 공식 문서다 — 지어낸 규칙은 지어낸 지식을 만든다.
 *   · `"use client"` 는 파일 표시가 아니라 **모듈 그래프의 경계**다:
 *     "Once a file is marked with `"use client"`, all of its imports and the components it
 *      directly renders are included in the client bundle."
 *     https://nextjs.org/docs/app/getting-started/server-and-client-components
 *   · 접두사 없는 환경변수는 클라이언트 번들에서 **빈 문자열로 치환**된다:
 *     "In Next.js, only environment variables prefixed with `NEXT_PUBLIC_` are included in the
 *      client bundle. If variables are not prefixed, Next.js replaces them with an empty string."
 *     (같은 문서 · "Preventing environment poisoning")
 *     ⚠️ 그러므로 「비밀값이 브라우저로 샌다」가 아니다. **코드가 브라우저로 가고, 자격 증명
 *        자리는 빈 문자열이 되어 조용히 잘못 돈다.** 빌드는 초록불이다.
 *   · `getServerSideProps`/`getStaticProps` 는 Pages Router 전용이다 — `app/` 아래에서는
 *     아무 일도 하지 않는다(에러도 안 난다).
 */
import type { IPatchFile, IStaticRule } from '@core/fe-agent-harness';
import { findAll, isSource, patternRule } from '@core/fe-agent-contracts';

/** 파일 첫머리에 `"use client"` 가 선언돼 있는가(주석·빈 줄은 건너뛴다). */
export const hasUseClient = (content: string): boolean =>
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(content);

/** App Router 아래인가. `appRouterDir` 은 설정값이지만 정적 규칙은 파일 경로만 본다. */
const inAppRouter = (file: IPatchFile): boolean => /(?:^|\/)app\//.test(file.path);

const isBarrel = (file: IPatchFile): boolean => /(?:^|\/)index\.tsx?$/.test(file.path);
const isLayout = (file: IPatchFile): boolean => /(?:^|\/)layout\.tsx?$/.test(file.path);

export const NEXT_BOUNDARY_RULES: IStaticRule[] = [
  {
    id: 'next/env-in-client',
    lane: 'quality',
    applies: (file) => isSource(file) && hasUseClient(file.content),
    /* `NEXT_PUBLIC_` 이 아닌 `process.env.X` 를 클라이언트 파일에서 읽는 것. */
    scan: (file) =>
      findAll(
        file,
        /process\.env\.(?!NEXT_PUBLIC_)([A-Z0-9_]+)/,
        'next/env-in-client',
        '`"use client"` 파일에서 접두사 없는 환경변수를 읽었다. Next 는 이것을 **빈 문자열로 치환**하므로 값이 새지는 않지만, 그 코드는 브라우저로 가고 자격 증명 자리는 조용히 비어 돈다(빌드는 초록불이다). 서버 컴포넌트에서 읽어 **직렬화 가능한 props 로 내려라.** 정말로 공개해도 되는 값이면 `NEXT_PUBLIC_` 을 붙여라 — 그 값은 빌드 시점에 번들에 박히고 그 뒤로는 바뀌지 않는다.',
      ),
  },
  patternRule({
    id: 'next/use-client-in-barrel',
    lane: 'quality',
    applies: (file) => isSource(file) && isBarrel(file),
    pattern: /^\s*['"]use client['"]/,
    fix: '배럴(`index.ts`)에 `"use client"` 를 붙이면 **그 배럴이 다시 내보내는 것 전부**가 클라이언트 모듈 그래프에 들어간다. 한 컴포넌트 때문에 무관한 모듈까지 브라우저로 간다. 지시어는 **정말로 클라이언트여야 하는 잎 파일**에 붙여라.',
  }),
  patternRule({
    id: 'next/use-client-in-layout',
    lane: 'quality',
    applies: (file) => isSource(file) && isLayout(file),
    pattern: /^\s*['"]use client['"]/,
    fix: '`layout` 에 `"use client"` 를 붙이면 그 아래 서브트리가 통째로 클라이언트가 된다. 상호작용이 필요한 부분만 잘라 별도 클라이언트 컴포넌트로 만들고, 레이아웃은 서버로 두어라.',
  }),
  patternRule({
    id: 'next/pages-api-in-app-router',
    lane: 'quality',
    applies: (file) => isSource(file) && inAppRouter(file),
    pattern: /export\s+(?:async\s+)?(?:function|const)\s+(getServerSideProps|getStaticProps|getInitialProps)\b/,
    fix: '`getServerSideProps`·`getStaticProps` 는 Pages Router 전용이다. `app/` 아래에서는 **에러도 없이 그냥 무시된다** — 화면은 데이터 없이 렌더된다. App Router 에서는 서버 컴포넌트가 직접 `await` 하면 된다.',
  }),
];
