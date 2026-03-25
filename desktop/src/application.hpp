// Application — custom QApplication subclass.
//
// Owns app-level concerns: identity, appearance, web profile, bridges,
// single-instance guard, and system tray.
//
// Widgets and windows come later — the app can run without any visible window
// (e.g. system tray only).

#pragma once

#include <QApplication>
#include <QUrl>

class QLocalServer;
class QSystemTrayIcon;
class QWebEngineProfile;
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

    // Returns the URL for a named web app.
    // Production: app://<appName>/  (served from embedded Qt resources)
    // Dev mode:   http://localhost:<port>  (Vite dev server with HMR)
    QUrl appUrl(const QString& appName) const;

    // Returns true if this is the primary instance.
    // If false, a message was sent to the running instance and this process
    // should exit immediately (return 0 from main).
    bool isPrimaryInstance() const { return isPrimary_; }

signals:
    // Emitted when another instance tries to launch, or the system tray
    // icon is activated. MainWindow connects to this to raise itself.
    void activationRequested();

    // Emitted when another instance passes command line args.
    // e.g. myapp.exe --look-ma flags "and stuff" → primary instance receives all args.
    void argsReceived(const QStringList& args);

private:
    void setupSingleInstance();
    void setupSystemTray();

    bool devMode_ = false;
    bool isPrimary_ = true;
    QWebEngineProfile* profile_ = nullptr;
    WebShell* shell_ = nullptr;
    QLocalServer* instanceServer_ = nullptr;
    QSystemTrayIcon* trayIcon_ = nullptr;
};
