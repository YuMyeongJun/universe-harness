#!/usr/bin/env bash
# **깃 로그인으로 레포를 고를 수 있는가** — 사람의 계획 첫 칸(주소를 외우지 않는다)을 밟는다.
#
# ⛔ **네트워크에 안 기댄다.** GitHub 에 안 묻는다. `gh` 를 **만들어서** 재고, `gh` 가 없는 상태도
#    **만들어서** 잰다(`PATH` 를 비운다). 인터넷이 없어도, 어느 기계에서도 같은 답이 나온다.
# ⛔ **토큰을 안 만든다.** 이 도구는 애초에 토큰을 안 받는다 — 그 거절과 지움도 여기서 잰다.
# ⛔ **사람의 진짜 `gh` 를 안 건드린다.** 가짜 `gh` 를 임시 `PATH` 맨 앞에 둔다 —
#    그러니 이 탐침은 **로그인 상태를 바꾸지 않는다.**
#
# ## ⛔ 이 탐침이 **못 재는 것** (§8 — 적어 둔다)
#   · **진짜 GitHub**. 가짜 `gh` 가 내놓는 모양만 잰다 — gh 판이 바뀌어 출력 형식이 달라지는 것은
#     여기서 **안 보인다**. 진짜로 도는지는 사람이 `node bin/repos.mjs` 를 쳐서 본다.
#   · **자격의 진짜 모양**. 토큰 스코프가 정말 비공개를 가리는지, 조직 권한이 어떻게 생겼는지는
#     못 잰다. 재는 것은 「그 말을 화면에 나르는가」까지다.
#   · **받아 올 수 있는가**. 목록에 떴다고 `git clone` 이 되는 것이 아니다 — 그건 `probe-clone.sh` 다.
#   · **골라서 이어지는가**. 화면 배선(메뉴)은 이 탐침 밖이다 — 여기서는 `--json` 이 **고를 수 있는
#     모양으로 나오는가**까지만 본다.
set -uo pipefail
cd "$(dirname "$0")/.."

NODE="$(command -v node)"
[ -n "$NODE" ] || { echo "⚪ 못 쟀다 — node 를 못 찾았다"; exit 3; }
REPOS="$PWD/bin/repos.mjs"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fakebin="$work/bin"; mkdir -p "$fakebin"
LOG="$work/gh-calls.txt"

fail=0
say () { echo "  $1"; }

# 가짜 `gh` — **부른 인자를 전부 적는다.** 「우리가 무엇을 부르지 않았는가」를 재려면 그 기록이 필요하다.
# 갈래는 환경변수로 고른다(`FAKE_AUTH` · `FAKE_LIST`).
cat > "$fakebin/gh" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$GH_CALL_LOG"
if [ "${1:-}" = "auth" ] && [ "${2:-}" = "status" ]; then
  case "${FAKE_AUTH:-ok}" in
    ok)
      echo "github.com"
      echo "  ✓ Logged in to github.com account probeuser (keyring)"
      echo "  - Active account: true"
      echo "  - Token: gho_SECRETSECRETSECRETSECRET1234"
      echo "  - Token scopes: 'gist', 'read:org', 'repo'"
      exit 0 ;;
    noscope)
      echo "github.com"
      echo "  ✓ Logged in to github.com account probeuser (keyring)"
      echo "  - Token scopes: 'gist', 'read:org'"
      exit 0 ;;
    *)
      echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2
      exit 1 ;;
  esac
fi
if [ "${1:-}" = "repo" ] && [ "${2:-}" = "list" ]; then
  case "${FAKE_LIST:-two}" in
    empty) echo '[]'; exit 0 ;;
    broken) echo 'not json at all'; exit 0 ;;
    refuse) echo "HTTP 401: Bad credentials (token gho_SECRETSECRETSECRETSECRET1234)" >&2; exit 1 ;;
    two)
      printf '%s\n' '[{"nameWithOwner":"probeuser/alpha","description":"","visibility":"PUBLIC","isFork":false,"isArchived":false,"updatedAt":"2026-01-01T00:00:00Z","url":"https://example.invalid/probeuser/alpha"},{"nameWithOwner":"probeuser/beta","description":"","visibility":"PRIVATE","isFork":true,"isArchived":false,"updatedAt":"2026-01-02T00:00:00Z","url":"https://example.invalid/probeuser/beta"}]'
      exit 0 ;;
  esac
fi
echo "fake gh: 안 시킨 것을 불렀다: $*" >&2
exit 64
SH
chmod +x "$fakebin/gh"

# ⛔⛔ **실측 사고 — 이 탐침이 진짜 `gh auth login` 을 띄웠다.**
#    판정 문구를 큰따옴표 안에서 백틱으로 감쌌다: `say "✅ `gh auth login` 을 부르지 않았다"`.
#    쉘에서 큰따옴표 안의 백틱은 **명령 치환**이라, 「안 불렀는지 재는 줄」이 **그것을 불렀다.**
#    화면에 일회용 코드와 device 로그인 URL 이 떴다(사람이 입력 안 해 로그인은 안 됐다).
#    ⇒ 고침 둘: ① 판정 문구에서 백틱을 없앤다 ② **아래 한 줄** — 이 탐침이 도는 동안
#      `gh` 는 **언제나 가짜**다. 실수로 부르더라도 사람의 진짜 자격에는 닿지 않는다.
#    ⚠️ ②는 ①이 또 깨져도 피해를 막는 **두 번째 벽**이다. 하나만 두면 다음 회전에 또 밟는다.
export PATH="$fakebin:$PATH"

run () { # run <갈래환경> … -- 인자…
  : > "$LOG"
  env PATH="$fakebin:/usr/bin:/bin" GH_CALL_LOG="$LOG" "$@"
}

# ── ① ⛔ **gh 가 없으면 ⚪ 못 쟀다(3)** — 「레포가 없다」가 아니다 ────────────
# ⛔ 상태를 **만들어서** 잰다: `PATH` 를 비워 gh 를 못 찾게 한다(node 는 절대경로로 부른다).
env -i PATH="" "$NODE" "$REPOS" > "$work/o1.txt" 2>&1
code=$?
if [ "$code" -eq 3 ] && grep -q '못 쟀다' "$work/o1.txt" && grep -q 'gh' "$work/o1.txt"; then
  say "✅ gh 가 없으면 **⚪ 못 쟀다(3)** — 「레포가 없다」로 안 말한다"
else
  say "⛔ gh 가 없는데 exit=$code 다 — 0이면 거짓 초록, 1이면 「없다」로 읽힌다(§8)"
  cat "$work/o1.txt"; fail=1
fi

# ── ② ⛔ **모르는 플래그를 거부하는가**(관측 법칙 §7) ────────────────────────
if run "$NODE" "$REPOS" --token abc > "$work/o2.txt" 2>&1; then
  say "⛔ **--token 을 받아들였다** — 이 도구는 토큰을 보면 안 된다"; fail=1
else
  grep -q '모르는 플래그 --token' "$work/o2.txt" \
    && say "✅ --token 을 모르는 플래그로 거절한다" \
    || { say "⛔ 거절 이유가 다르다"; cat "$work/o2.txt"; fail=1; }
fi

# ── ③ ⛔ **0개는 「없다」가 아니라 「못 쟀다」인가** (§8 · 이 탐침의 심장) ────
run env FAKE_LIST=empty "$NODE" "$REPOS" > "$work/o3.txt" 2>&1
code=$?
if [ "$code" -eq 3 ] && grep -q '못 쟀다' "$work/o3.txt"; then
  # ⛔ **분모를 같이 말하는가.** 0을 「못 쟀다」로만 말하고 분모를 안 대면 사람은 고칠 데를 모른다.
  if grep -q '상한' "$work/o3.txt" && grep -q '스코프' "$work/o3.txt"; then
    say "✅ 0개를 **못 쟀다(3)** 로 말하고 **분모**(상한·스코프)를 같이 댄다"
  else
    say "⛔ 0개를 못 쟀다로는 말했는데 **분모가 없다** — 어디를 고칠지 아무도 모른다(§8)"
    cat "$work/o3.txt"; fail=1
  fi
else
  say "⛔ 0개를 받고 exit=$code — 「레포가 없다」로 읽힌다. 0은 무죄가 아니다(§8)"
  cat "$work/o3.txt"; fail=1
fi

# ── ④ ⛔ **로그인이 안 됐으면 사람에게 시키는가** — 대신 로그인하지 않는다 ──
run env FAKE_AUTH=no "$NODE" "$REPOS" > "$work/o4.txt" 2>&1
code=$?
if [ "$code" -eq 3 ] && grep -q 'gh auth login' "$work/o4.txt"; then
  say "✅ 로그인이 안 됐으면 **⚪ 3** 으로 끝내고 'gh auth login' 을 사람에게 시킨다"
else
  say "⛔ 로그인 안 된 상태에서 exit=$code — 안내를 안 했거나 초록을 냈다"
  cat "$work/o4.txt"; fail=1
fi
# ⛔⛔ **우리가 대신 로그인하지 않았는가.** 이건 출력이 아니라 **부른 명령**으로 재야 한다.
if grep -q '^auth login' "$LOG"; then
  say "⛔ **'gh auth login' 을 도구가 실행했다** — 로그인은 사람이 한다"
  cat "$LOG"; fail=1
else
  say "✅ 'gh auth login' 을 **부르지 않았다**(부른 것: $(tr '\n' ';' < "$LOG"))"
fi

# ── ⑤ ⛔ **토큰을 절대 안 부르고 안 찍는가** ─────────────────────────────
run env FAKE_LIST=refuse "$NODE" "$REPOS" > "$work/o5.txt" 2>&1
code=$?
[ "$code" -eq 3 ] \
  && say "✅ gh 가 거절하면 **⚪ 못 쟀다(3)** — 「0개」로 안 센다" \
  || { say "⛔ gh 가 거절했는데 exit=$code 다"; cat "$work/o5.txt"; fail=1; }
# 가짜 gh 는 auth status 와 거절 메시지 **둘 다**에 토큰처럼 생긴 것을 섞어 뱉는다.
if grep -q 'gho_' "$work/o5.txt"; then
  say "⛔ **토큰처럼 생긴 문자열이 화면에 남았다** — 로그·스크롤백·이슈 첨부로 샌다"
  grep -n 'gho_' "$work/o5.txt"; fail=1
else
  say "✅ gh 의 말을 나르면서 **토큰처럼 생긴 것을 지웠다**"
fi
if grep -q '^auth token' "$LOG"; then
  say "⛔ **'gh auth token' 을 불렀다** — 토큰 값을 볼 이유가 없다"; fail=1
else
  say "✅ 'gh auth token' 을 **부르지 않았다**"
fi

# ── ⑥ 목록이 있으면 **고를 수 있는 모양**으로 내는가 ─────────────────────
run env FAKE_LIST=two "$NODE" "$REPOS" > "$work/o6.txt" 2>&1
code=$?
if [ "$code" -eq 0 ] \
  && grep -q 'probeuser/alpha' "$work/o6.txt" \
  && grep -q 'universe clone' "$work/o6.txt" \
  && grep -q 'https://example.invalid/probeuser/alpha' "$work/o6.txt"; then
  say "✅ 목록을 내고 **고른 것을 'universe clone' 에 넘기는 줄**까지 찍는다"
else
  say "⛔ 목록은 냈는데 **고를 수가 없다**(exit=$code) — 주소나 다음 명령이 안 보인다"
  cat "$work/o6.txt"; fail=1
fi
# ⛔ **여기서 받아 오면 안 된다** — 받는 자리는 `universe clone` 한 곳이다(두 자리면 조용히 갈린다).
if grep -q '^clone' "$LOG" || grep -q 'repo clone' "$LOG"; then
  say "⛔ **이 도구가 직접 받아 왔다** — 받는 자리가 둘이 되면 조용히 갈린다"; fail=1
else
  say "✅ 직접 받아 오지 않는다 — 목록까지만 낸다"
fi

# ── ⑦ ⛔ **스코프가 좁으면 「이게 전부」로 읽히지 않게 말하는가** (§8 분모) ──
run env FAKE_AUTH=noscope FAKE_LIST=two "$NODE" "$REPOS" > "$work/o7.txt" 2>&1
if grep -q '비공개' "$work/o7.txt" && grep -q '§8' "$work/o7.txt"; then
  say "✅ 토큰에 'repo' 가 없으면 **비공개는 안 보인다**고 화면에서 말한다"
else
  say "⛔ 스코프가 좁은데 **아무 말도 없다** — 목록이 「전부」로 읽힌다(§8)"
  cat "$work/o7.txt"; fail=1
fi

# ── ⑧ ⛔ **못 읽은 것을 「0개」로 세지 않는가** ──────────────────────────
run env FAKE_LIST=broken "$NODE" "$REPOS" > "$work/o8.txt" 2>&1
code=$?
[ "$code" -eq 3 ] \
  && say "✅ gh 의 답을 못 읽으면 **⚪ 못 쟀다(3)** — 「0개」로 안 센다" \
  || { say "⛔ 못 읽었는데 exit=$code 다 — 조용히 「없다」가 된다(§8)"; cat "$work/o8.txt"; fail=1; }

if [ "$fail" -ne 0 ]; then
  echo; echo "⛔ 「깃 로그인으로 레포를 고른다」가 거짓이다."
  exit 1
fi
echo; echo "✅ gh 없음 → ⚪3 · 로그인 없음 → 사람에게 · 0개 → 「못 쟀다」+분모 · 토큰은 보지도 찍지도 않는다."
