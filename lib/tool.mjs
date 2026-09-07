/**
 * **「도구가 없다」와 「도구가 실패했다」를 가른다.**
 *
 * ⚠️⚠️ R45 가 컴파일 관문에서 세운 규율인데 lint·광속 검사는 안 따르고 있었다(실측 R69).
 * 의존성이 안 깔린 저장소에서 둘 다 빨간불이 났다 — 그건 **은하의 잘못이 아니라
 * 우리가 못 잰 것**이다. 못 잰 것을 남의 잘못으로 돌리는 도구는 안 쓰이는 법부터 가르친다.
 */
export const toolMissing = (error) => {
  const text = `${error?.stdout ?? ''}${error?.stderr ?? ''}${error?.message ?? ''}`;
  return error?.code === 127 || error?.code === 'ENOENT'
    || /command not found|not recognized|ENOENT|Couldn't find|Usage Error/i.test(text);
};
