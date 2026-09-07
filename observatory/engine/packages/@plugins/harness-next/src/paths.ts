/**
 * 플러그인이 아는 **유일한 프로젝트 지식**은 이 구조체다.
 *
 * ⛔ 여기 기본값에 특정 저장소의 이름을 넣지 마라. 기본값은 "설정 파일이 없는 단일 앱
 *    Next.js(App Router) 프로젝트" 를 가정한 중립값이다. 프로젝트 고유값은 전부
 *    `next-harness.config.json`(→ `config.ts`)에서 온다.
 *
 * ⚠️ React+Vite 플러그인과 **모양은 같지만 내용이 다르다.** Vite 는 `dist/index.html` 하나가
 *    초기 로드의 진실이지만, Next 는 산출이 서버 몫(`.next/server`)과 클라이언트 몫
 *    (`.next/static/chunks`)으로 갈리고, 어느 청크가 어느 라우트의 것인지는 매니페스트가 들고 있다.
 *    그래서 여기 필드는 「HTML 하나」가 아니라 「두 갈래 산출 + 매니페스트」를 가리킨다.
 */
export interface INextPaths {
  /** 모노레포일 때 앱 워크스페이스 이름. 단일 앱이면 빈 문자열. */
  appWorkspace: string;
  /** 앱 디렉터리(저장소 루트 기준). 단일 앱이면 `.`. */
  appDir: string;
  /** `next.config.{js,mjs,ts}`. 저장소 루트 기준. */
  nextConfig: string;
  appTsconfig: string;
  /**
   * App Router 루트(앱 디렉터리 기준). `app` 또는 `src/app`.
   * ⚠️ Next 는 **파일 시스템이 라우트 테이블**이라, 여기 파일을 하나 쓰면 라우트가 하나 생긴다.
   *    라우트 등록 파일이 따로 없으므로 스테이지는 이 경로만 알면 라우트를 심을 수 있다.
   */
  appRouterDir: string;
  /**
   * 빌드 산출 루트. `next.config` 의 `distDir` 로 바꿀 수 있어 **`.next` 라고 가정하면 안 된다.**
   * 틀리면 스테이지가 빈 디렉터리를 재고 조용히 초록불을 낸다.
   */
  buildOutputDir: string;
  /** 클라이언트 청크가 쌓이는 곳(`<buildOutputDir>` 기준 상대). */
  clientChunksDir: string;
  /** 서버 몫 산출(`<buildOutputDir>` 기준 상대). RSC 로 도는 코드는 여기에만 있어야 한다. */
  serverOutputDir: string;
  /**
   * `output: 'export'` 일 때 정적 산출이 나가는 곳. 이 플러그인은 **읽기만** 한다
   * (배포 시뮬레이터는 만들지 않는다 — README 참고).
   */
  staticExportDir: string;
  /** 스테이지가 결함을 심는 라우트 세그먼트(`appRouterDir` 기준). 실제 라우트와 겹치면 안 된다. */
  seedRouteDir: string;
  /** 샌드박스에서 설치 대신 링크할 경로. */
  linkPaths: string[];
}

/** 중립 기본값 — 단일 앱 Next.js(App Router). 어떤 저장소 이름도 들어 있지 않다. */
export const DEFAULT_NEXT_PATHS: INextPaths = {
  appWorkspace: '',
  appDir: '.',
  nextConfig: 'next.config.mjs',
  appTsconfig: 'tsconfig.json',
  appRouterDir: 'app',
  buildOutputDir: '.next',
  clientChunksDir: 'static/chunks',
  serverOutputDir: 'server',
  staticExportDir: 'out',
  seedRouteDir: '__harness__',
  linkPaths: ['node_modules'],
};

/** 앱 안의 경로를 저장소 루트 기준으로. 단일 앱(`appDir: '.'`)에서 `./` 가 붙지 않게 한다. */
export const inApp = (paths: INextPaths, relative: string): string =>
  paths.appDir === '.' || paths.appDir === '' ? relative : `${paths.appDir}/${relative}`;

/** 빌드 산출 안의 경로를 저장소 루트 기준으로. */
export const inBuildOutput = (paths: INextPaths, relative: string): string =>
  inApp(paths, `${paths.buildOutputDir}/${relative}`);

/** 스테이지가 심는 라우트 폴더(저장소 루트 기준). */
export const seedRoutePath = (paths: INextPaths, relative = ''): string =>
  inApp(paths, `${paths.appRouterDir}/${paths.seedRouteDir}${relative ? `/${relative}` : ''}`);

/** 심은 라우트의 URL 경로. 채점 메시지에 그대로 실린다. */
export const seedRouteUrl = (paths: INextPaths): string => `/${paths.seedRouteDir}`;
