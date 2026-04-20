// Application — app-wide setup that applies regardless of which windows are open.
//
// Identity, dark theme, web profile, bridges, single-instance guard — all live here.
// Widgets and windows are created separately and pull what they need from here.

#include "application.hpp"

#include <QCommandLineOption>
#include <QCommandLineParser>
#include <QCheckBox>
#include <QDir>
#include <QEvent>
#include <QFileOpenEvent>
#include <QIcon>
#include <QLocalServer>
#include <QLocalSocket>
#include <QMenu>
#include <QMessageBox>
#include <QPalette>
#include <QProcess>
#include <QSettings>
#include <QStandardPaths>
#include <QStyleHints>
#include <QSystemTrayIcon>
#include <QWebEngineProfile>

#include "dock_manager.hpp"
#include "style_manager.hpp"
#include "widgets/scheme_handler.hpp"

#include <oclero/qlementine/icons/QlementineIcons.hpp>

// @scaffold:include
#include "system_bridge.hpp"
#include "todo_bridge.hpp"
#include "web_shell.hpp"

// Must match --bg in App.css — prevents white flash before web content loads.
static constexpr QColor kBackground{0x24, 0x24, 0x24};

Application::Application(int& argc, char** argv)
    : QApplication(argc, argv)
{
    // ── Icons ──────────────────────────────────────────────────
    // Initialize Qlementine icon theme — must happen before any QIcon usage.
    // After this, use QIcon(iconPath(Icons16::...)) anywhere in the app.
    oclero::qlementine::icons::initializeIconTheme();

    // ── Identity ─────────────────────────────────────────────
    setOrganizationName(APP_ORG);
    setApplicationName(APP_NAME);

    // Use INI files for QSettings instead of the Windows registry.
    // Settings file lives in AppData/Local/<org>/<app>.ini.
    QSettings::setDefaultFormat(QSettings::IniFormat);
    setApplicationVersion(APP_VERSION);
    setWindowIcon(QIcon(":/icon.ico"));

    // ── Command line ─────────────────────────────────────────
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addVersionOption();
    QCommandLineOption devOption("dev",
        "Dev mode: load from Vite dev servers (main=5173) with hot reload");
    parser.addOption(devOption);
    // parse() instead of process() — unknown args pass through to the app
    // instead of showing an error dialog. Template users add their own options here.
    parser.parse(arguments());
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

    // ── Style manager ──────────────────────────────────────────
    // Handles QSS theme loading from QRC, AppData, or dev SCSS folder.
    // Must come after palette setup — the stylesheet overrides palette colors.
    // Initial theme is set by React on startup (it owns localStorage state).
    // We apply default-dark as a baseline to prevent unstyled flash.
    styleManager_ = new StyleManager(this);
    styleManager_->applyTheme("default-dark");

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

    // ── Wire StyleManager ↔ SystemBridge ──────────────────────
    // When StyleManager changes theme (toolbar, live reload) → update bridge state → React gets signal
    connect(styleManager_, &StyleManager::themeChanged, this, [this, systemBridge]() {
        systemBridge->updateQtThemeState(
            styleManager_->currentDisplayName(), styleManager_->isDarkMode());
        QString filePath = styleManager_->currentThemeFilePath();
        systemBridge->setQtThemeFilePath(
            filePath.toStdString(), filePath.startsWith(":/"));
    });
    // When React requests a theme change via bridge → apply to StyleManager
    systemBridge->on_signal("qtThemeRequested", [this](const nlohmann::json& data) {
        auto displayName = QString::fromStdString(data["displayName"].get<std::string>());
        bool isDark = data["isDark"].get<bool>();
        styleManager_->applyThemeByDisplayName(displayName, isDark);
    });

    // ── URL protocol registration ────────────────────────────
    // Prompt the user to register if not already done.
    // Also accessible via Tools > Register/Unregister URL Protocol in the menu.
    promptUrlProtocolRegistration();

    // ── System tray ──────────────────────────────────────────
    // The tray icon lets the app live in the background without a visible window.
    // To disable: remove this call and the tray-related code.
    setupSystemTray();

    // ── Dock manager ─────────────────────────────────────────
    // Tracks all docks across all windows. Persists per-dock state
    // on every meaningful change (create, close, URL, float, geometry).
    dockManager_ = new DockManager(this);

    // ── Shutdown ─────────────────────────────────────────────
    // Safety net only — requestQuit() should have already run shutdownAll().
    // This catches edge cases like the OS terminating the app.
    connect(this, &QApplication::aboutToQuit, this, [this]() {
        dockManager_->shutdownAll();
    });
}

void Application::requestQuit() {
    // Run shutdown while the event loop is still alive.
    // This is the key difference from aboutToQuit — deleteLater()
    // and event processing still work here.
    dockManager_->shutdownAll();
    quit();
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
        // Another instance is running — send our args and bail out.
        // Protocol: one line per arg, or just "activate" if no args.
        QStringList allArgs = arguments().mid(1);
        if (allArgs.isEmpty()) {
            socket.write("activate\n");
        } else {
            for (const auto& arg : allArgs)
                socket.write(("arg:" + arg + "\n").toUtf8());
        }
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
            // Parse messages: "activate\n" or "arg:<value>\n"
            QString data = QString::fromUtf8(client->readAll());
            QStringList lines = data.split('\n', Qt::SkipEmptyParts);
            QStringList args;
            for (const auto& line : lines) {
                if (line.startsWith("arg:"))
                    args.append(line.mid(4));
            }
            if (!args.isEmpty())
                emit appLaunchArgsReceived(args);
            emit activationRequested();
            client->deleteLater();
        });
    });
}

QString Application::urlProtocolName() {
    return QString(APP_SLUG).toLower();
}

bool Application::isUrlProtocolRegistered() {
    QString protocol = urlProtocolName();

#ifdef Q_OS_WIN
    QSettings reg("HKEY_CURRENT_USER\\Software\\Classes\\" + protocol,
                   QSettings::NativeFormat);
    QString cmd = reg.value("shell/open/command/Default").toString();
    return cmd.contains(QDir::toNativeSeparators(applicationFilePath()));
#endif

#ifdef Q_OS_LINUX
    QString desktopDir = QStandardPaths::writableLocation(
        QStandardPaths::ApplicationsLocation);
    return QFile::exists(desktopDir + "/" + protocol + ".desktop");
#endif

    // macOS: declared in Info.plist at build time — always "registered" if plist is right
    return true;
}

void Application::registerUrlProtocol() {
    // Register this app as the handler for a custom URL protocol.
    // After registration, clicking "delightful-qt://anything" in a browser
    // will launch this app (or activate it via single-instance) with the URL as an arg.
    //
    // The protocol name comes from APP_SLUG — change it in xmake.lua to change the scheme.
    // The URL arrives as a normal command line arg, so the existing single-instance
    // pipe forwards it to React via the appLaunchArgsReceived signal.

    QString protocol = urlProtocolName();
    QString exePath = QDir::toNativeSeparators(applicationFilePath());

#ifdef Q_OS_WIN
    // Windows: write to HKCU\Software\Classes\<protocol>
    // User-level — no admin required. Survives reboots.
    QSettings reg("HKEY_CURRENT_USER\\Software\\Classes\\" + protocol,
                   QSettings::NativeFormat);
    reg.setValue("Default", QString("URL:%1 Protocol").arg(APP_NAME));
    reg.setValue("URL Protocol", "");
    reg.setValue("shell/open/command/Default",
                 QString("\"%1\" \"%2\"").arg(exePath, "%1"));
#endif

#ifdef Q_OS_LINUX
    // Linux: write a .desktop file and register via xdg-mime.
    // Goes to ~/.local/share/applications/ — user-level, no root required.
    QString desktopDir = QStandardPaths::writableLocation(
        QStandardPaths::ApplicationsLocation);
    QDir().mkpath(desktopDir);
    QString desktopPath = desktopDir + "/" + protocol + ".desktop";

    QFile f(desktopPath);
    if (f.open(QIODevice::WriteOnly | QIODevice::Text)) {
        QTextStream out(&f);
        out << "[Desktop Entry]\n"
            << "Type=Application\n"
            << "Name=" << APP_NAME << "\n"
            << "Exec=\"" << exePath << "\" %u\n"
            << "MimeType=x-scheme-handler/" << protocol << "\n"
            << "NoDisplay=true\n";
        f.close();
        QProcess::startDetached("xdg-mime",
            {"default", protocol + ".desktop", "x-scheme-handler/" + protocol});
    }
#endif

    // macOS: URL schemes are declared in Info.plist, not registered at runtime.
    // Add this to your Info.plist (xmake can generate it):
    //
    //   <key>CFBundleURLTypes</key>
    //   <array>
    //     <dict>
    //       <key>CFBundleURLSchemes</key>
    //       <array>
    //         <string>delightful-qt</string>
    //       </array>
    //       <key>CFBundleURLName</key>
    //       <string>com.example.delightful-qt</string>
    //     </dict>
    //   </array>
    //
    // macOS delivers the URL via QEvent::FileOpen — handled in event() below.
}

void Application::unregisterUrlProtocol() {
    QString protocol = urlProtocolName();

#ifdef Q_OS_WIN
    // Remove the registry key tree for this protocol
    QSettings reg("HKEY_CURRENT_USER\\Software\\Classes",
                   QSettings::NativeFormat);
    reg.remove(protocol);
#endif

#ifdef Q_OS_LINUX
    QString desktopDir = QStandardPaths::writableLocation(
        QStandardPaths::ApplicationsLocation);
    QFile::remove(desktopDir + "/" + protocol + ".desktop");
#endif
}

void Application::promptUrlProtocolRegistration() {
    // If already registered or user said "don't ask", skip.
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
    if (settings.value("urlProtocol/dontAsk", false).toBool()) return;
    if (isUrlProtocolRegistered()) return;

    // Show a dialog asking the user to register
    QMessageBox box;
    box.setWindowTitle(APP_NAME);
    box.setIcon(QMessageBox::Question);
    box.setText(QString("Register <b>%1://</b> URL protocol?").arg(urlProtocolName()));
    box.setInformativeText(
        QString("This lets you open %1 from a browser or other apps by clicking "
                "<b>%2://</b> links.").arg(APP_NAME, urlProtocolName()));

    auto* dontAskCheck = new QCheckBox("Don't ask me again");
    box.setCheckBox(dontAskCheck);

    box.addButton(QMessageBox::Yes);
    box.addButton(QMessageBox::No);
    box.setDefaultButton(QMessageBox::Yes);

    int result = box.exec();

    if (dontAskCheck->isChecked())
        settings.setValue("urlProtocol/dontAsk", true);

    if (result == QMessageBox::Yes)
        registerUrlProtocol();
}

bool Application::event(QEvent* event) {
    // macOS delivers URL scheme activations and file-open requests via this event.
    // e.g. clicking "delightful-qt://some/path" in Safari sends a FileOpen event
    // with the full URL as the payload. We emit appLaunchArgsReceived so React can handle it.
    if (event->type() == QEvent::FileOpen) {
        auto* openEvent = static_cast<QFileOpenEvent*>(event);
        QString payload = openEvent->url().toString();
        if (payload.isEmpty())
            payload = openEvent->file();
        if (!payload.isEmpty())
            emit appLaunchArgsReceived({payload});
        return true;
    }
    return QApplication::event(event);
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

    // ── Example Menu 1 — flat actions ────────────────────────
    auto* exampleMenu1 = trayMenu->addMenu("Example Menu 1");
    for (const auto& name : {"Alpha", "Beta", "Gamma"}) {
        auto* action = exampleMenu1->addAction(name);
        connect(action, &QAction::triggered, this, [name] {
            QMessageBox::information(nullptr, "Example Menu 1", QString("You clicked: %1").arg(name));
        });
    }

    // ── Nested Example 2 — submenus ─────────────────────────
    auto* nestedMenu = trayMenu->addMenu("Nested Example 2");

    auto* topAction = nestedMenu->addAction("Top-Level Action");
    connect(topAction, &QAction::triggered, this, [] {
        QMessageBox::information(nullptr, "Nested Example 2", "You clicked: Top-Level Action");
    });

    auto* subMenu1 = nestedMenu->addMenu("Sub-Menu");
    auto* subAction1 = subMenu1->addAction("Sub Action");
    connect(subAction1, &QAction::triggered, this, [] {
        QMessageBox::information(nullptr, "Sub-Menu", "You clicked: Sub Action");
    });

    auto* subMenu2 = subMenu1->addMenu("Deeper Sub-Menu");
    auto* deepAction = subMenu2->addAction("Deep Action");
    connect(deepAction, &QAction::triggered, this, [] {
        QMessageBox::information(nullptr, "Deeper Sub-Menu", "You clicked: Deep Action");
    });

    trayMenu->addSeparator();

    auto* quitAction = trayMenu->addAction("&Quit");
    connect(quitAction, &QAction::triggered, this, &Application::requestQuit);

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

QUrl Application::appUrl(const QString& appName) const {
    if (devMode_) {
        // Each web app runs its own Vite dev server.
        // Convention: main=5173, additional apps=5174+
        static const QHash<QString, int> devPorts = {
            {"main", 5173},
        };
        int port = devPorts.value(appName, 5175);
        return QUrl(QString("http://localhost:%1").arg(port));
    }
    // Production: serve from embedded Qt resources via app://<name>/
    return QUrl(QString("app://%1/").arg(appName));
}
