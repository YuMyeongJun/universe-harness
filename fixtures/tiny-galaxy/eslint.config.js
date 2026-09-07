import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * 최소 린트 설정. **타입 인지 규칙은 켜지 않는다** — 픽스처의 한 바퀴가 몇 초로 끝나야 하고,
 * 타입 인지 규칙은 저장소 전체 타입 그래프를 세운다(실측 은하에서 10.3초 → 21분).
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.harness'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { document: 'readonly', window: 'readonly', console: 'readonly' },
    },
  },
);
