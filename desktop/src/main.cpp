// Qt desktop shell — embeds the React app in a WebEngine view
// with QWebChannel bridge to C++.
//
// For Playwright CDP smoke tests, launch with:
//   QTWEBENGINE_REMOTE_DEBUGGING=9222 ./desktop.exe

#include <QApplication>
#include <QCommandLineOption>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QGraphicsOpacityEffect>
#include <QIcon>
#include <QLabel>
#include <QMainWindow>
#include <QMenuBar>
#include <QMessageBox>
#include <QPointer>
#include <QProgressBar>
#include <QPropertyAnimation>
#include <QResizeEvent>
#include <QScreen>
#include <QSettings>
#include <QStandardPaths>
#include <QStyleHints>
#include <QTimer>
#include <QVBoxLayout>
#include <QWebChannel>
#include <QWebEnginePage>
#include <QWebEngineProfile>
#include <QWebEngineScript>
#include <QWebEngineScriptCollection>
#include <QWebEngineUrlScheme>
#include <QWebEngineUrlSchemeHandler>
#include <QWebEngineUrlRequestJob>
#include <QWebEngineView>

#include "todo_bridge.hpp"
#include "web_shell.hpp"

// Must match --bg in App.css — prevents white flash before web content loads.
static constexpr QColor kBackground{0x24, 0x24, 0x24};

// Keeps the loading overlay sized to match the parent widget.
class OverlayResizer : public QObject {
    QPointer<QWidget> overlay_;
public:
    OverlayResizer(QWidget* overlay, QObject* parent)
        : QObject(parent), overlay_(overlay) {}
    bool eventFilter(QObject*, QEvent* event) override {
        if (event->type() == QEvent::Resize && overlay_) {
            auto* re = static_cast<QResizeEvent*>(event);
            overlay_->setGeometry(0, 0, re->size().width(), re->size().height());
        }
        return false;
    }
};

// Serves files from embedded Qt resources (:/web/...) via a custom URL scheme.
// SPA fallback: unknown paths serve index.html.
class SchemeHandler : public QWebEngineUrlSchemeHandler {
    static QByteArray mimeForExtension(const QString& ext) {
        static const QHash<QString, QByteArray> types = {
            {"html", "text/html"},       {"js",   "text/javascript"},
            {"mjs",  "text/javascript"}, {"css",  "text/css"},
            {"json", "application/json"},{"png",  "image/png"},
            {"jpg",  "image/jpeg"},      {"jpeg", "image/jpeg"},
            {"gif",  "image/gif"},       {"webp", "image/webp"},
            {"svg",  "image/svg+xml"},   {"ico",  "image/x-icon"},
            {"woff", "font/woff"},       {"woff2","font/woff2"},
            {"ttf",  "font/ttf"},        {"wasm", "application/wasm"},
            {"map",  "application/json"},
        };
        return types.value(ext.toLower(), "application/octet-stream");
    }

public:
    using QWebEngineUrlSchemeHandler::QWebEngineUrlSchemeHandler;

    void requestStarted(QWebEngineUrlRequestJob* job) override {
        QString urlPath = job->requestUrl().path();
        if (urlPath.isEmpty() || urlPath == "/") urlPath = "/index.html";

        QString resPath = ":/web" + urlPath;
        if (!QFile::exists(resPath))
            resPath = ":/web/index.html";  // SPA fallback

        auto* file = new QFile(resPath, job);
        if (!file->open(QIODevice::ReadOnly)) {
            job->fail(QWebEngineUrlRequestJob::UrlNotFound);
            return;
        }
        job->reply(mimeForExtension(QFileInfo(urlPath).suffix()), file);
    }
};

int main(int argc, char* argv[]) {
    // Custom URL scheme must be registered BEFORE QApplication
    QWebEngineUrlScheme scheme("app");
    scheme.setSyntax(QWebEngineUrlScheme::Syntax::HostAndPort);
    scheme.setDefaultPort(QWebEngineUrlScheme::PortUnspecified);
    scheme.setFlags(
        QWebEngineUrlScheme::SecureScheme |
        QWebEngineUrlScheme::LocalAccessAllowed |
        QWebEngineUrlScheme::CorsEnabled |
        QWebEngineUrlScheme::ContentSecurityPolicyIgnored
    );
    QWebEngineUrlScheme::registerScheme(scheme);

    QApplication app(argc, argv);
    app.setApplicationName(APP_NAME);

    QCommandLineParser parser;
    parser.addHelpOption();
    QCommandLineOption devOption("dev",
        "Dev mode: load from Vite dev server (localhost:5173) with hot reload");
    parser.addOption(devOption);
    parser.process(app);
    bool devMode = parser.isSet(devOption);

    app.styleHints()->setColorScheme(Qt::ColorScheme::Dark);
    app.setWindowIcon(QIcon(":/icon.ico"));

    // Dark palette — prevents white flash on first frame (FOUC).
    // setColorScheme handles menus/buttons, but the palette ensures the
    // window background is dark before any content paints.
    QPalette darkPalette;
    darkPalette.setColor(QPalette::Window, kBackground);
    darkPalette.setColor(QPalette::Base, kBackground);
    app.setPalette(darkPalette);

    // Named profile = persistent localStorage/IndexedDB
    auto* profile = new QWebEngineProfile(APP_SLUG, &app);
    QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    profile->setCachePath(dataDir + "/cache");
    profile->setPersistentStoragePath(dataDir + "/webdata");
    profile->setHttpCacheType(QWebEngineProfile::DiskHttpCache);

    QMainWindow window;
    window.setWindowTitle(APP_NAME);

    // Restore saved window geometry, or default to 900×640 centered
    QSettings settings(APP_SLUG, APP_SLUG);
    if (settings.contains("window/geometry")) {
        window.restoreGeometry(settings.value("window/geometry").toByteArray());
    } else {
        window.resize(900, 640);
        QScreen* screen = QApplication::primaryScreen();
        QRect geo = screen->availableGeometry();
        window.move((geo.width() - 900) / 2 + geo.x(),
                    (geo.height() - 640) / 2 + geo.y());
    }

    // ── Menu bar ──────────────────────────────────────────────
    // Add your menus below. Each menu follows the pattern:
    //   auto* myMenu = menuBar->addMenu("&MyMenu");
    //   auto* myAction = myMenu->addAction("&Do Thing");
    //   myAction->setShortcut(QKeySequence("Ctrl+D"));
    //   QObject::connect(myAction, &QAction::triggered, &window, [&]() { ... });
    auto* menuBar = window.menuBar();

    auto* fileMenu = menuBar->addMenu("&File");

    // Example: File > Save opens a native QFileDialog (save).
    // Demonstrates the pattern for native file pickers — testable with pywinauto.
    auto* saveAction = fileMenu->addAction("&Save...");
    saveAction->setShortcut(QKeySequence("Ctrl+S"));
    QObject::connect(saveAction, &QAction::triggered, &window, [&window]() {
        QFileDialog::getSaveFileName(&window, "Save File", "", "JSON Files (*.json);;All Files (*)");
    });

    // Example: File > Open Folder opens a native folder picker.
    // Demonstrates the folder-picker pattern — testable with pywinauto.
    auto* openFolderAction = fileMenu->addAction("&Open Folder...");
    openFolderAction->setShortcut(QKeySequence("Ctrl+O"));
    QObject::connect(openFolderAction, &QAction::triggered, &window, [&window]() {
        QFileDialog::getExistingDirectory(&window, "Open Folder", "",
            QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
    });

    fileMenu->addSeparator();
    auto* quitAction = fileMenu->addAction("&Quit");
    quitAction->setShortcut(QKeySequence("Ctrl+Q"));
    QObject::connect(quitAction, &QAction::triggered, &app, &QApplication::quit);

    auto* windowsMenu = menuBar->addMenu("&Windows");
    auto* devToolsAction = windowsMenu->addAction("&Developer Tools");
    devToolsAction->setShortcut(QKeySequence("F12"));
    devToolsAction->setShortcutContext(Qt::ApplicationShortcut);

    // Example: Help > About opens a native QMessageBox.
    // Demonstrates the pattern for native dialogs — testable with pywinauto.
    auto* helpMenu = menuBar->addMenu("&Help");
    auto* aboutAction = helpMenu->addAction("&About");
    QObject::connect(aboutAction, &QAction::triggered, &window, [&window]() {
        QMessageBox::about(&window, "About " APP_NAME,
            QString("%1 v%2\n\nA template for Qt + React apps with real testing.")
                .arg(APP_NAME).arg(APP_VERSION));
    });

    // ── Shell + Bridge ─────────────────────────────────────────
    // Register your bridges here. Each bridge is a QObject with Q_INVOKABLE methods.
    //   auto* myBridge = new MyBridge;
    //   shell->addBridge("myName", myBridge);
    // Also register in tests/helpers/dev-server/src/test_server.cpp, and add the
    // .hpp to add_files() in both desktop/xmake.lua and dev-server/xmake.lua.
    auto* shell = new WebShell(&window);
    auto* bridge = new TodoBridge;
    shell->addBridge("todos", bridge);

    // ── Web view ──────────────────────────────────────────────
    auto* view = new QWebEngineView(&window);
    auto* page = new QWebEnginePage(profile, view);
    page->setBackgroundColor(kBackground);
    view->setPage(page);

    // Inject qwebchannel.js from Qt's built-in resources
    QFile webChannelFile(":/qtwebchannel/qwebchannel.js");
    if (webChannelFile.open(QIODevice::ReadOnly)) {
        QWebEngineScript wcScript;
        wcScript.setName("qwebchannel");
        wcScript.setSourceCode(QString::fromUtf8(webChannelFile.readAll()));
        wcScript.setInjectionPoint(QWebEngineScript::DocumentCreation);
        wcScript.setWorldId(QWebEngineScript::MainWorld);
        page->scripts().insert(wcScript);
    }

    // Register shell + bridges with QWebChannel
    auto* channel = new QWebChannel(page);
    channel->registerObject("_shell", shell);
    for (auto it = shell->bridges().begin(); it != shell->bridges().end(); ++it)
        channel->registerObject(it.key(), it.value());
    page->setWebChannel(channel);

    // ── Developer Tools ───────────────────────────────────────
    // Uses the same profile as the main page. DevTools connection is set up
    // lazily on first F12 press so the main page has time to load first.
    auto* devToolsView = new QWebEngineView;
    devToolsView->setWindowFlags(Qt::Window);
    devToolsView->setWindowTitle("Developer Tools — " APP_NAME);
    devToolsView->resize(1024, 600);
    auto* devToolsPage = new QWebEnginePage(profile, devToolsView);
    devToolsPage->setBackgroundColor(kBackground);
    devToolsView->setPage(devToolsPage);

    QObject::connect(devToolsAction, &QAction::triggered, devToolsView, [view, devToolsView]() {
        if (devToolsView->isVisible()) {
            devToolsView->hide();
        } else {
            // Connect inspector on first open (lazy — main page is loaded by now)
            if (!view->page()->devToolsPage())
                view->page()->setDevToolsPage(devToolsView->page());
            devToolsView->show();
            devToolsView->raise();
            devToolsView->activateWindow();
        }
    });

    // ── Serve web UI ─────────────────────────────────────────
    if (devMode) {
        // Dev mode: Vite dev server with HMR. QWebChannel still works
        // because qwebchannel.js is injected into any page by WebEngine.
        view->setUrl(QUrl("http://localhost:5173"));
    } else {
        // Production: serve from embedded Qt resources via custom scheme
        auto* handler = new SchemeHandler(profile);
        profile->installUrlSchemeHandler("app", handler);
        view->setUrl(QUrl("app://shell/"));
    }

    // ── Loading overlay ───────────────────────────────────────
    auto* stack = new QWidget(&window);
    stack->setAutoFillBackground(true);
    auto* stackLayout = new QVBoxLayout(stack);
    stackLayout->setContentsMargins(0, 0, 0, 0);
    stackLayout->setSpacing(0);
    stackLayout->addWidget(view);

    auto* overlay = new QWidget(stack);
    overlay->setStyleSheet(
        QStringLiteral("background-color: %1;").arg(kBackground.name()));
    overlay->setGeometry(stack->rect());

    auto* overlayLayout = new QVBoxLayout(overlay);
    overlayLayout->setAlignment(Qt::AlignCenter);

    auto* logo = new QLabel(overlay);
    logo->setPixmap(QPixmap(":/icon.png").scaled(128, 128, Qt::KeepAspectRatio, Qt::SmoothTransformation));
    logo->setAlignment(Qt::AlignCenter);
    overlayLayout->addStretch();
    overlayLayout->addWidget(logo);
    overlayLayout->addSpacing(24);

    auto* progressBar = new QProgressBar(overlay);
    progressBar->setRange(0, 0);
    progressBar->setTextVisible(false);
    progressBar->setFixedHeight(4);
    progressBar->setFixedWidth(200);
    progressBar->setStyleSheet(
        "QProgressBar { border: none; background: rgba(255, 255, 255, 0.1); border-radius: 2px; }"
        "QProgressBar::chunk { background: #4a9eff; border-radius: 2px; }"
    );
    overlayLayout->addWidget(progressBar, 0, Qt::AlignCenter);
    overlayLayout->addStretch();

    overlay->raise();
    stack->installEventFilter(new OverlayResizer(overlay, stack));
    window.setCentralWidget(stack);

    // Show invisible, let Qt paint the dark overlay, then reveal.
    window.setWindowOpacity(0.0);
    window.show();
    QTimer::singleShot(0, [&window]() { window.setWindowOpacity(1.0); });

    // Fade out overlay once the React app signals it's fully rendered.
    // This replaces loadFinished — we don't reveal until the bridge is
    // connected, data is loaded, and the first frame is committed.
    // Uses a single-shot connection so a double-emit won't crash.
    QObject::connect(shell, &WebShell::ready, overlay, [overlay, shell]() {
        // Disconnect immediately — a second ready() must not touch a deleted overlay
        QObject::disconnect(shell, &WebShell::ready, overlay, nullptr);

        auto* effect = new QGraphicsOpacityEffect(overlay);
        overlay->setGraphicsEffect(effect);

        auto* fadeOut = new QPropertyAnimation(effect, "opacity");
        fadeOut->setDuration(300);
        fadeOut->setStartValue(1.0);
        fadeOut->setEndValue(0.0);
        fadeOut->setEasingCurve(QEasingCurve::OutCubic);
        QObject::connect(fadeOut, &QPropertyAnimation::finished, overlay, &QWidget::deleteLater);
        fadeOut->start(QAbstractAnimation::DeleteWhenStopped);
    });

    // Safety timeout: if signalReady() never fires, show an error after 15 seconds
    // instead of leaving the user staring at a spinner forever.
    QTimer::singleShot(15000, overlay, [overlay, progressBar, logo]() {
        if (!overlay) return;  // Already removed by successful ready signal
        progressBar->hide();
        logo->hide();
        auto* errorLabel = new QLabel(overlay);
        errorLabel->setText("Bridge connection failed.\n\nCheck the console (F12) or restart the app.");
        errorLabel->setAlignment(Qt::AlignCenter);
        errorLabel->setStyleSheet("color: #ff6b6b; font-size: 14px;");
        overlay->layout()->addWidget(errorLabel);
        qWarning() << "signalReady() was not called within 15 seconds — bridge may be broken.";
    });

    // Save window geometry on close so it restores next launch
    QObject::connect(&app, &QApplication::aboutToQuit, [&]() {
        settings.setValue("window/geometry", window.saveGeometry());
    });

    return app.exec();
}
