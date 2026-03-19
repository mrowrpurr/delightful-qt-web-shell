// Application — app-wide setup that applies regardless of which windows are open.
//
// Identity, dark theme, web profile, bridges, single-instance guard — all live here.
// Widgets and windows are created separately and pull what they need from here.

#include "application.hpp"

#include <QCommandLineOption>
#include <QCommandLineParser>
#include <QIcon>
#include <QLocalServer>
#include <QLocalSocket>
#include <QMenu>
#include <QPalette>
#include <QStandardPaths>
#include <QStyleHints>
#include <QSystemTrayIcon>
#include <QWebEngineProfile>

#include "widgets/scheme_handler.hpp"

// @scaffold:include
#include "system_bridge.hpp"
#include "todo_bridge.hpp"
#include "web_shell.hpp"

// Must match --bg in App.css — prevents white flash before web content loads.
static constexpr QColor kBackground{0x24, 0x24, 0x24};

Application::Application(int& argc, char** argv)
    : QApplication(argc, argv)
{
    // ── Identity ─────────────────────────────────────────────
    setOrganizationName(APP_ORG);
    setApplicationName(APP_NAME);
    setApplicationVersion(APP_VERSION);
    setWindowIcon(QIcon(":/icon.ico"));

    // ── Command line ─────────────────────────────────────────
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addVersionOption();
    QCommandLineOption devOption("dev",
        "Dev mode: load from Vite dev server (localhost:5173) with hot reload");
    parser.addOption(devOption);
    parser.process(*this);
    devMode_ = parser.isSet(devOption);

    // ── Single instance guard ────────────────────────────────
    // If another instance is already running, signal it and exit.
    // To disable: remove this call and the isPrimaryInstance() check in main().
    setupSingleInstance();
    if (!isPrimary_) return;  // skip remaining setup — we're about to exit

    // ── Dark theme ───────────────────────────────────────────
    // setColorScheme handles menus and system widgets.
    // The palette ensures the window background is dark before any content paints,
    // preventing the white flash (FOUC) on startup.
    styleHints()->setColorScheme(Qt::ColorScheme::Dark);
    QPalette darkPalette;
    darkPalette.setColor(QPalette::Window, kBackground);
    darkPalette.setColor(QPalette::Base, kBackground);
    setPalette(darkPalette);

    // ── Web profile ──────────────────────────────────────────
    // Named profile = persistent localStorage and IndexedDB across sessions.
    // Data lives in the platform's standard app data directory:
    //   Windows: AppData/Local/<org>/<app>/
    //   macOS:   ~/Library/Application Support/<app>/
    //   Linux:   ~/.local/share/<app>/
    profile_ = new QWebEngineProfile(APP_SLUG, this);
    QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    profile_->setCachePath(dataDir + "/cache");
    profile_->setPersistentStoragePath(dataDir + "/webdata");
    profile_->setHttpCacheType(QWebEngineProfile::DiskHttpCache);

    // Install the app:// scheme handler once on the shared profile.
    // All WebShellWidgets share this profile, so the handler is available
    // everywhere without re-registering per widget.
    if (!devMode_) {
        auto* handler = new SchemeHandler(profile_);
        profile_->installUrlSchemeHandler("app", handler);
    }

    // ── Shell + bridges ──────────────────────────────────────
    // The shell owns all bridges. Every WebShellWidget registers the same
    // bridge instances on its own QWebChannel — one source of truth,
    // signals reach all connected views.
    shell_ = new WebShell(this);
    // @scaffold:bridge
    auto* todoBridge = new TodoBridge;
    shell_->addBridge("todos", todoBridge);
    auto* systemBridge = new SystemBridge;
    shell_->addBridge("system", systemBridge);

    // ── System tray ──────────────────────────────────────────
    // The tray icon lets the app live in the background without a visible window.
    // To disable: remove this call and the tray-related code.
    setupSystemTray();
}

void Application::setupSingleInstance() {
    // The server name is derived from the app slug so each app gets its own.
    // QLocalServer uses a platform-appropriate mechanism:
    //   Windows: named pipe
    //   Unix: domain socket in /tmp
    QString serverName = APP_SLUG;

    // Try to connect to an existing instance
    QLocalSocket socket;
    socket.connectToServer(serverName);
    if (socket.waitForConnected(500)) {
        // Another instance is running — ask it to activate and bail out
        socket.write("activate");
        socket.waitForBytesWritten(1000);
        socket.disconnectFromServer();
        isPrimary_ = false;
        return;
    }

    // We're the primary instance — start listening for future launches
    // Remove any stale socket from a previous crash (Unix only, harmless on Windows)
    QLocalServer::removeServer(serverName);

    instanceServer_ = new QLocalServer(this);
    instanceServer_->listen(serverName);
    connect(instanceServer_, &QLocalServer::newConnection, this, [this]() {
        auto* client = instanceServer_->nextPendingConnection();
        connect(client, &QLocalSocket::readyRead, this, [this, client]() {
            client->readAll();  // consume the "activate" message
            emit activationRequested();
            client->deleteLater();
        });
    });
}

void Application::setupSystemTray() {
    // System tray icon — lets the app live in the notification area.
    // The context menu provides quick access to show/hide and quit.
    //
    // On platforms without a system tray (some Linux DEs), this is a no-op.
    if (!QSystemTrayIcon::isSystemTrayAvailable()) return;

    trayIcon_ = new QSystemTrayIcon(QIcon(":/icon.ico"), this);
    trayIcon_->setToolTip(APP_NAME);

    // Context menu — right-click the tray icon
    auto* trayMenu = new QMenu;

    auto* showAction = trayMenu->addAction("&Show Window");
    connect(showAction, &QAction::triggered, this, &Application::activationRequested);

    // Version label — read-only, not clickable
    auto* versionAction = trayMenu->addAction(
        QString("%1 %2").arg(APP_NAME).arg(APP_VERSION));
    versionAction->setEnabled(false);

    trayMenu->addSeparator();

    auto* quitAction = trayMenu->addAction("&Quit");
    connect(quitAction, &QAction::triggered, this, &QApplication::quit);

    trayIcon_->setContextMenu(trayMenu);

    // Double-click (or single-click on macOS) activates the window
    connect(trayIcon_, &QSystemTrayIcon::activated, this,
            [this](QSystemTrayIcon::ActivationReason reason) {
        if (reason == QSystemTrayIcon::Trigger ||
            reason == QSystemTrayIcon::DoubleClick) {
            emit activationRequested();
        }
    });

    trayIcon_->show();
}
