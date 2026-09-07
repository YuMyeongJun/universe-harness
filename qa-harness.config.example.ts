/**
 * 프로젝트별 설정 예시 — 이 파일을 복사해 `qa-harness.config.ts` 로 쓴다.
 *
 * ⚠️ 이 하네스는 특정 앱을 알지 않는다. 경로·문구·셀렉터는 전부 여기서만 정한다.
 *    라이브러리 쪽에 서비스 고유값을 박지 마라 — 박는 순간 재사용이 끝난다.
 */
import { defineConfig } from './src/guards/index.js';

export default defineConfig({
  /**
   * 라우트 레지스트리 — **경로의 유일한 진실의 원천.**
   * spec 에 경로 문자열을 손으로 적지 말고 이름으로 부른다.
   * (손으로 적은 경로가 404 페이지를 재고 PASS 가 뜬 사고가 여러 저장소에서 반복됐다.)
   */
  routes: [
    { name: 'home', path: '/', auth: 'any' },
    { name: 'login', path: '/login', auth: 'forbidden' },
    { name: 'dashboard', path: '/dashboard', auth: 'required' },
  ],

  /**
   * 404·에러 페이지를 알아보는 본문 문구.
   * 서비스마다 다르다 — **기본값을 믿지 말고 실제 404 화면을 열어보고 적어라.**
   */
  notFoundPatterns: [/페이지를 찾을 수 없|존재하지 않는 페이지|not found/i],

  /**
   * 도달로 인정할 최소 본문 길이.
   * 404 페이지는 본문이 짧아서 "위반 0건"으로 보인다 — 그 자리를 막는 하한.
   * 실측 참고: 어떤 404 는 본문 65자·입력 0개·버튼 1개였고, 정상 화면은 입력 18개·버튼 6개였다.
   */
  minBodyTextLength: 200,

  runtimeErrorMark: '[route-error]',
  ticketDir: 'tickets',
});
