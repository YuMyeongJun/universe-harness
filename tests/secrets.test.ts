/**
 * 비밀정보 가드 시험.
 *
 * 두 방향을 함께 본다:
 *   1. 진짜 비밀은 **잡는다**
 *   2. 정상 TC 문장은 **안 잡는다** — 오탐이 잦으면 사람이 가드를 끈다
 */
import { describe, expect, it } from 'vitest';

import { assertNoSecrets, findSecrets } from '../src/github/secrets.js';

const kinds = (text: string): string[] => findSecrets(text).map((h) => h.kind);

describe('잡아야 하는 것', () => {
  const cases: Array<[string, string]> = [
    ['github-token', 'token=ghp_0123456789abcdefghijABCDEFGHIJ0123'],
    ['aws-access-key', 'AKIAIOSFODNN7EXAMPLE 를 쓴다'],
    ['slack-token', 'xoxb-1234567890-abcdefghij'],
    ['openai-style-key', 'sk-abcdefghijklmnopqrstuvwxyz0123'],
    ['jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
    ['private-key-block', '-----BEGIN RSA PRIVATE KEY-----'],
    ['authorization-header', 'Authorization: Bearer abcd1234efgh'],
    ['url-with-credentials', 'https://admin:hunter2@internal.example.com/path'],
    ['email', '문의는 someone@example.com 으로'],
    ['credential-label', '비밀번호: hunter2!'],
  ];

  for (const [kind, text] of cases) {
    it(`${kind} 을 잡는다`, () => {
      expect(kinds(text)).toContain(kind);
    });
  }

  it('원문을 그대로 흘리지 않는다 — 가려서 보여준다', () => {
    const raw = 'ghp_0123456789abcdefghijABCDEFGHIJ0123';
    const hit = findSecrets(`token=${raw}`)[0];
    expect(hit?.redacted).not.toContain('456789abcdefghij');
    expect(hit?.redacted).toContain('…');
  });

  it('행 번호를 짚는다', () => {
    expect(findSecrets('첫 줄\n둘째 줄\n비밀번호: hunter2')[0]?.line).toBe(3);
  });
});

describe('안 잡아야 하는 것 — 오탐이 잦으면 사람이 가드를 끈다', () => {
  const benign = [
    '1. 비밀번호 입력 필드 확인',
    '2. 비밀번호 변경 버튼 선택',
    '1.1 비밀번호 불일치 안내 문구 노출 됨',
    '3. API Key 발급 메뉴 진입',
    '1. 관리자 계정 로그인',
    '2.1 토큰 만료 안내 노출 됨',
    '진입 경로: 설정 > 계정 > 보안',
    'sk- 로 시작하는 형식 안내 문구 노출 됨',
  ];

  for (const text of benign) {
    it(`정상 문장을 안 잡는다: "${text}"`, () => {
      expect(kinds(text)).toEqual([]);
    });
  }
});

describe('assertNoSecrets', () => {
  it('걸리면 실패다 — ⚪ 가 아니다. 올린 뒤에는 되돌릴 수 없다', () => {
    expect(() => assertNoSecrets('이슈 본문', '비밀번호: hunter2')).toThrow(/원격에 올리기 전에 막았다/);
  });

  it('못 잡는 것이 있다고 메시지에 적는다', () => {
    expect(() => assertNoSecrets('이슈 본문', '비밀번호: hunter2')).toThrow(/완전하지 않다/);
  });

  it('깨끗하면 통과한다', () => {
    expect(() => assertNoSecrets('이슈 본문', '1. 비밀번호 입력 필드 확인')).not.toThrow();
  });
});

describe('관문 자체의 배선', () => {
  it('탐지기가 살아 있다 — 심어 놓은 표본을 잡는다', () => {
    // 패턴 목록이 통째로 비어도 "위반 0건"이 초록으로 보인다. 합성 표본으로 증명한다.
    expect(findSecrets('AKIAIOSFODNN7EXAMPLE').length).toBeGreaterThan(0);
    expect(findSecrets('평범한 한 줄').length).toBe(0);
  });
});
