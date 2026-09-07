/**
 * 프로젝트별 설정 — 이 하네스는 특정 앱을 알지 않는다.
 *
 * 소비 프로젝트가 `qa-harness.config.ts` 에서 이 타입을 채워 넘긴다.
 * 여기에 특정 서비스의 경로·문구·셀렉터를 박지 마라. 박는 순간 재사용이 끝난다.
 */

/** 라우트 하나. 경로 문자열이 아니라 **이름**으로 참조하기 위한 최소 단위. */
export interface IRoute {
  /** spec 에서 이 이름으로만 부른다. 오타는 즉시 죽는다. */
  name: string;
  path: string;
  group?: string;
  /**
   * 인증 컨텍스트.
   * - `required`  : 로그인 상태여야 한다
   * - `forbidden` : 로그인 상태로 열면 튕긴다 (클린 컨텍스트로 열어야 한다)
   * - `any`       : 무관 — **"안 쟀다"는 뜻이다.** 리포트에서 ⚪ 로 집계된다
   */
  auth?: 'required' | 'forbidden' | 'any';
  /** 의도적으로 404 를 확인하는 대상 — 라우터에 없는 것이 정상이다. */
  expect404?: boolean;
  note?: string;
}

export interface IQaHarnessConfig {
  /** 라우트 레지스트리 — 경로의 유일한 진실의 원천 */
  routes: IRoute[];
  /**
   * 404·에러 페이지를 알아보는 본문 문구 패턴.
   * 서비스마다 다르므로 **반드시 각 프로젝트가 정한다.** 기본값을 믿지 마라.
   */
  notFoundPatterns: RegExp[];
  /**
   * 도달로 인정할 최소 본문 길이(자).
   * 404 페이지는 본문이 짧아서 "위반 0건"으로 보인다 — 그 자리를 막는 하한.
   */
  minBodyTextLength?: number;
  /** 런타임 에러 신호로 볼 console 접두어 (예: '[route-error]') */
  runtimeErrorMark?: string;
  /** TC 티켓 마크다운이 있는 디렉토리 (tc-lint 기본 대상) */
  ticketDir?: string;
}

export const defineConfig = (config: IQaHarnessConfig): IQaHarnessConfig => config;
