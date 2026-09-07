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

[ "$fail" -ne 0 ] && { echo; echo "⛔ 「끝났는가」가 세 갈래로 안 갈린다."; exit 1; }
echo; echo "✅ 끝났다(0) · 남았다(1) · 못 쟀다(3) — 셋 다 닿는다."
