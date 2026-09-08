#!/usr/bin/env bash
# **「끝났는가」가 세 갈래로 갈리는가** — 사람의 계획 마지막 칸이다.
#
# ⛔ 브라우저를 안 띄운다. **얼려 둔 리포트**로 잰다 — 어느 기계에서도 같은 답이 나온다.
# ⛔ 종료 조건은 「fail 0」이 아니라 **「판단하지 않은 fail 0」**이다.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
say () { echo "  $1"; }

[ -f qa/dist/run/cli.js ] || { echo "⚪ 못 쟀다 — qa/dist 가 없다(배달본이거나 안 지었다)."; exit 3; }

# ① 판정이 안 붙은 화면 시험 → **남았다**(1)
node observatory/loop-state.mjs --galaxy whitehole --report qa/tests/fixtures/playwright/real-run.json >/tmp/loop1.txt 2>&1
[ "$?" -eq 1 ] && grep -q '판단하지 않은 fail' /tmp/loop1.txt \
  && say "✅ 판정이 없으면 **남았다**고 말한다(exit 1)" \
  || { say "⛔ 판정이 없는데 끝났다고 했거나 다른 이유로 죽었다"; cat /tmp/loop1.txt; fail=1; }

# ② 판정이 붙으면 → **끝났다**(0). ⛔ 이 갈래가 없으면 「끝났다」는 닿을 수 없는 코드다.
node observatory/loop-state.mjs --galaxy whitehole --report fixtures/loop/judged-run.json >/tmp/loop2.txt 2>&1
[ "$?" -eq 0 ] && grep -q '판단하지 않은 fail 0' /tmp/loop2.txt \
  && say "✅ 판정이 붙으면 **끝났다**고 말한다(exit 0)" \
  || { say "⛔ 판정이 붙었는데 안 끝났다고 한다"; cat /tmp/loop2.txt; fail=1; }

# ③ 화면 시험을 **선언 안 한** 은하 → ⚪ 못 쟀다(3). 「화면이 멀쩡하다」가 아니다.
node observatory/loop-state.mjs --galaxy whitehole >/tmp/loop3.txt 2>&1
[ "$?" -eq 3 ] && grep -q 'commands.e2e' /tmp/loop3.txt \
  && say "✅ e2e 를 선언 안 하면 **못 쟀다**(exit 3) — 초록이 아니다" \
  || { say "⛔ 선언이 없는데 ⚪ 가 아니다"; cat /tmp/loop3.txt; fail=1; }

# ④ ⛔ **못 읽는 입력은 ⚪ 다 — 날 스택이 아니다.**
#    실측: JSON 이 아닌 파일을 주니 `JSON.parse` 가 그대로 터져 **스택만** 남았다(exit 1).
#    사람은 그 화면에서 아무것도 못 하고, 그건 「끝났는가」의 답도 아니다.
bad="$(mktemp -d)/notjson.json"; printf '%s\n' '이건 JSON 이 아니다' > "$bad"
node observatory/loop-state.mjs --galaxy whitehole --report "$bad" >/tmp/loop4.txt 2>&1
[ "$?" -eq 3 ] && grep -q '리포트를 못 읽었다' /tmp/loop4.txt \
  && say "✅ 못 읽는 입력은 **⚪ 못 쟀다**로 말한다 (스택을 안 뱉는다)" \
  || { say "⛔ 못 읽는 입력에 ⚪ 가 아니다"; cat /tmp/loop4.txt; fail=1; }

# ── 반복이 **멈출 줄 아는가** ───────────────────────────────────────────
#
# ⛔ 사람의 계획은 「fail 0 이 될 때까지 반복」인데, **멈추는 자리가 없으면** 그건 도구가 아니라
#    사람이 안 보는 사이에 도는 물건이다. 넷 다 닿는지 잰다.
# ⛔ 브라우저를 안 띄운다 — 얼려 둔 리포트로 잰다.

node observatory/repeat.mjs --galaxy qa-e2e --max 4 --stall 2 \
  --report qa/tests/fixtures/playwright/real-run.json >/tmp/rep1.txt 2>&1
[ "$?" -eq 1 ] && grep -q '안 줄어든다' /tmp/rep1.txt \
  && say "✅ 안 줄어들면 멈춘다 (판정이나 고침이 먼저다)" \
  || { say "⛔ 안 줄어드는데 계속 돈다"; cat /tmp/rep1.txt; fail=1; }

node observatory/repeat.mjs --galaxy qa-e2e --report fixtures/loop/judged-run.json >/tmp/rep2.txt 2>&1
[ "$?" -eq 0 ] && grep -q '바퀴에 끝났다' /tmp/rep2.txt \
  && say "✅ 판정이 붙으면 그 바퀴에서 끝난다" \
  || { say "⛔ 판정이 붙었는데 안 끝난다"; cat /tmp/rep2.txt; fail=1; }

node observatory/repeat.mjs --galaxy console --max 5 >/tmp/rep3.txt 2>&1
[ "$?" -eq 3 ] && grep -q '즉시 멈춘다' /tmp/rep3.txt \
  && say "✅ 못 재면 즉시 멈춘다 (반복해도 안 달라진다)" \
  || { say "⛔ 못 재는데 계속 돈다"; cat /tmp/rep3.txt; fail=1; }

node observatory/repeat.mjs --galaxy qa-e2e --max 2 --stall 9 \
  --report qa/tests/fixtures/playwright/real-run.json >/tmp/rep4.txt 2>&1
[ "$?" -eq 1 ] && grep -q '바퀴를 다 썼다' /tmp/rep4.txt \
  && say "✅ 바퀴를 다 쓰면 멈춘다 (무한히 안 돈다)" \
  || { say "⛔ 바퀴 제한이 안 먹는다"; cat /tmp/rep4.txt; fail=1; }

[ "$fail" -ne 0 ] && { echo; echo "⛔ 「끝났는가」가 세 갈래로 안 갈린다."; exit 1; }
echo; echo "✅ 끝났다(0) · 남았다(1) · 못 쟀다(3) — 셋 다 닿고, 반복이 네 자리에서 멈춘다."
