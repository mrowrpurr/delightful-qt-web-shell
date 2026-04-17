// Application — custom QApplication subclass.
//
// Owns app-level concerns: identity, appearance, web profile, bridges,
// single-instance guard, URL protocol registration, and system tray.
//
// Widgets and windows come later — the app can run without any visible window
// (e.g. system tray only).

#pragma once

#include <QApplication>
#include <QUrl>

class DockManager;
class QLocalServer;
class QSystemTrayIcon;
class QWebEngineProfile;
class StyleManager;
class WebShell;

class Application : public QApplication {
    Q_OBJECT

public:
    Application(int& argc, char** argv);

    // Whether --dev was passed (load from Vite instead of embedded resources)
    bool devMode() const { return devMode_; }

    // Shared web engine profile — persistent localStorage/IndexedDB
    QWebEngineProfile* webProfile() const { return profile_; }

    // The shell that owns all bridges — shared across all WebShellWidgets
    WebShell* shell() const { return shell_; }

    // Style manager — handles QSS theme loading, live reload, SCSS compilation
    StyleManager* styleManager() const { return styleManager_; }

    // Dock manager — tracks all docks across all windows
    DockManager* dockManager() const { return dockManager_; }

    // Returns the URL for a named web app.
    // Production: app://<appName>/  (served from embedded Qt resources)
    // Dev mode:   http://localhost:<port>  (Vite dev server with HMR)
    QUrl appUrl(const QString& appName) const;

    // Returns true if this is the primary instance.
    // If false, a message was sent to the running instance and this process
    // should exit immediately (return 0 from main).
    bool isPrimaryInstance() const { return isPrimary_; }

    // URL protocol (e.g. "delightful-qt://") — register/unregister/check
    static bool isUrlProtocolRegistered();
    static void registerUrlProtocol();
    static void unregisterUrlProtocol();

    // Returns the protocol name (from APP_SLUG, lowercased)
    static QString urlProtocolName();

signals:
    // Emitted when another instance tries to launch, or the system tray
    // icon is activated. MainWindow connects to this to raise itself.
    void activationRequested();

    // Emitted when another instance passes command line args.
    // Also emitted on first launch with the primary instance's own args.
    void argsReceived(const QStringList& args);

protected:
    // macOS delivers URL scheme activations via QEvent::FileOpen.
    // On other platforms this just calls the base class.
    bool event(QEvent* event) override;

private:
    void setupSingleInstance();
    void setupSystemTray();
    void promptUrlProtocolRegistration();

    bool devMode_ = false;
    bool isPrimary_ = true;
    QWebEngineProfile* profile_ = nullptr;
    WebShell* shell_ = nullptr;
    QLocalServer* instanceServer_ = nullptr;
    QSystemTrayIcon* trayIcon_ = nullptr;
    StyleManager* styleManager_ = nullptr;
    DockManager* dockManager_ = nullptr;
};
