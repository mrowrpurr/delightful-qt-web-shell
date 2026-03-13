target("dev-server")
    set_kind("binary")
    set_default(false)
    add_rules("qt.console")
    add_deps("todo-bridge", "web-shell")
    add_files(
        "src/test_server.cpp",
        "include/type_test_bridge.hpp"
    )
    add_includedirs("include")
    add_frameworks("QtCore", "QtNetwork", "QtWebSockets")

    -- Write the binary path so Playwright can run it directly.
    -- Running via `xmake run` creates a grandchild process that orphans
    -- on Windows when Playwright kills the parent. Direct exe = clean kill.
    after_build(function(target)
        io.writefile(path.join(os.projectdir(), "build", ".dev-server-binary.txt"), target:targetfile())
    end)
