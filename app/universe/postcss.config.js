/**
 * ⚠️ `postcss-import` 가 **tailwind 앞**에 있어야 한다.
 * `styles/index.css` 가 토큰 3층을 `@import` 로 끌어오는데, 이걸 먼저 펴 주지 않으면
 * `@tailwind` 지시어가 도는 시점에 토큰이 아직 그 파일에 없다.
 */
export default {
  plugins: {
    'postcss-import': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
