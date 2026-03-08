set_project("delightful-qt-web-shell")
set_version("0.1.0")

add_rules("mode.release")
set_defaultmode("release")
set_languages("c++23")

if is_plat("windows") then
    set_runtimes("MD")
end

add_requires("catch2 3.x")

-- ── Desktop app (Qt WebEngine + React) ───────────────────────────────

target("desktop")
    set_kind("binary")
    add_rules("qt.widgetapp")
    add_files(
        "cpp/main.cpp",
        "cpp/bridge.hpp",
        "cpp/resources/resources.qrc",
        "cpp/web_dist_resources.cpp"
    )
    if is_plat("windows") then
        set_filename("Delightful Qt Web Shell.exe")
        add_files("resources/app.rc")
    elseif is_plat("macosx") then
        set_filename("Delightful Qt Web Shell")
    else
        set_filename("delightful-qt-web-shell")
    end
    add_frameworks(
        "QtWidgets", "QtCore", "QtGui",
        "QtWebEngineCore", "QtWebEngineWidgets", "QtWebChannel"
    )

    before_build(function(target)
        local base = os.scriptdir()
        local web_dir = path.join(base, "web")
        local dist_dir = path.join(web_dir, "dist")

        -- 1. Build the web app
        os.execv("bun", {"install"}, {curdir = web_dir})
        os.execv("bun", {"run", "build"}, {curdir = web_dir})

        -- 2. Generate a .qrc listing every file in dist/
        local qrc_lines = {'<RCC>', '    <qresource prefix="/web">'}
        for _, f in ipairs(os.files(path.join(dist_dir, "**"))) do
            local rel = path.relative(f, dist_dir):gsub("\\", "/")
            local abs = path.absolute(f):gsub("\\", "/")
            table.insert(qrc_lines, '        <file alias="' .. rel .. '">' .. abs .. '</file>')
        end
        table.insert(qrc_lines, '    </qresource>')
        table.insert(qrc_lines, '</RCC>')

        local qrc_path = path.join(base, "cpp", "web_dist.qrc")
        io.writefile(qrc_path, table.concat(qrc_lines, "\n") .. "\n")

        -- 3. Compile the .qrc into a .cpp via rcc
        --    Windows: bin/rcc.exe    macOS/Linux: libexec/rcc (since Qt 6.1)
        local qt_dir = target:data("qt.dir") or get_config("qt")
        local rcc
        if is_host("windows") then
            rcc = path.join(qt_dir, "bin", "rcc.exe")
        else
            rcc = path.join(qt_dir, "libexec", "rcc")
            if not os.isfile(rcc) then
                rcc = path.join(qt_dir, "bin", "rcc")
            end
        end
        local cpp_path = path.join(base, "cpp", "web_dist_resources.cpp")
        os.runv(rcc, {"-o", cpp_path, qrc_path})
    end)

-- ── C++ unit tests (Catch2, no Qt) ───────────────────────────────────

target("test-todo-store")
    set_kind("binary")
    set_default(false)
    add_files("tests/todo_store_test.cpp")
    add_packages("catch2")

-- ── Headless WebSocket test server (Qt, no GUI) ──────────────────────

target("test-server")
    set_kind("binary")
    set_default(false)
    add_rules("qt.console")
    add_files(
        "cpp/test_server.cpp",
        "cpp/bridge.hpp",
        "cpp/expose_as_ws.hpp"
    )
    add_frameworks("QtCore", "QtNetwork", "QtWebSockets")

-- ── Playwright e2e tests ─────────────────────────────────────────────

target("test-e2e")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> npx playwright test (e2e)")
        local base = os.scriptdir()
        os.execv("npx", {"playwright", "test", "--project=e2e"}, {curdir = base})
    end)

-- ── Playwright CDP smoke tests (real Qt app) ─────────────────────────

target("test-smoke")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> npx playwright test (smoke)")
        local base = os.scriptdir()
        os.execv("npx", {"playwright", "test", "--project=smoke"}, {curdir = base})
    end)

-- ── Bun unit tests ───────────────────────────────────────────────────

target("test-bun")
    set_kind("phony")
    set_default(false)
    on_run(function()
        print(">>> bun test")
        local base = os.scriptdir()
        os.execv("bun", {"test"}, {curdir = base})
    end)

-- ── Run all tests ────────────────────────────────────────────────────

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
        print(">>> Playwright: e2e tests (C++ backend)")
        os.execv("xmake", {"run", "test-e2e"})
    end)
