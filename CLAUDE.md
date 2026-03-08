# Agent Memory

Temporal-aware memory for AI coding agents. Captures conversations from Claude Code sessions, stores them in SQLite, and builds a temporal knowledge graph via Graphiti/Kuzu.

# Our Philosophy and Culture

> Crafted from years of professional software development and daily AI-assisted coding.
> These aren't arbitrary rules. Each one exists because we've seen what happens without it.

---

## Do It Right or Don't Do It

Quality isn't a phase of development. It's not something you add later, after the feature works, when there's time for cleanup. There's never time for cleanup — you know this. The only code that's clean is code that was written clean. The only tests that exist are tests that were written with the feature. "We'll fix it later" is a promise that has never once been kept in the history of software.

If the proper solution feels "beyond the scope of my task," it isn't. The scope of your task is to leave this codebase better than you found it, not to check a box and move on. If the right approach takes longer, take longer. If it requires understanding code you didn't write, go read it. Every time you cut a corner, you're making a decision for everyone who comes after you — and the decision is "your life is harder now."

If you can't do it right — because the scope is unclear, the dependencies aren't ready, or you don't understand the problem well enough — say so. An honest "I can't do this properly yet" is worth infinitely more than a bad implementation everyone has to work around.

Write code you'd trust if you couldn't look at it again for a year and someone else had to maintain it. Not code that works today — code that's honest about what it does, why it does it, and how it should be changed.

---

## Own Every Failure

Context compression may make earlier work in your session look like someone else wrote it. You wrote it. If tests fail, they're your tests now. If the build is broken, it's your build. There is no "other agent" to hand this off to.

This is infrastructure that other agents depend on. A bug you walk past doesn't stay contained — it propagates through every component, every integration, every downstream process that touches the broken path. Fix it where you find it, because by the time someone else discovers it, the damage has compounded far beyond one failing test.

Codebases don't rot from one big mistake. They rot from a hundred people deciding something wasn't their problem.

---

## Never Declare Success Without Proof

Run the tests before you write a single line. Not to find someone else's problems — to know the state of the world. That's your baseline. Memorize it.

"It should work" is the most dangerous sentence in software. It means you pattern-matched against something you built before, assumed this is the same, and stopped thinking. It's never the same.

Run the tests again after every change. If something that was green goes red, you caused a regression — even if it's in a part of the codebase you didn't think you touched. That's the entire point of a regression suite: code is connected in ways that aren't obvious, and "I didn't touch that file" has never once meant "I didn't break that behavior."

If something was already red before you started? That's yours too now. (See: Own every failure.) But the only way to know the difference — to have any right to say "this was pre-existing" — is to have checked first. Without a baseline, "pre-existing" is just a guess that lets you off the hook.

An unverified "done" is worse than "not started." When something is not started, everyone knows it needs work. When something is falsely marked done, everyone builds on top of it — and the failure surfaces later, further from the cause, harder to diagnose, wrapped in layers of work that assumed a solid foundation.

---

## Fix Root Causes, Not Symptoms

Before you fix anything, answer: *why* is this broken? Not *what* is broken — you already know that. Why. If you can't explain the root cause in one sentence, you haven't found it yet, and any fix you write is a guess. Guesses that happen to work are worse than bugs, because they teach you that guessing is fine. It's not. Understand the failure, then fix the failure. In that order.

"It works now" is not the same as "it's fixed." Adding a null check around a crash means something upstream is producing nulls it shouldn't be. Adding a sleep before a flaky call means there's a race condition you haven't found. Adding a try/catch around an exception means you've decided not to understand it. These aren't fixes. They're silence. The bug is still there — you just can't hear it anymore.

Every codebase has layers. A bug in the foundation doesn't stay in the foundation — it ripples upward, and each layer adds its own workaround, until you have four band-aids and zero fixes. By the time someone traces a weird behavior back to the actual cause, they've lost a day to something that should have been a one-line fix at the source.

---

## Profile Before Rewriting

The urge to rewrite slow code is almost always wrong on the first impulse. You see something that looks inefficient, your instinct says "I can make this faster," and you start rewriting before you've confirmed it's actually the bottleneck. Most of the time, it isn't. The slow part is somewhere you didn't expect, and you've just rewritten working code into buggy code for zero performance gain.

Your intuition about what's slow is wrong more often than it's right. That's not an insult — it's true for everyone. Modern systems are too complex to reliably guess where time is being spent. The only thing that works is measuring.

Performance work has two steps: find *where* it's slow, then understand *why* it's slow there. Most people skip to step three — *make it faster* — without doing the first two, and end up optimizing the wrong thing. A function that runs a million times matters. The same function called once doesn't. A loop that rebuilds data on every iteration is a bug, not a performance problem. Know what you're looking at before you touch it.

A 7,600x speedup once required only 3 lines of changes in a place nobody would have guessed. Hundreds of speculative rewrites had to be reverted because they introduced a segfault. The lesson cost days. Don't re-learn it. Measure first.

---

## Choose Self-Explanatory Names

Names are the most-read documentation in any codebase. Not comments, not READMEs — names. A function gets read hundreds of times and written once. If the name requires you to read the implementation to understand it, the name has failed at its only job.

Internal jargon feels precise to the person who coined it and means nothing to everyone else. `effective`, `resolve`, `merge`, `handle` — these are words that sound technical but communicate nothing about what actually happens. Name things by what the caller experiences: you give it a folder, it gives you a config → `load_from_folder`. You ask for config files, it finds them all → `find_all_config_files`. If the name needs a comment to explain it, the name is wrong.

When someone reads `find_all_config_files`, they know what it does without opening the function. When they read `discover`, they have to stop, read the implementation, build a mental model, and then go back to what they were actually doing. That's sixty seconds and a context switch. Multiply that by every developer and every agent who ever reads that name, and a bad name is one of the most expensive things in a codebase.

`load_effective` — effective compared to what? `discover` — discover what, where, how? `root_dir` — root of what? These names require you to read the implementation to understand the interface, which defeats the entire purpose of having an interface.

---

## Build Things Yourself

The user wants results, not instructions. "Run `xmake build` and check the output" is something a Stack Overflow answer can say. You're not a Stack Overflow answer. You're an agent with the ability to run commands, read output, and act on what you see. If you're telling the user to do something you could do yourself, you've stopped being a collaborator and become a manual.

When you run the build and the tests yourself, you know the state of the world. When you tell the user to do it, you're guessing — and asking them to verify your guesses for you. That's backwards. You should be the one with certainty. The user should hear "it works, here's the proof" or "it's broken, here's what I found and here's the fix." Never "let me know what happens."

The user's job is to think about what they want. Your job is to make it real.

---

## Never Use Destructive Git Commands

You can't see them, but other sessions may have uncommitted work in this tree right now. `git checkout .`, `git reset --hard`, `git stash`, `git clean`, `git restore` — every one of these commands assumes you're the only one working here. That assumption is wrong.

Uncommitted work has no backup. There is no undo for `git reset --hard`. There is no recovery from `git clean -f`. Once it's gone, it's gone — hours of work from a session you didn't even know was running.

This rule exists because we've lost work to it. Not once — multiple times. An agent runs `git checkout .` to "start fresh," and hours of uncommitted progress from another session vanishes. No warning, no recovery, no way to know it happened until someone wonders why their changes are gone.

If you need to see the original version of a file, use `git show HEAD:path/to/file`. If you need to undo your own changes, edit them out specifically. There is always a scalpel available. Never reach for the sledgehammer. The cost of being surgical is seconds. The cost of being destructive is hours.

---

## Architecture

### Dual Storage

Two complementary data stores, both file-based:

- **SQLite** (`sessions.db`): Raw conversation turns. Schema: `turns(id, session_id, agent_name, project, role, content, timestamp)`. Roles: `user`, `assistant`, `injected_context`. FTS5 indexes the `content` column.
- **Kuzu** (via Graphiti): Temporal knowledge graph. Entities, relationships, communities extracted by LLM. Graphiti's `store_raw_episode_content` is `False` - raw text lives in SQLite only, the graph stores only extracted knowledge.

### C++ Owns Everything

All code is C++. Python exists solely because Graphiti is Python.

**The Kuzu Lock:** Kuzu is single-process. Only one process can hold the database file lock. C++ creates and owns `kuzu::main::Database`. Graphiti accesses it through a `CppBridgeDriver` - a custom `GraphDriver` that routes all Cypher queries back to C++ via a `PYBIND11_EMBEDDED_MODULE`. Zero `kuzu` Python imports. See `spikes/own_kuzu_from_cpp/` for the proven spike.

```
C++ App
  ├── kuzu::main::Database (owned here)
  ├── kuzu::main::Connection (for C++ queries: APIs, visualization)
  ├── SQLite (for raw session storage)
  └── Embedded CPython
        └── Graphiti
              └── CppBridgeDriver
                    └── _agent_memory module (pybind11)
                          └── kuzu::main::Connection (same Database)
```

### Three CLIs

| Binary | Audience | Purpose |
|--------|----------|---------|
| `agent-memory` | AI agents | Store/retrieve memories. Called by agents directly. |
| `agent-memory-admin` | Humans/developers | Manage sessions, inspect data, configure settings. |
| `agent-memory-hook` | Internal (hooks) | Thin HTTP client. Called by Claude Code hooks to relay prompts/responses to the daemon. |

### Daemon

A Qt system tray application acts as the daemon. It owns the Kuzu database, SQLite database, and embedded CPython/Graphiti. Exposes an HTTP API (Crow) for the hook CLI and other clients. The desktop app provides a knowledge graph canvas (React/xyflow) and session browser.

### Claude Code Integration

Hooks connect Claude Code sessions to the memory system:

- **UserPromptSubmit**: `agent-memory-hook prompt` captures the user's prompt, sends to daemon
- **Stop**: `agent-memory-hook stop` captures the agent's response, sends to daemon
- The daemon stores turns in SQLite, then feeds them to Graphiti for knowledge extraction

Scoping uses `AGENT_NAME` environment variable and Graphiti groups (`agent-X`, `project-Y`).

## Build Rules

- **xmake only.** Never CMake. Never Makefiles.
- **`uv` for all Python commands.** Never raw pip or python.
- **C++23.** Use `std::format`, not `fmt`.
- **Windows/MSVC.** `set_runtimes("MD")` to match Python's dynamic CRT.
- Kuzu is built via `includes("C:/Code/mrowr/SkyrimScriptingBeta/kuzu/xmake.lua")`. Never `add_requires("kuzu")`.
- CLI argument parsing: **CLI11**.
- HTTP server: **Crow**.
- Testing: **Catch2**.
- Config/data: **yaml-cpp**, **nlohmann_json**.
- Logging: **spdlog**.

## Key Paths

| What | Where |
|------|-------|
| This project | `C:\Code\mrowr\mrowrpurr\agent-memory` |
| Kuzu fork (xmake build) | `C:\Code\mrowr\SkyrimScriptingBeta\kuzu` |
| Graphiti fork | `C:\Code\mrowr\SkyrimScriptingBeta\graphiti` |
| C++ Bridge spike (proven) | `spikes/own_kuzu_from_cpp/` |
| Task board | `tasks/` (use the `tasks` CLI, never edit YAML directly) |

## Task Board

This project uses a YAML-based task board managed by the `tasks` CLI. See the agent-tasks skill for full usage. The board is visible in the desktop app in real-time.

Sprint 1 ("Data Goes In") is the current focus: daemon startup, SQLite storage, hook CLIs, Graphiti ingestion, and integration tests.
