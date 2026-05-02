// Headless WebSocket server — exposes bridges without a GUI.
// Used for dev mode (browser + C++ backend) and Playwright e2e tests.
//
// Usage: dev-server [--port 9876]

#include <QCoreApplication>
#include <QCommandLineParser>

// @scaffold:include
#include "system_bridge.hpp"
#include "todo_bridge.hpp"
#include "expose_as_ws.hpp"
#include "app_lifecycle.hpp"
#include "bridge_registry.hpp"

int main(int argc, char* argv[]) {
    QCoreApplication app(argc, argv);
    app.setApplicationName("dev-server");

    QCommandLineParser parser;
    parser.addOption({{"p", "port"}, "WebSocket port", "port", "9876"});
    parser.process(app);

    int port = parser.value("port").toInt();

    // Register your bridges here — must match desktop/src/main.cpp.
    // If you add a bridge in main.cpp but forget here, browser-mode dev
    // and Playwright tests will silently be missing that bridge.
    web_shell::BridgeRegistry registry;
    AppLifecycle lifecycle;
    // @scaffold:bridge
    auto* todoBridge = new TodoBridge;
    registry.add("todos", todoBridge);
    auto* systemBridge = new SystemBridge;
    registry.add("system", systemBridge);
    auto* server = expose_as_ws(&registry, &lifecycle, port);
    if (!server) return 1;

    return app.exec();
}
