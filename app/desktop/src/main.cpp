// Qt desktop shell — the entry point.
// Everything interesting lives in the classes this file wires together.

#include "application.hpp"
#include "dock_manager.hpp"
#include "logging.hpp"
#include "system_bridge.hpp"
#include "widgets/scheme_handler.hpp"
#include "windows/main_window.hpp"

#include <QTimer>

int main(int argc, char* argv[]) {
    setupLogging();

    // Custom URL scheme must be registered BEFORE QApplication is constructed.
    // Qt enforces this — it's a hard requirement, not a suggestion.
    SchemeHandler::registerUrlScheme();

    Application app(argc, argv);

    // If another instance is already running, it was signaled to activate.
    // This process exits cleanly — the user sees the existing window raise.
    if (!app.isPrimaryInstance()) return 0;

    // Restore saved windows, or create one default window.
    auto windows = app.dockManager()->restoreWindows();
    if (windows.isEmpty())
        windows.append(new MainWindow());

    // When another instance tries to launch, raise any visible MainWindow.
    QObject::connect(&app, &Application::activationRequested, windows.first(), [&windows]() {
        for (auto* w : QApplication::topLevelWidgets()) {
            if (auto* mw = qobject_cast<MainWindow*>(w); mw && mw->isVisible()) {
                mw->raise();
                mw->activateWindow();
                return;
            }
        }
        // No visible windows — show the first one
        if (!windows.isEmpty()) {
            windows.first()->show();
            windows.first()->raise();
            windows.first()->activateWindow();
        }
    });

    // Forward args to the SystemBridge so React can see them.
    // Handles: first launch args, second-instance args, and URL protocol activations.
    auto* systemBridge = static_cast<SystemBridge*>(
        app.registry()->get("system"));
    if (systemBridge) {
        QObject::connect(&app, &Application::appLaunchArgsReceived,
                         &app, [systemBridge](const QStringList& args) {
            systemBridge->handleAppLaunchArgs(args);
        });

        // Pass the primary instance's own args on first launch
        QStringList args = app.arguments().mid(1);
        if (!args.isEmpty())
            systemBridge->handleAppLaunchArgs(args);
    }

    // Show all windows. First one gets the anti-flash treatment.
    for (int i = 0; i < windows.size(); ++i) {
        auto* win = windows[i];
        if (i == 0) {
            win->setWindowOpacity(0.0);
            win->show();
            QTimer::singleShot(0, [win]() { win->setWindowOpacity(1.0); });
        } else {
            win->show();
        }
    }

    return app.exec();
}
