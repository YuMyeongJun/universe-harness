---
name: readme-en
title: Universe — English entry
type: index
related: [laws, bigbang, observatory]
description: 영어 입구 — 남이 이 우주를 평가할 수 있게 하는 자리. 본문은 한국어로 남는다.
---

# Universe

> **A frontend harness where one big bang gives birth to a star.**

Most tools that write a component for you **stop at emitting files.** This one measures whether the code it wrote **actually stands up in your repo** — and says so plainly when it could not measure. If the star does not stand, it **reverts**: a red run leaves no trace.

```bash
npm i -D universe-front-harness        # pnpm add -D / yarn add -D work the same
./node_modules/.bin/universe init      # creates <repo>/universe/
./node_modules/.bin/universe           # run with no arguments to pick from a menu
```

⚠️ **The name you install and the name you type are different** — the package is `universe-front-harness`, the command is `universe`. See [The one trap](#the-one-trap--two-names).

This page is the entry point, not the whole thing. The laws, the round logs and the in-depth docs are written in Korean and stay that way — the wording *is* the rule there, and translating it would blunt it. Korean entry: [README.md](README.md).

**What it does** — `universe new <galaxy> <solar-system> <star> --expand` runs this, in order:

1. **Writes a star** — component + hook + index + behavior-contract test, as one unit.
2. **Gates it at birth** on the static laws your repo turned on. A violation means it is *not born*.
3. **Compiles it** with your own build command, then runs your own lint on **that folder only**.
4. **Runs the real gates** — `lint · build · test · typecheck`, all with *your* commands.
5. **Attributes red lights** — your star's fault, or the repo's? It says which, with evidence.
6. **Reverts on failure.**

**A model is not required for most of it.** Stage 1 (birth) and stage 2 (self-repair of red axes) are deterministic rules and static lanes — no subscription, no API key. Only stage 3 (one line of requirement → a working screen) calls a model, and you choose who answers.

**You don't have to memorize commands.** Run `universe` with no arguments: it lists only the commands humans type, asks only for what the chosen one needs, and **prints the assembled command line before running it**:

```
$ universe new tiny-galaxy shop DashboardToday --expand
이대로 실행할까? [y/N]:
```

Success is not needing the menu next time — **the screen is an entrance, not the destination.** And the screen **cannot turn a gate off.** There is no "ignore and continue" branch.

> **The one idea worth stealing — a signal has three states, not two: measured-green, measured-red, and *not measured*.**

Collapsing the third into the first is how tools quietly lie. Real examples this repo hit:

- A repo declared no `test` command. The harness substituted a default, ran it, and printed `✅ test exit 0` — for a repo with **zero tests**.
- A gate went red, and the axes after it **vanished from the screen**. A missing line reads like a passing one.
- `yarn` died in 0.2s on a missing env var — before compiling anything — and the tool said **"the star does not stand in this galaxy."** It blamed the star for something it never measured.

All three are fixed. Undeclared or unreached axes now print `⚪ — could not measure`, and the verdict is computed from measured axes only. The full discipline: [laws/observation.md](laws/observation.md) (Korean).

## The one trap — two names

|  | Name | Where it is used |
|---|---|---|
| **Package** | `universe-front-harness` | `npm i` · `npm rm -g` · `package.json` |
| **Command** | `universe` | what you type · every `universe X` in the docs |

⛔ **Never type `npx universe`.** That name on npm belongs to someone else (crossfilter/universe, a dataset exploration tool). Ours is `npx universe-front-harness` — **one fragment apart from someone else's package.**

The same trap returns when you undo things. `npm rm -g` takes the **package** name, so it is `npm rm -g universe-front-harness` — removing by the command name either removes nothing or touches someone else's package.

This warning exists because the docs used to walk people into that exact trap, four times over (R52). Publishing to npm did **not** retire it: that name is still not ours. The only thing that changed is that we now have a name of our own.

**Does it fit you?**

| | |
|---|---|
| **Stack** | React + Vite, or Next.js (two plugins today). TypeScript required for the static rules. |
| **Model** | **Not required for stages 1 and 2** — those are deterministic. Only stage 3 calls a model. |
| **Cost** | Stage 3 runs on your Claude Code **subscription** by default. No subscription? Use the openrouter lane. Just testing the wiring? The script lane makes **zero model calls**. |
| **Your repo** | Never committed to. Never overwritten. A failed run reverts itself. |
| **Package manager** | Any — npm · pnpm · yarn 1 · yarn berry. The harness has **zero dependencies**, so private registries and tokens are irrelevant. |

⛔ `universe galaxy` **refuses to guess.** Anything it cannot read from your repo is left as a `TODO` for you to fill, rather than invented. That is the house style throughout.

> **The rule this repo holds itself to — a green light is not evidence.** If you add a check, deliberately break it and confirm it bites.

Every gate here has a mutation test, and the test suite **refuses to register a gate that doesn't have one**. When a mutation gets caught by a *different* check than the one you aimed at, that is not a passing test — it is a missed shot, and you re-aim.

**Status.** The gate count is **not written by hand here.** It went stale six times in this repo's history, so the number now lives in a generated block — see the "지금 상태" table in [README.md](README.md), filled by `universe facts`. What matters here: **zero red**, and every gate carries a mutation test. Stages 1, 2 and 3 have all been run against a real 2,027-file production repo, not just fixtures. What is measured and what is still guesswork is tracked honestly in [docs/05-expectations.md](docs/05-expectations.md) (Korean) — including the parts that **do not work yet**.

**Read more**

| | |
|---|---|
| Quick start — first star in 5 minutes | [docs/01-quick-start.md](docs/01-quick-start.md) (Korean) |
| Every command | [docs/02-usage.md](docs/02-usage.md) (Korean) |
| What you actually get | [docs/04-results.md](docs/04-results.md) (Korean) |
| Honest expectations | [docs/05-expectations.md](docs/05-expectations.md) (Korean) |
| Architecture in pictures | [docs/08-architecture.md](docs/08-architecture.md) (Korean) |
| Contributing · the gates you must pass | [CONTRIBUTING.md](https://github.com/YuMyeongJun/universe-front-harness/blob/main/CONTRIBUTING.md) (Korean) |

**License** — MIT, see [LICENSE](LICENSE). Design adopted (no code copied) from [EnvHarness](https://github.com/google-research/envharness) (Apache 2.0), [Toss Frontend Fundamentals](https://frontend-fundamentals.com/), and [harness-kakashi](https://github.com/psmon/harness-kakashi) (MIT). Full attribution: [docs/06-credits.md](docs/06-credits.md).
