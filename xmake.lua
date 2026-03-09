-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Customize your app:
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APP_NAME    = "Delightful Qt Web Shell"
APP_SLUG    = "delightful-qt-web-shell"
APP_VERSION = "0.1.0"
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set_project(APP_SLUG)
set_version(APP_VERSION)

add_rules("mode.release")
set_defaultmode("release")
set_languages("c++23")

if is_plat("windows") then
    set_runtimes("MD")
end

add_requires("catch2 3.x")
add_requires("nlohmann_json")

-- ── Libraries ────────────────────────────────────────────────────────

includes("lib/todos/xmake.lua")
includes("lib/web-shell/xmake.lua")
includes("lib/web-bridge/xmake.lua")

-- ── Desktop app ──────────────────────────────────────────────────────

includes("desktop/xmake.lua")

-- ── CLI tools ────────────────────────────────────────────────────────

includes("cli/test-server/xmake.lua")

-- ── Hosted web server ──────────────────────────────────────────────

target("server")
    set_kind("phony")
    set_default(false)
    add_deps("todos-ffi")
    on_run(function()
        print(">>> bun server/index.ts")
        local base = os.scriptdir()
        os.execv("bun", {"server/index.ts"}, {curdir = base})
    end)

-- ── C++ unit tests (Catch2, no Qt) ──────────────────────────────────

target("test-todo-store")
    set_kind("binary")
    set_default(false)
    add_deps("todos")
    add_files("lib/todos/tests/unit/todo_store_test.cpp")
    add_packages("catch2")

-- ── Playwright e2e tests (browser) ──────────────────────────────────

target("test-browser")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> npx playwright test (browser)")
        local base = os.scriptdir()
        os.execv("npx", {"playwright", "test"}, {curdir = base, envs = {VITE_APP_NAME = APP_NAME}})
    end)

-- ── Playwright e2e tests (real Qt desktop app) ──────────────────────

target("test-desktop")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> npx playwright test (desktop)")
        local base = os.scriptdir()
        os.execv("npx", {"playwright", "test"}, {curdir = base, envs = {DESKTOP = "1"}})
    end)

-- ── Bun unit tests ──────────────────────────────────────────────────

target("test-bun")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> bun test")
        local base = os.scriptdir()
        os.execv("bun", {"test"}, {curdir = base})
    end)

-- ── Run all tests ───────────────────────────────────────────────────

target("test-all")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> Catch2: TodoStore unit tests")
        os.execv("xmake", {"run", "test-todo-store"})
        print("")
        print(">>> Bun: bridge proxy unit tests")
        os.execv("xmake", {"run", "test-bun"})
        print("")
        print(">>> Playwright: e2e tests (browser + C++ backend)")
        os.execv("xmake", {"run", "test-browser"})
    end)
