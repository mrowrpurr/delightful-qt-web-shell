// Qt desktop shell — the entry point.
// Everything interesting lives in the classes this file wires together.

#include "application.hpp"
#include "system_bridge.hpp"
#include "web_shell.hpp"
#include "widgets/scheme_handler.hpp"
#include "windows/main_window.hpp"

#include <QTimer>

int main(int argc, char* argv[]) {
    // Custom URL scheme must be registered BEFORE QApplication is constructed.
    // Qt enforces this — it's a hard requirement, not a suggestion.
    SchemeHandler::registerUrlScheme();

    Application app(argc, argv);

    // If another instance is already running, it was signaled to activate.
    // This process exits cleanly — the user sees the existing window raise.
    if (!app.isPrimaryInstance()) return 0;

    MainWindow window;

    // When another instance tries to launch, raise any visible MainWindow.
    // Falls back to the original window if none are visible (e.g. all hidden to tray).
    QObject::connect(&app, &Application::activationRequested, &window, [&window]() {
        for (auto* w : QApplication::topLevelWidgets()) {
            if (auto* mw = qobject_cast<MainWindow*>(w); mw && mw->isVisible()) {
                mw->raise();
                mw->activateWindow();
                return;
            }
        }
        // No visible windows — show the original
        window.show();
        window.raise();
        window.activateWindow();
    });

    // When another instance passes args, forward to the SystemBridge.
    // React subscribes to argsReceived and calls getReceivedArgs().
    auto* systemBridge = qobject_cast<SystemBridge*>(
        app.shell()->bridges().value("system"));
    if (systemBridge) {
        QObject::connect(&app, &Application::argsReceived,
                         systemBridge, &SystemBridge::handleArgs);

        // Also handle args on the primary instance's first launch
        QStringList args = app.arguments().mid(1);
        if (!args.isEmpty())
            systemBridge->handleArgs(args);
    }

    // Show invisible, let Qt paint the dark background, then reveal.
    // This prevents a white flash on the first frame.
    window.setWindowOpacity(0.0);
    window.show();
    QTimer::singleShot(0, [&window]() { window.setWindowOpacity(1.0); });

    return app.exec();
}
