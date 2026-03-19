// WebShellWidget — embeds a React app in a QWebEngineView with bridges.
//
// This is the heart of the template. Every instance creates its own view and
// channel, but they all share the same bridge QObjects. Signals from C++
// (e.g. dataChanged) automatically reach every connected React view.

#include "web_shell_widget.hpp"
#include "loading_overlay.hpp"

#include <QDragEnterEvent>
#include <QDropEvent>
#include <QFile>
#include <QMimeData>
#include <QVBoxLayout>
#include <QWebChannel>
#include <QWebEnginePage>
#include <QWebEngineProfile>
#include <QWebEngineScript>
#include <QWebEngineScriptCollection>
#include <QWebEngineView>

#include "system_bridge.hpp"
#include "web_shell.hpp"

// Must match --bg in App.css and LoadingOverlay
static constexpr QColor kBackground{0x24, 0x24, 0x24};

WebShellWidget::WebShellWidget(QWebEngineProfile* profile, WebShell* shell,
                               bool devMode, OverlayStyle overlayStyle,
                               QWidget* parent)
    : QWidget(parent), shell_(shell)
{
    setAcceptDrops(true);

    // ── Layout ───────────────────────────────────────────────
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);

    // ── Web view + page ──────────────────────────────────────
    view_ = new QWebEngineView(this);
    auto* page = new QWebEnginePage(profile, view_);
    page->setBackgroundColor(kBackground);
    view_->setPage(page);
    layout->addWidget(view_);

    // ── Inject qwebchannel.js ────────────────────────────────
    // This script runs at document creation so the bridge is available
    // before any React code executes.
    QFile webChannelFile(":/qtwebchannel/qwebchannel.js");
    if (webChannelFile.open(QIODevice::ReadOnly)) {
        QWebEngineScript wcScript;
        wcScript.setName("qwebchannel");
        wcScript.setSourceCode(QString::fromUtf8(webChannelFile.readAll()));
        wcScript.setInjectionPoint(QWebEngineScript::DocumentCreation);
        wcScript.setWorldId(QWebEngineScript::MainWorld);
        page->scripts().insert(wcScript);
    }

    // ── Register shell + bridges on this view's channel ──────
    auto* channel = new QWebChannel(page);
    channel->registerObject("_shell", shell);
    for (auto it = shell->bridges().begin(); it != shell->bridges().end(); ++it)
        channel->registerObject(it.key(), it.value());
    page->setWebChannel(channel);

    // ── Developer tools ──────────────────────────────────────
    // Lazy setup — the devtools page is only connected on first toggle
    // so the main page has time to load first.
    devToolsView_ = new QWebEngineView;
    devToolsView_->setWindowFlags(Qt::Window);
    devToolsView_->setWindowTitle("Developer Tools — " APP_NAME);
    devToolsView_->resize(1024, 600);
    auto* devToolsPage = new QWebEnginePage(profile, devToolsView_);
    devToolsPage->setBackgroundColor(kBackground);
    devToolsView_->setPage(devToolsPage);

    // ── Load content ─────────────────────────────────────────
    // The app:// scheme handler is installed once on the shared profile
    // (in Application), so all WebShellWidgets can use it.
    if (devMode) {
        // Dev mode: Vite dev server with hot module reload.
        // QWebChannel still works because qwebchannel.js is injected above.
        view_->setUrl(QUrl("http://localhost:5173"));
    } else {
        // Production: serve from embedded Qt resources via app:// scheme.
        view_->setUrl(QUrl("app://shell/"));
    }

    // ── Loading overlay ──────────────────────────────────────
    // Covers the view until React calls signalReady().
    auto style = (overlayStyle == FullOverlay)
        ? LoadingOverlay::Full : LoadingOverlay::Spinner;
    overlay_ = new LoadingOverlay(style, this);

    // Dismiss the overlay when the React app signals it's ready
    connect(shell, &WebShell::ready, this, [this]() {
        if (overlay_) {
            overlay_->dismiss();
            overlay_ = nullptr;  // dismiss() calls deleteLater
        }
    });
}

void WebShellWidget::toggleDevTools() {
    if (devToolsView_->isVisible()) {
        devToolsView_->hide();
    } else {
        // Connect inspector on first open (lazy — main page is loaded by now)
        if (!view_->page()->devToolsPage())
            view_->page()->setDevToolsPage(devToolsView_->page());
        devToolsView_->show();
        devToolsView_->raise();
        devToolsView_->activateWindow();
    }
}

void WebShellWidget::dragEnterEvent(QDragEnterEvent* event) {
    // Accept file drops from the OS (Explorer, Finder, etc.)
    if (event->mimeData()->hasUrls())
        event->acceptProposedAction();
}

void WebShellWidget::dropEvent(QDropEvent* event) {
    // Collect dropped file paths and forward to the SystemBridge.
    // React subscribes to the filesDropped signal and calls getDroppedFiles().
    QStringList paths;
    for (const auto& url : event->mimeData()->urls()) {
        if (url.isLocalFile())
            paths.append(url.toLocalFile());
    }
    if (paths.isEmpty()) return;

    // Find the SystemBridge by name — no tight coupling to the class
    auto* bridge = qobject_cast<SystemBridge*>(shell_->bridges().value("system"));
    if (bridge)
        bridge->handleFilesDropped(paths);
}
