// app_shell::App — see app.hpp for overview.
//
// Phase 1 of the native refactor: contains all logic that previously lived in
// the god-class Application. Later phases peel features off into opt-in services.

#include "shell/app.hpp"

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
#include "app_lifecycle.hpp"

namespace app_shell {

// Must match --bg in App.css — prevents white flash before web content loads.
static constexpr QColor kBackground{0x24, 0x24, 0x24};

App::App(int& argc, char** argv)
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
    setWindowIcon(QIcon(iconPath_));

    // ── Command line ─────────────────────────────────────────
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addVersionOption();
    QCommandLineOption devOption("dev",
        "Dev mode: load from Vite dev servers (main=5173) with hot reload");
    parser.addOption(devOption);
    parser.parse(arguments());
    devMode_ = parser.isSet(devOption);

    // ── Single instance guard ────────────────────────────────
    setupSingleInstance();
    if (!isPrimary_) return;

    // ── Dark theme ───────────────────────────────────────────
    styleHints()->setColorScheme(Qt::ColorScheme::Dark);
    QPalette darkPalette;
    darkPalette.setColor(QPalette::Window, kBackground);
    darkPalette.setColor(QPalette::Base, kBackground);
    setPalette(darkPalette);

    // ── Style manager ──────────────────────────────────────────
    styleManager_ = new StyleManager(this);
    styleManager_->applyTheme("default-dark");

    // ── Web profile ──────────────────────────────────────────
    profile_ = new QWebEngineProfile(APP_SLUG, this);
    QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    profile_->setCachePath(dataDir + "/cache");
    profile_->setPersistentStoragePath(dataDir + "/webdata");
    profile_->setHttpCacheType(QWebEngineProfile::DiskHttpCache);

    if (!devMode_) {
        auto* handler = new SchemeHandler(profile_);
        profile_->installUrlSchemeHandler("app", handler);
    }

    // ── Bridges + lifecycle ──────────────────────────────────
    lifecycle_ = new AppLifecycle(this);
    // @scaffold:bridge
    auto* todoBridge = new TodoBridge;
    registry_.add("todos", todoBridge);
    auto* systemBridge = new SystemBridge;
    registry_.add("system", systemBridge);

    // ── Wire StyleManager ↔ SystemBridge ──────────────────────
    connect(styleManager_, &StyleManager::themeChanged, this, [this, systemBridge]() {
        systemBridge->updateQtThemeState(
            styleManager_->currentDisplayName(), styleManager_->isDarkMode());
        QString filePath = styleManager_->currentThemeFilePath();
        systemBridge->setQtThemeFilePath(
            filePath.toStdString(), filePath.startsWith(":/"));
    });
    systemBridge->on_signal("qtThemeRequested", [this](const nlohmann::json& data) {
        auto displayName = QString::fromStdString(data["displayName"].get<std::string>());
        bool isDark = data["isDark"].get<bool>();
        QMetaObject::invokeMethod(this, [this, displayName, isDark]() {
            styleManager_->applyThemeByDisplayName(displayName, isDark);
        }, Qt::QueuedConnection);
    });

    // ── URL protocol registration ────────────────────────────
    promptUrlProtocolRegistration();

    // ── System tray ──────────────────────────────────────────
    setupSystemTray();

    // ── Dock manager ─────────────────────────────────────────
    dockManager_ = new DockManager(*this, this);

    // ── Shutdown ─────────────────────────────────────────────
    connect(this, &QApplication::aboutToQuit, this, [this]() {
        dockManager_->shutdownAll();
    });
}

void App::requestQuit() {
    dockManager_->shutdownAll();
    quit();
}

void App::setupSingleInstance() {
    QString serverName = APP_SLUG;

    QLocalSocket socket;
    socket.connectToServer(serverName);
    if (socket.waitForConnected(500)) {
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

    QLocalServer::removeServer(serverName);

    instanceServer_ = new QLocalServer(this);
    instanceServer_->listen(serverName);
    connect(instanceServer_, &QLocalServer::newConnection, this, [this]() {
        auto* client = instanceServer_->nextPendingConnection();
        connect(client, &QLocalSocket::readyRead, this, [this, client]() {
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

QString App::urlProtocolName() {
    return QString(APP_SLUG).toLower();
}

bool App::isUrlProtocolRegistered() {
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

    return true;
}

void App::registerUrlProtocol() {
    QString protocol = urlProtocolName();
    QString exePath = QDir::toNativeSeparators(applicationFilePath());

#ifdef Q_OS_WIN
    QSettings reg("HKEY_CURRENT_USER\\Software\\Classes\\" + protocol,
                   QSettings::NativeFormat);
    reg.setValue("Default", QString("URL:%1 Protocol").arg(APP_NAME));
    reg.setValue("URL Protocol", "");
    reg.setValue("shell/open/command/Default",
                 QString("\"%1\" \"%2\"").arg(exePath, "%1"));
#endif

#ifdef Q_OS_LINUX
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
}

void App::unregisterUrlProtocol() {
    QString protocol = urlProtocolName();

#ifdef Q_OS_WIN
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

void App::promptUrlProtocolRegistration() {
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
    if (settings.value("urlProtocol/dontAsk", false).toBool()) return;
    if (isUrlProtocolRegistered()) return;

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

bool App::event(QEvent* event) {
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

void App::setupSystemTray() {
    if (!QSystemTrayIcon::isSystemTrayAvailable()) return;

    trayIcon_ = new QSystemTrayIcon(QIcon(iconPath_), this);
    trayIcon_->setToolTip(APP_NAME);

    auto* trayMenu = new QMenu;

    auto* showAction = trayMenu->addAction("&Show Window");
    connect(showAction, &QAction::triggered, this, &App::activationRequested);

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
    connect(quitAction, &QAction::triggered, this, &App::requestQuit);

    trayIcon_->setContextMenu(trayMenu);

    connect(trayIcon_, &QSystemTrayIcon::activated, this,
            [this](QSystemTrayIcon::ActivationReason reason) {
        if (reason == QSystemTrayIcon::Trigger ||
            reason == QSystemTrayIcon::DoubleClick) {
            emit activationRequested();
        }
    });

    trayIcon_->show();
}

QUrl App::appUrl(const QString& appName) const {
    if (devMode_) {
        static const QHash<QString, int> devPorts = {
            {"main", 5173},
        };
        int port = devPorts.value(appName, 5175);
        return QUrl(QString("http://localhost:%1").arg(port));
    }
    return QUrl(QString("app://%1/").arg(appName));
}

}  // namespace app_shell
