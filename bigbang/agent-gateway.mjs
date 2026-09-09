/**
 * **OpenRouter 레인** — 구독이 없는 사람도 3차 팽창을 돌 수 있게 한다(R153).
 *
 * ⚠️⚠️ **1차·2차는 원래 모델이 없어도 완전히 돈다**(결정론 규칙 + `--static-only`).
 * 모델이 필요한 것은 **3차뿐**이다. 그래서 이 레인이 여는 것은 3차 하나다 —
 * 「모델 없으면 아무것도 못 한다」는 오해부터 걷어내고 읽어라.
 *
 * ## 이음매는 이미 있었다
 * `nebula.mjs` 의 `ask` 가 그 자리다. 계약은 `({input, sessionId}) => {text, sessionId, isError, …}` 이고
 * `createClaudeAsk`(구독)·`createScriptedAsk`(대본·0원)가 이미 같은 모양을 쓴다.
 * ⇒ **엔진 코어를 안 건드린다.** 레인을 하나 더 얹을 뿐이다.
 *
 * ## CLI 와 무엇이 다른가 — **세션이 없다**
 * `claude -p` 는 `--resume` 으로 **서버가 대화를 들고 있다.** OpenRouter 는 무상태 HTTP 라
 * 이력을 **우리가 날라야** 한다. 그래서 아래 클로저가 `Map<sessionId, messages[]>` 를 든다.
 * 그렇게 해야 `ask` 계약이 그대로고, 부르는 쪽(`nebula.mjs`)은 레인을 몰라도 된다.
 * ⚠️ 이 이력은 **프로세스 안에만** 산다. CLI 세션은 프로세스가 죽어도 남지만 여기는 안 남는다 —
 *    한 주행이 한 프로세스라 지금 구조에서는 같다. 주행을 이어 붙이려면 그때 다시 재야 한다.
 *
 * ## 비용
 * ⛔ **우리가 다시 계산하지 않는다**(`claudeCli.ts` 와 같은 규율). OpenRouter 가 `usage.cost` 로
 *    스스로 보고하는 값을 그대로 나르고, 없으면 `null` 로 둔다 — 추정치를 비용이라 부르지 않는다.
 *    (`usage: { include: true }` 를 보내야 그 칸이 온다.)
 *
 * ⛔ **도구는 애초에 없다.** CLI 는 `--disallowed-tools` 로 꺼야 했지만 여기는 `tools` 를
 *    안 넘기면 없다. 에이전트가 저장소를 훔쳐보는 갈래가 구조적으로 없다.
 */

/**
 * **게이트웨이 둘을 같은 코드로 태운다** — 규약이 같기 때문이다(둘 다 OpenAI 호환).
 *
 * ⚠️ 사용자가 처음 말한 것은 **OmniRoute** 였는데 내가 **OpenRouter** 로 읽고 만들었다.
 *    둘은 **다른 제품**이다 — 확인하고 나서 갈라 적는다(짐작한 것을 그대로 두지 않는다).
 *
 * | | OpenRouter | OmniRoute |
 * |---|---|---|
 * | 형태 | 호스팅 상용 | **오픈소스 · 직접 띄운다**(npm/Docker) 또는 클라우드 |
 * | 기본 주소 | `openrouter.ai/api/v1` | `localhost:20128/v1` |
 * | 모델 ID | `anthropic/claude-sonnet-5` | `cc/claude-opus-4-6` (`cc` = Claude Code) |
 *
 * ⛔⛔ **OmniRoute 의 자동 폴백을 켜지 마라.** 그 제품의 간판 기능이 「구독 먼저 → API 키 →
 * 무료 티어」로 **알아서 갈아타는 것**인데, 그것이 정확히 R145 가 못 박은 사건이다 —
 * 「모드가 바뀌는데 아무도 안 잰다」. 구독인 줄 알고 돌렸는데 청구되는 자리다.
 * ⇒ **한 provider 로 고정한 모델 ID**를 줘라(`cc/…` 처럼). 우주가 대신 골라 주지 않는다.
 */
const GATEWAYS = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    env: 'OPENROUTER_API_KEY',
    /** ⚠️ 구독 레인의 별칭(`sonnet`)은 여기서 안 통한다 — 슬러그가 다르다. */
    model: 'anthropic/claude-sonnet-5',
    keysUrl: 'https://openrouter.ai/keys',
  },
  omniroute: {
    /* 직접 띄우는 것이 기본이다 — 주소는 `OMNIROUTE_BASE_URL` 로 덮는다. */
    baseUrl: 'http://localhost:20128/v1',
    env: 'OMNIROUTE_API_KEY',
    /* ⛔ **기본값을 지어내지 않는다.** provider 조합이 그 사람의 설정에 달렸다 —
       모델은 `--model` 로 받는다(없으면 아래에서 「못 세웠다」로 멈춘다). */
    model: null,
    keysUrl: '그 게이트웨이의 Endpoints 화면에서 발급한다',
  },
};

/** 아는 레인 이름. ⛔ 여기 없는 이름에 주소를 지어내지 않는다. */
export const GATEWAY_LANES = Object.keys(GATEWAYS);

/** 레인 이름 → 설정. 모르는 이름이면 `null`. */
export const gatewayOf = (lane) => {
  const found = GATEWAYS[lane];
  if (!found) {
    return null;
  }
  /* 주소는 환경으로 덮을 수 있다 — 직접 띄운 게이트웨이는 자리가 사람마다 다르다. */
  const override = process.env[`${lane.toUpperCase()}_BASE_URL`];
  return { ...found, lane, baseUrl: override || found.baseUrl };
};

/**
 * @param {{model: string, apiKey: string, systemPrompt: string, timeoutMs?: number, fetchImpl?: Function}} options
 * @returns {(input: {input: string, sessionId: string|null}) => Promise<object>} `ask`
 */
export const createGatewayAsk = ({ model, apiKey, systemPrompt, baseUrl, timeoutMs = 600_000, fetchImpl = fetch }) => {
  /* 세션별 대화 이력. CLI 의 `--resume` 자리를 우리가 대신 든다(위 ⚠️ 참고). */
  const histories = new Map();
  let counter = 0;

  return async ({ input, sessionId }) => {
    const id = sessionId ?? `openrouter-${(counter += 1)}`;
    const messages = histories.get(id) ?? [{ role: 'system', content: systemPrompt }];
    messages.push({ role: 'user', content: input });

    const controller = new AbortController();
    /**
     * ⚠️⚠️ **타이머를 안 끄면 프로세스가 안 죽는다**(R153 에서 밟았다). 처음엔 `clearTimeout` 없이
     * 냈더니 부품 시험이 **끝나고도 안 끝났다** — 답은 다 받았는데 600초짜리 타이머가 살아 있어
     * Node 의 이벤트 루프가 안 비었다. 성공/실패 어느 쪽으로 나가든 반드시 끈다.
     */
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    /* `unref` 로도 되지만 그건 **끄는 것이 아니라 안 세는 것**이다 — 진짜로 끈다. */
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          /* 순위표용 선택 헤더. 저장소 주소는 공개된 것이라 좌표가 아니다. */
          'HTTP-Referer': 'https://github.com/YuMyeongJun/universe-front-harness',
          'X-Title': 'universe-front-harness',
        },
        /* `usage.include` 를 켜야 **비용이 응답에 온다** — 안 켜면 우리가 추정하게 된다. */
        body: JSON.stringify({ model, messages, usage: { include: true } }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          text: '',
          sessionId: id,
          isError: true,
          costUsd: null,
          usage: null,
          /* ⛔ 본문을 그대로 다 흘리지 않는다 — 키가 되비치는 응답이 있다. 앞부분만 나른다. */
          failure: `게이트웨이가 ${response.status} 로 답했다: ${body.slice(0, 200)}`,
        };
      }

      const parsed = await response.json();
      const text = parsed?.choices?.[0]?.message?.content ?? '';
      /* ⚠️ 빈 답을 **성공으로 세지 않는다** — `claudeCli` 가 빈 stdout 으로 한 번 당한 자리다. */
      if (text === '') {
        return {
          text: '',
          sessionId: id,
          isError: true,
          costUsd: null,
          usage: parsed?.usage ?? null,
          failure: `게이트웨이가 빈 답을 줬다 (finish_reason: ${parsed?.choices?.[0]?.finish_reason ?? '모름'})`,
        };
      }

      messages.push({ role: 'assistant', content: text });
      histories.set(id, messages);

      return {
        text,
        sessionId: id,
        isError: false,
        /* ⛔ 추정하지 않는다 — 없으면 null 이다. */
        costUsd: typeof parsed?.usage?.cost === 'number' ? parsed.usage.cost : null,
        usage: parsed?.usage ?? null,
      };
    } catch (error) {
      return {
        text: '',
        sessionId: id,
        isError: true,
        costUsd: null,
        usage: null,
        failure:
          error?.name === 'AbortError'
            ? `게이트웨이가 ${Math.round(timeoutMs / 1000)}초 안에 안 끝났다`
            : `게이트웨이를 못 불렀다(${baseUrl}): ${error?.message ?? error}`,
      };
    } finally {
      clearTimeout(timer);
    }
  };
};
