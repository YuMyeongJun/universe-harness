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
  },
});
