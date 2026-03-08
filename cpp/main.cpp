// Qt desktop shell — embeds the React app in a WebEngine view
// with QWebChannel bridge to C++.
//
// For Playwright CDP smoke tests, launch with:
//   QTWEBENGINE_REMOTE_DEBUGGING=9222 ./desktop.exe

#include <QApplication>
#include <QCoreApplication>
#include <QFile>
#include <QFileInfo>
#include <QGraphicsOpacityEffect>
#include <QIcon>
#include <QLabel>
#include <QMainWindow>
#include <QMenuBar>
#include <QPointer>
#include <QProgressBar>
#include <QPropertyAnimation>
#include <QResizeEvent>
#include <QScreen>
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

#include "bridge.hpp"

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
            {"html", "text/html"},      {"js",   "text/javascript"},
            {"mjs",  "text/javascript"},{"css",  "text/css"},
            {"json", "application/json"},{"png",  "image/png"},
            {"svg",  "image/svg+xml"},  {"ico",  "image/x-icon"},
            {"woff", "font/woff"},      {"woff2","font/woff2"},
            {"ttf",  "font/ttf"},       {"wasm", "application/wasm"},
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
    app.styleHints()->setColorScheme(Qt::ColorScheme::Dark);
    app.setApplicationName("Delightful Qt Web Shell");

    // Dark palette — prevents white flash on first frame (FOUC).
    // setColorScheme handles menus/buttons, but the palette ensures the
    // window background is dark before any content paints.
    QPalette darkPalette;
    darkPalette.setColor(QPalette::Window, QColor(0x24, 0x24, 0x24));
    darkPalette.setColor(QPalette::Base, QColor(0x24, 0x24, 0x24));
    app.setPalette(darkPalette);

    // Named profile = persistent localStorage/IndexedDB
    auto* profile = new QWebEngineProfile("DelightfulShell", &app);
    QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    profile->setCachePath(dataDir + "/cache");
    profile->setPersistentStoragePath(dataDir + "/webdata");
    profile->setHttpCacheType(QWebEngineProfile::DiskHttpCache);

    QMainWindow window;
    window.setWindowTitle("Delightful Qt Web Shell");
    window.resize(900, 640);

    // Center on primary screen
    QScreen* screen = QApplication::primaryScreen();
    QRect geo = screen->availableGeometry();
    window.move((geo.width() - 900) / 2 + geo.x(),
                (geo.height() - 640) / 2 + geo.y());

    // ── Menu bar ──────────────────────────────────────────────
    auto* menuBar = window.menuBar();

    auto* fileMenu = menuBar->addMenu("&File");
    auto* quitAction = fileMenu->addAction("&Quit");
    quitAction->setShortcut(QKeySequence("Ctrl+Q"));
    QObject::connect(quitAction, &QAction::triggered, &app, &QApplication::quit);

    auto* windowsMenu = menuBar->addMenu("&Windows");
    auto* devToolsAction = windowsMenu->addAction("&Developer Tools");
    devToolsAction->setShortcut(QKeySequence("F12"));

    // ── Bridge + WebChannel ───────────────────────────────────
    auto* bridge = new Bridge(&window);

    // ── Web view ──────────────────────────────────────────────
    auto* view = new QWebEngineView(&window);
    auto* page = new QWebEnginePage(profile, view);
    page->setBackgroundColor(QColor(0x24, 0x24, 0x24));
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

    // Register bridge with QWebChannel
    auto* channel = new QWebChannel(page);
    channel->registerObject("bridge", bridge);
    page->setWebChannel(channel);

    // ── Developer Tools ───────────────────────────────────────
    auto* devToolsView = new QWebEngineView();
    devToolsView->setWindowTitle("Developer Tools");
    devToolsView->resize(1024, 600);
    devToolsView->page()->setBackgroundColor(QColor(0x24, 0x24, 0x24));
    view->page()->setDevToolsPage(devToolsView->page());

    QObject::connect(devToolsAction, &QAction::triggered, devToolsView, [devToolsView]() {
        devToolsView->show();
        devToolsView->raise();
        devToolsView->activateWindow();
    });

    // ── Serve embedded web UI ─────────────────────────────────
    auto* handler = new SchemeHandler(profile);
    profile->installUrlSchemeHandler("app", handler);
    view->setUrl(QUrl("app://shell/"));

    // ── Loading overlay ───────────────────────────────────────
    auto* stack = new QWidget(&window);
    stack->setAutoFillBackground(true);
    auto* stackLayout = new QVBoxLayout(stack);
    stackLayout->setContentsMargins(0, 0, 0, 0);
    stackLayout->setSpacing(0);
    stackLayout->addWidget(view);

    auto* overlay = new QWidget(stack);
    overlay->setStyleSheet("background-color: #242424;");
    overlay->setGeometry(stack->rect());

    auto* overlayLayout = new QVBoxLayout(overlay);
    overlayLayout->setAlignment(Qt::AlignCenter);

    auto* label = new QLabel("Loading...", overlay);
    label->setStyleSheet("color: #555; font-size: 14px;");
    label->setAlignment(Qt::AlignCenter);
    overlayLayout->addStretch();
    overlayLayout->addWidget(label);

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

    // Fade out overlay once web content is ready
    QObject::connect(view, &QWebEngineView::loadFinished, overlay, [overlay](bool) {
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

    return app.exec();
}
