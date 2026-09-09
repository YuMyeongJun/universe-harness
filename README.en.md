---
name: readme-en
title: Universe — English entry
type: index
related: [laws, bigbang, observatory]
description: 영어 입구 — 남이 이 우주를 평가할 수 있게 하는 자리. 본문은 한국어로 남는다.
---

# Universe

> **A frontend harness where one big bang gives birth to a star.**

⚠️ **This is the entry point, not the whole thing.** The laws, the round logs, and the
in-depth docs are written in Korean and stay that way — the wording *is* the rule there, and
translating it would blunt it. This page tells you what the tool does, whether it fits you,
and how to run it. Deep docs: [README.md](README.md) (Korean).

---

## What it actually does

Most "AI writes your component" tools stop at emitting files. This one **measures whether
the thing it wrote actually stands up in your repo** — and refuses to lie when it can't.

```bash
universe new my-app dashboard DashboardToday --expand
```

1. **Writes a star** — a cohesive unit (component + hook + index + behavior-contract test).
2. **Gates it at birth** on static rules your repo turned on. Violations mean it is *not born*.
3. **Compiles it** with your own build command, then runs your own lint on **that folder only**.
4. **Runs the real gates** — `lint · build · test · typecheck`, using *your* commands.
5. **Attributes red lights**: your star's fault, or the repo's? It says which, with evidence.
6. **Reverts on failure.** A red run leaves no trace in your repo.

## The one idea worth stealing

**A signal has three states, not two: measured-green, measured-red, and *not measured*.**

Collapsing the third into the first is how tools quietly lie. Real examples this repo hit:

- A repo declared no `test` command. The harness substituted a default, ran it, and printed
  `✅ test exit 0` — for a repo with **zero tests**.
- A gate went red, and the axes after it **vanished from the screen**. A missing line reads
  like a passing one.
- `yarn` died in 0.2s on a missing env var — before compiling anything — and the tool said
  **"the star does not stand in this galaxy."** It blamed the star for something it never measured.

All three are fixed. Undeclared or unreached axes now print `⚪ — could not measure`, and the
verdict is computed from measured axes only.

## Does it fit you?

| | |
|---|---|
| **Stack** | React + Vite, or Next.js (two plugins today). TypeScript required for the static rules. |
| **Model** | **Not required for stages 1 and 2** — those are deterministic. Only stage 3 (requirement → working screen) calls a model. |
| **Cost** | Stage 3 runs on your Claude Code **subscription** by default. No subscription? `--lane openrouter`. Just testing the wiring? `--lane script` — **zero model calls**. |
| **Your repo** | Never committed to. Never overwritten. A failed run reverts itself. |

## Quick start

⚠️ **The package name and the command name are different.**
You install **`universe-harness`**; you type **`universe`**.

```bash
npm i -D universe-harness                       # into your repo
./node_modules/.bin/universe init               # installs laws + observatory into <repo>/universe/
./node_modules/.bin/universe galaxy             # reads your repo and drafts its coordinates
./node_modules/.bin/universe observe            # measures law violations — no model, no network
```

⛔ **Never type `npx universe`.** That name on npm belongs to someone else
(crossfilter/universe, a dataset exploration tool). Ours is `npx universe-harness` —
**one hyphen apart from someone else's package.**
⚠️ This warning exists because the docs used to walk people into that exact trap, four times
over. Publishing to npm did **not** retire it: that name is still not ours. The only thing
that changed is that we now have a name of our own.

Hacking on the harness itself instead? Clone it and `npm link` — and remember that undoing
that is `npm rm -g universe-harness`, **not** `npm rm -g universe`. `npm rm -g` takes the
*package* name, not the command name.

⛔ `universe galaxy` **refuses to guess.** Anything it cannot read from your repo is left as a
`TODO` for you to fill, rather than invented. That is the house style throughout.

## The rule this repo holds itself to

> **A green light is not evidence.** If you add a check, deliberately break it and confirm it bites.

Every gate here has a mutation test, and the test suite **refuses to register a gate that
doesn't have one**. When a mutation gets caught by a *different* check than the one you aimed
at, that is not a passing test — it is a missed shot, and you re-aim.

## Status

⛔ **The gate count is not written by hand here.** It went stale six times in this repo's
history, so the number now lives in a generated block — see the "지금 상태" table in
[README.md](README.md), filled by `universe facts`. What matters here: **zero red**, and every
gate carries a mutation test.

Stage 1, 2 and 3 have all been run against a real 2,027-file production repo,
not just fixtures. What is measured and what is still guesswork is tracked honestly in
[docs/05-expectations.md](docs/05-expectations.md) (Korean) — including the parts that
**do not work yet**.

## License

MIT — see [LICENSE](LICENSE). Design adopted (no code copied) from
[EnvHarness](https://github.com/google-research/envharness) (Apache 2.0),
[Toss Frontend Fundamentals](https://frontend-fundamentals.com/), and
[harness-kakashi](https://github.com/psmon/harness-kakashi) (MIT).
Full attribution: [docs/06-credits.md](docs/06-credits.md).
