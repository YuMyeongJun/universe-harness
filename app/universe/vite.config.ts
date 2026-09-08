import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 백엔드는 127.0.0.1 에만 바인딩한다(index.ts). 프록시 타깃도 IPv4 로 못 박는다 —
// `localhost` 는 최신 노드·윈도우에서 ::1 로 먼저 풀려 첫 연결이 헛다리를 짚는다.
const BACKEND = 'http://127.0.0.1:8788';

/**
 * 별칭 — **이름은 `tsconfig.json` 이 원천이고 여기는 거울이다.**
 * 둘이 어긋나면 `tsc` 는 통과하는데 번들이 「모듈을 못 찾음」으로 죽는다.
 * (같은 이름을 `components.json` 도 본다 — shadcn CLI 가 파일을 떨굴 자리다.)
 */
const at = (dir: string): string => fileURLToPath(new URL(`./web/src/${dir}`, import.meta.url));

export default defineConfig({
  /**
   * ⛔⛔ **웹과 서버가 같은 `dist/` 를 쓰면 나중에 빌드한 쪽이 앞의 것을 지운다.**
   *
   * ⚠️ 실측: `npm run build:server && npx vite build` 순서로 돌렸더니 vite 가 `dist/` 를
   * 비우면서 **서버 산출물을 통째로 지웠고**, `node dist/index.js` 가
   * `Cannot find module` 로 죽었다. 반대 순서로는 우연히 돌아서 **순서에 따라 되고 안 됐다.**
   * ⛔ 그 종류가 제일 나쁘다 — 「내 기계에선 되는데」가 되고, 원인이 빌드 순서라는 걸 아무도 모른다.
   *
   * ⇒ 웹 산출물만 `dist/web` 으로 옮긴다. 서버는 `tsconfig.server.json` 의 `outDir: dist` 를
   *   그대로 두므로 `node dist/index.js` 를 가리키는 자리들이 **한 곳도 안 바뀐다.**
   */
  build: { outDir: 'dist/web', emptyOutDir: true },
  plugins: [react()],
  resolve: {
    alias: {
      '@components': at('components'),
      '@api': at('api'),
      '@routes': at('routes'),
      '@lib': at('lib'),
      '@hooks': at('hooks'),
    },
  },
  server: {
    host: '127.0.0.1',
    // 포트가 잡혀 있으면 조용히 옮겨가지 않고 **실패**한다.
    // 옮겨가면 브라우저가 죽지 않은 예전 인스턴스를 계속 띄워 "고쳤는데 왜 반영이 안 되지"가 된다.
    strictPort: true,
    port: 5174,
    proxy: { '/api': { target: BACKEND, changeOrigin: true } },
    /**
     * ⛔⛔ **`.data/` 를 지켜보면 안 된다 — 사람이 보는 앞에서 데였다.**
     *
     * 「받아 오기」는 남의 저장소를 **`app/universe/.data/clones/` 안에** 받는다. 그 자리는
     * 이 vite 프로젝트의 **뿌리 안**이라, 클론이 파일을 쏟는 동안 dev 서버가
     * **페이지를 통째로 새로고침한다.** 실측(그 서버 자신의 로그):
     *
     *     [vite] (client) page reload .data/clones/backoffice-dev/public/smarteditor/write.html
     *
     * ⇒ 결과가 **화면에 닿기 전에 컴포넌트가 다시 마운트되고**, 사람은 양식이 비워진 채
     *   **아무 말도 없는 화면**을 본다. 디스크에는 멀쩡히 받아져 있는데도.
     * ⛔ 이건 「느리다」가 아니라 **「화면이 결과를 삼켰다」**이고, 이 저장소가 제일 싫어하는 모양이다
     *   — 사람은 자기가 뭘 잘못했는지 찾으러 간다.
     *
     * ⚠️ `dist/` 도 함께 뺀다: 서버를 다시 빌드할 때마다 같은 이유로 화면이 새로고침된다.
     * ⚠️ 이건 **개발 서버만의 설정**이 아니다 — 이 콘솔은 `npm run dev` 로 뜨는 것이 정상이라
     *    사용자가 실제로 쓰는 것이 이 경로다.
     */
    watch: {
      ignored: ['**/.data/**', '**/dist/**'],
    },
  },
});
