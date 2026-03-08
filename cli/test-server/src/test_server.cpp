// Headless WebSocket server for Playwright e2e tests.
// No GUI, no WebEngine — just a Bridge over WebSocket.
//
// Usage: test-server [--port 9876]
//
// This is the C++ equivalent of test-server/server.ts.
// Same protocol, same behavior, real C++ code.

#include <QCoreApplication>
#include <QCommandLineParser>

#include "bridge.hpp"
#include "expose_as_ws.hpp"

int main(int argc, char* argv[]) {
    QCoreApplication app(argc, argv);
    app.setApplicationName("test-server");

    QCommandLineParser parser;
    parser.addOption({{"p", "port"}, "WebSocket port", "port", "9876"});
    parser.process(app);

    int port = parser.value("port").toInt();

    Bridge bridge;
    auto* server = expose_as_ws(&bridge, port);
    if (!server) return 1;

    return app.exec();
}
