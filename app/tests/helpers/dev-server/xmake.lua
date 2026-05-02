-- Capture at parse time — globals aren't available inside after_build closures
local _TEMPLATE_ROOT = TEMPLATE_ROOT

target("dev-server")
    set_kind("binary")
    set_default(false)
    add_rules("qt.console")
    add_deps("qt-bridges", "app.framework.qt-transport", "app.framework.app-lifecycle")
    add_files(
        "src/test_server.cpp",
        "include/type_test_bridge.hpp"
    )
    add_includedirs("include")

    -- Write the binary path so Playwright can run it directly.
    -- Running via `xmake run` creates a grandchild process that orphans
    -- on Windows when Playwright kills the parent. Direct exe = clean kill.
    after_build(function(target)
        local abs_exe = path.absolute(target:targetfile())
        -- Write to template root so bun tests (which run from there) can find it
        os.mkdir(path.join(_TEMPLATE_ROOT, "build"))
        io.writefile(path.join(_TEMPLATE_ROOT, "build", ".dev-server-binary.txt"), abs_exe)
    end)
