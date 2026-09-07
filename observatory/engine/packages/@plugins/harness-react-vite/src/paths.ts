/**
 * 플러그인이 아는 **유일한 프로젝트 지식**은 이 구조체다.
 *
 * ⛔ 여기 기본값에 특정 저장소의 이름을 넣지 마라. 기본값은 "설정 파일이 없는 단일 앱
 *    React+Vite 프로젝트" 를 가정한 중립값이다. 프로젝트 고유값은 전부
 *    `fe-harness.config.json`(→ `config.ts`)에서 온다.
 *
 * 스테이지 본문은 이 구조체만 읽는다 — 새 저장소에 얹을 때 고치는 곳이 설정 파일 하나가 되도록.
 */
export interface IReactVitePaths {
  /** 모노레포일 때 앱 워크스페이스 이름. 단일 앱이면 빈 문자열. */
  appWorkspace: string;
  /** 앱 디렉터리(저장소 루트 기준). 단일 앱이면 `.`. */
  appDir: string;
  viteConfig: string;
  appTsconfig: string;
  /** 빌드 산출. CI 의 `aws s3 sync <여기>` 와 **같은 경로**여야 한다. */
  distDir: string;
  storybookDistDir: string;
  /** 배포 워크플로. sync 플래그와 무효화 범위를 여기서 읽는다. */
  deployWorkflow: string;
  /** CloudFront 형상을 코드로 남기는 자리. 콘솔에서만 바꾸면 다음 사람이 이유를 모른다. */
  cloudfrontConfigDir: string;
  /** 형상 파일 이름 규칙. `<ENV>` 가 `dev`/`prod` 로 치환된다. */
  cloudfrontConfigPattern: string;
  /** 공유 패키지 **소스** 진입점을 직접 가리키면 안 되는 경로 패턴(모노레포에서만 의미가 있다). */
  sharedSourceEntry: RegExp;
  /** s04 가 결함 컴포넌트를 심는 폴더. **앱 디렉터리 기준 상대** — 테스트 대상 경로로도 쓴다. */
  seedComponentDir: string;
  /** 초기 로드에 있으면 안 되는 무거운 벤더 */
  heavyVendor: RegExp;
  /** 초기 로드 예산(byte) */
  initialLoadBudgetBytes: number;
  /** 딥링크 채점 대상. 앱의 라우트 진실에서 뽑아 채운다. **비면 s02 가 채점을 거부한다.** */
  deepLinks: string[];
  /** 샌드박스에서 설치 대신 링크할 경로 */
  linkPaths: string[];
}

/** 중립 기본값 — 단일 앱 React+Vite. 어떤 저장소 이름도 들어 있지 않다. */
export const DEFAULT_REACT_VITE_PATHS: IReactVitePaths = {
  appWorkspace: '',
  appDir: '.',
  viteConfig: 'vite.config.ts',
  appTsconfig: 'tsconfig.json',
  distDir: 'dist',
  storybookDistDir: 'storybook-static',
  deployWorkflow: '.github/workflows/deploy.yml',
  cloudfrontConfigDir: 'infra/cloudfront',
  cloudfrontConfigPattern: '<ENV>.json',
  sharedSourceEntry: /packages\/[^/]+\/src/,
  seedComponentDir: 'src/components/__harness__',
  heavyVendor: /echarts|chart\.js|three|monaco/i,
  initialLoadBudgetBytes: 1.2 * 1024 * 1024,
  deepLinks: [],
  linkPaths: ['node_modules'],
};

/** 형상 파일 경로(저장소 루트 기준). 환경 이름은 스테이지가 정한다. */
export const cloudfrontConfigPath = (paths: IReactVitePaths, env: string): string =>
  `${paths.cloudfrontConfigDir}/${paths.cloudfrontConfigPattern.replaceAll('<ENV>', env)}`;

/** 앱 안의 경로를 저장소 루트 기준으로. 단일 앱(`appDir: '.'`)에서 `./` 가 붙지 않게 한다. */
export const inApp = (paths: IReactVitePaths, relative: string): string =>
  paths.appDir === '.' || paths.appDir === '' ? relative : `${paths.appDir}/${relative}`;
