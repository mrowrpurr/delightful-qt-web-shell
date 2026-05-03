// app_shell::App — the framework's application class.
//
// Owns app-level concerns: identity, web profile, bridge registry, lifecycle,
// single-instance guard, URL protocol, system tray, theming, dock manager.
//
// Phase 1 of the native refactor: this class replaces the god-class Application.
// Application is kept as a thin transitional subclass while later phases peel
// hardcoded features off into opt-in services.

#pragma once

#include <QApplication>
#include <QUrl>

#include "bridge_registry.hpp"

class AppLifecycle;
class DockManager;
class QLocalServer;
class QSystemTrayIcon;
class QWebEngineProfile;
class StyleManager;

namespace app_shell {

class App : public QApplication {
    Q_OBJECT

public:
    App(int& argc, char** argv);

    bool devMode() const { return devMode_; }
    QWebEngineProfile* webProfile() const { return profile_; }
    BridgeRegistry* registry() { return &registry_; }
    const BridgeRegistry* registry() const { return &registry_; }
    AppLifecycle* lifecycle() const { return lifecycle_; }
    StyleManager* styleManager() const { return styleManager_; }
    DockManager* dockManager() const { return dockManager_; }

    QUrl appUrl(const QString& appName) const;

    // The window/tray icon (a Windows .ico bundle on Windows, a PNG elsewhere).
    // Framework reads the icon through this accessor so consumers can rename
    // their icon without editing framework code.
    QString iconPath() const { return iconPath_; }

    // The PNG used for in-app branding (about dialog, loading overlay).
    // Separate from iconPath() because Windows wants .ico for window/tray
    // metadata but Qt widgets want a real raster format.
    QString brandingImagePath() const { return brandingImagePath_; }

    bool isPrimaryInstance() const { return isPrimary_; }

    static bool isUrlProtocolRegistered();
    static void registerUrlProtocol();
    static void unregisterUrlProtocol();
    static QString urlProtocolName();

public slots:
    // Cleanly shut down all docks and windows, then quit.
    // Use this instead of QApplication::quit() so cleanup runs
    // while the event loop is still alive.
    void requestQuit();

signals:
    void activationRequested();
    void appLaunchArgsReceived(const QStringList& args);

protected:
    // macOS delivers URL scheme activations via QEvent::FileOpen.
    bool event(QEvent* event) override;

private:
    void setupSingleInstance();
    void setupSystemTray();
    void promptUrlProtocolRegistration();

    bool devMode_ = false;
    bool isPrimary_ = true;
    QString iconPath_ = ":/icon.ico";
    QString brandingImagePath_ = ":/icon.png";
    QWebEngineProfile* profile_ = nullptr;
    BridgeRegistry registry_;
    AppLifecycle* lifecycle_ = nullptr;
    QLocalServer* instanceServer_ = nullptr;
    QSystemTrayIcon* trayIcon_ = nullptr;
    StyleManager* styleManager_ = nullptr;
    DockManager* dockManager_ = nullptr;
};

}  // namespace app_shell
