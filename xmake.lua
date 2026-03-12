-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Customize your app:
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APP_NAME    = "Delightful Qt Web Shell"
APP_SLUG    = "delightful-qt-web-shell"
APP_VERSION = "0.1.0"
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Capture at parse time — globals aren't available inside on_run/before_build closures
local _APP_NAME = APP_NAME

set_project(APP_SLUG)
set_version(APP_VERSION)

add_rules("mode.release")
set_defaultmode("release")
set_languages("c++23")

if is_plat("windows") then
    set_runtimes("MD")
end

add_requires("catch2 3.x")

-- ── Libraries ────────────────────────────────────────────────────────

includes("lib/todos/xmake.lua")
includes("lib/web-shell/xmake.lua")
includes("lib/web-bridge/xmake.lua")

-- ── Desktop app ──────────────────────────────────────────────────────

includes("desktop/xmake.lua")

-- ── Test infrastructure ─────────────────────────────────────────────

includes("tests/helpers/dev-server/xmake.lua")

-- ── C++ unit tests (Catch2, no Qt) ──────────────────────────────────

target("test-todo-store")
    set_kind("binary")
    set_default(false)
    add_deps("todos")
    add_files("lib/todos/tests/unit/todo_store_test.cpp")
    add_packages("catch2")

-- ── Vite dev server ───────────────────────────────────────────────

target("dev-web")
    set_kind("phony")
    set_default(false)
    on_run(function()
        local web_dir = path.join(os.scriptdir(), "web")
        local envs = os.getenvs()
        envs["VITE_APP_NAME"] = _APP_NAME
        os.execv("bun", {"run", "dev"}, {curdir = web_dir, envs = envs})
    end)

-- ── Desktop with DevTools ────────────────────────────────────────────

target("dev-desktop")
    set_kind("phony")
    set_default(false)
    add_deps("desktop")
    on_run(function(target)
        local desktop = target:dep("desktop")
        local envs = os.getenvs()
        envs["QTWEBENGINE_REMOTE_DEBUGGING"] = "9222"
        os.execv(desktop:targetfile(), {}, {envs = envs})
    end)

-- ── Background desktop launch (for agents) ────────────────────────────
--
-- xmake run start-desktop   → launches the app in background with CDP on :9222
-- xmake run stop-desktop    → kills the background app
--
-- Agents: use these to launch/quit the app without a human.

target("start-desktop")
    set_kind("phony")
    set_default(false)
    add_deps("desktop")
    on_run(function(target)
        local desktop = target:dep("desktop")
        local exe = desktop:targetfile()
        local pidfile = path.join(os.projectdir(), "build", ".desktop-pid.txt")

        -- Check if already running
        if os.isfile(pidfile) then
            local pid = io.readfile(pidfile):trim()
            -- Check if process is alive (Windows: tasklist, Unix: kill -0)
            if is_plat("windows") then
                local ok = os.execv("tasklist", {"/FI", "PID eq " .. pid, "/NH"}, {try = true, stdout = "/dev/null", stderr = "/dev/null"})
                if ok == 0 then
                    print("Desktop app already running (PID " .. pid .. ")")
                    return
                end
            end
        end

        -- Launch in background
        local envs = os.getenvs()
        envs["QTWEBENGINE_REMOTE_DEBUGGING"] = "9222"
        print(">>> Starting desktop app with CDP on :9222 ...")

        if is_plat("windows") then
            -- Windows: use 'start /B' via cmd to background
            os.runv("cmd", {"/c", "start", "/B", exe}, {envs = envs, detach = true})
        else
            os.runv("sh", {"-c", exe .. " &"}, {envs = envs, detach = true})
        end

        -- Wait for CDP to come online
        local start_time = os.time()
        while os.time() - start_time < 15 do
            local ok = try { function() os.runv("curl", {"-s", "-o", "/dev/null", "-w", "", "http://localhost:9222/json/version"}) return true end }
            if ok then
                -- Get PID from CDP (ask the process list)
                if is_plat("windows") then
                    local output = os.iorunv("wmic", {"process", "where", "commandline like '%" .. path.filename(exe) .. "%'", "get", "processid", "/value"})
                    local pid = output:match("ProcessId=(%d+)")
                    if pid then io.writefile(pidfile, pid) end
                end
                print("Desktop app started! CDP ready on http://localhost:9222")
                return
            end
            os.sleep(500)
        end
        print("WARNING: app launched but CDP not responding after 15s")
    end)

target("stop-desktop")
    set_kind("phony")
    set_default(false)
    on_run(function()
        local pidfile = path.join(os.projectdir(), "build", ".desktop-pid.txt")
        if not os.isfile(pidfile) then
            -- Try to kill by name as fallback
            if is_plat("windows") then
                os.execv("taskkill", {"/IM", _APP_NAME .. ".exe", "/F"}, {try = true})
            end
            print("Desktop app stopped.")
            return
        end
        local pid = io.readfile(pidfile):trim()
        if is_plat("windows") then
            os.execv("taskkill", {"/PID", pid, "/F"}, {try = true})
        else
            os.execv("kill", {pid}, {try = true})
        end
        os.rm(pidfile)
        print("Desktop app stopped (PID " .. pid .. ")")
    end)

-- ── pywinauto tests (native Qt window) ─────────────────────────────

target("test-pywinauto")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> uv run pytest tests/pywinauto/ (requires running desktop app)")
        local base = os.scriptdir()
        os.execv("uv", {"run", "pytest", "tests/pywinauto/", "-v"}, {curdir = base})
    end)

-- ── Playwright e2e tests (browser) ──────────────────────────────────

target("test-browser")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> npx playwright test (browser)")
        local base = os.scriptdir()
        os.execv("npx", {"playwright", "test"}, {curdir = base, envs = {VITE_APP_NAME = _APP_NAME}})
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
