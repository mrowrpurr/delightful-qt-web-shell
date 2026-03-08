target("test-server")
    set_kind("binary")
    set_default(false)
    add_rules("qt.console")
    add_deps("web-bridge", "web-shell")
    add_files(
        "src/test_server.cpp",
        path.join(os.projectdir(), "lib/web-bridge/include/bridge.hpp"),
        path.join(os.projectdir(), "lib/web-shell/include/expose_as_ws.hpp")
    )
    add_frameworks("QtCore", "QtNetwork", "QtWebSockets")
