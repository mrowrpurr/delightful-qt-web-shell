-- Capture at parse time — globals aren't available inside on_run closures
local _APP_NAME = APP_NAME

-- ── Vite dev servers ────────────────────────────────────────────────
-- One target per web app. Each runs Vite on its own port.

target("dev-web")
    set_kind("phony")
    set_default(false)
    on_run(function()
        -- Default: start the main app's dev server
        local web_dir = path.join(os.projectdir(), "web")
        local envs = os.getenvs()
        envs["VITE_APP_NAME"] = _APP_NAME
        os.execv("bun", {"run", "dev:main"}, {curdir = web_dir, envs = envs})
    end)

target("dev-web-main")
    set_kind("phony")
    set_default(false)
    on_run(function()
        local web_dir = path.join(os.projectdir(), "web")
        local envs = os.getenvs()
        envs["VITE_APP_NAME"] = _APP_NAME
        os.execv("bun", {"run", "dev:main"}, {curdir = web_dir, envs = envs})
    end)

target("dev-web-docs")
    set_kind("phony")
    set_default(false)
    on_run(function()
        local web_dir = path.join(os.projectdir(), "web")
        local envs = os.getenvs()
        envs["VITE_APP_NAME"] = _APP_NAME
        os.execv("bun", {"run", "dev:docs"}, {curdir = web_dir, envs = envs})
    end)

-- ── Storybook ──────────────────────────────────────────────────────────

target("storybook")
    set_kind("phony")
    set_default(false)
    on_run(function()
        local web_dir = path.join(os.projectdir(), "web")
        os.execv("bun", {"run", "storybook"}, {curdir = web_dir})
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
        os.execv(desktop:targetfile(), {"--dev"}, {envs = envs})
    end)

-- ── Background desktop launch (for agents) ────────────────────────────
--
-- xmake run start-desktop   → launches the app in background with CDP on :9222
-- xmake run stop-desktop    → kills the background app
--
-- NOTE: runs in PRODUCTION mode (embedded resources, no Vite HMR).
-- For dev mode with HMR, use: xmake run dev-desktop
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
            if is_plat("windows") then
                -- tasklist always exits 0, so check output for the PID
                local output = os.iorunv("tasklist", {"/FI", "PID eq " .. pid, "/FO", "CSV", "/NH"}, {try = true}) or ""
                if output:find(pid) then
                    print("Desktop app already running (PID " .. pid .. ")")
                    return
                end
                -- Stale PID file — remove it and continue
                os.rm(pidfile)
            else
                local ok = os.execv("kill", {"-0", pid}, {try = true})
                if ok == 0 then
                    print("Desktop app already running (PID " .. pid .. ")")
                    return
                end
                os.rm(pidfile)
            end
        end

        -- Launch in background
        local envs = os.getenvs()
        envs["QTWEBENGINE_REMOTE_DEBUGGING"] = "9222"
        print(">>> Starting desktop app with CDP on :9222 ...")

        if is_plat("windows") then
            -- Windows: write a temp .bat that launches the exe in background.
            -- Avoids quoting hell with cmd's 'start' and paths containing spaces.
            local bat = path.join(os.projectdir(), "build", ".start-desktop.bat")
            io.writefile(bat, 'start "" "' .. exe .. '"\n')
            os.runv("cmd", {"/c", bat}, {envs = envs, detach = true})
        else
            os.runv("sh", {"-c", exe .. " &"}, {envs = envs, detach = true})
        end

        -- Wait for CDP to come online (QtWebEngine can take 20s+ on first launch)
        import("lib.detect.find_tool")
        local start_time = os.time()
        while os.time() - start_time < 30 do
            local ok = try { function()
                local curl = assert(find_tool("curl"))
                os.runv(curl.program, {"-sf", "http://localhost:9222/json/version"})
                return true
            end }
            if ok then
                -- Save PID so stop-desktop can kill it later
                if is_plat("windows") then
                    local output = os.iorunv("tasklist", {"/FI", "IMAGENAME eq " .. path.filename(exe), "/FO", "CSV", "/NH"})
                    local pid = output:match('"[^"]+","(%d+)"')
                    if pid then io.writefile(pidfile, pid) end
                end
                print("Desktop app started! CDP ready on http://localhost:9222")
                return
            end
            os.sleep(500)
        end
        print("WARNING: app launched but CDP not responding after 30s")
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

-- ── CDP CLI (drive Qt app via Chrome DevTools Protocol) ─────────────
--
-- echo 'console.log(await snapshot())' | npx tsx tools/playwright-cdp/run.ts
-- npx tsx tools/playwright-cdp/cli.ts snapshot
-- See: npx tsx tools/playwright-cdp/cli.ts --help

target("playwright-cdp")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print("Usage: echo '<code>' | npx tsx tools/playwright-cdp/run.ts")
        print("   or: npx tsx tools/playwright-cdp/cli.ts <command> [args...]")
        print("")
        print("Functions: snapshot, screenshot, click, fill, press, eval_js, text, wait, console_messages")
        print("Run cli.ts with --help for full usage.")
    end)
