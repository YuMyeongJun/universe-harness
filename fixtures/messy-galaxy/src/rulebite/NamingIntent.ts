/* 일부러 어긴다 — quality/naming-intent. 이 파일은 generate.mjs 가 만든다. 손으로 고치지 마라. */
export const load = async () => {
  const responseData = await fetchData();
  return responseData;
};
