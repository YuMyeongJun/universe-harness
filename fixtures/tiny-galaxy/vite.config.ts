
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * 픽스처 은하의 Vite 설정.
 *
 * `manualChunks` 를 **함수형**으로 둔다 — s01 스테이지가 이 자리를 object 형으로 되돌려
 * 결함을 심는다 — 주입기는 이 이름 뒤의 여는 괄호를 찾는다.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react')) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
