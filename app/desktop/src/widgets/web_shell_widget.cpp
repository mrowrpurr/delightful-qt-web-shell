// WebShellWidget — embeds a React app in a QWebEngineView with bridges.
//
// This is the heart of the template. Every instance creates its own view and
// channel, but they all share the same bridge QObjects. Signals from C++
// (e.g. dataChanged) automatically reach every connected React view.

#include "web_shell_widget.hpp"
#include "loading_overlay.hpp"

#include <QDebug>
#include <QDragEnterEvent>
#include <QDropEvent>
#include <QElapsedTimer>
#include <QFile>
#include <QMimeData>
#include <QTimer>
#include <memory>
#include <QVBoxLayout>
#include <QWebChannel>
#include <QWebEnginePage>
#include <QWebEngineProfile>
#include <QWebEngineScript>
#include <QWebEngineScriptCollection>
#include <QWebEngineView>

#include "bridge_channel_adapter.hpp"
#include "system_bridge.hpp"
#include "app_lifecycle.hpp"
#include "bridge_registry.hpp"

// Must match --bg in App.css and LoadingOverlay
static constexpr QColor kBackground{0x24, 0x24, 0x24};

// QWebEnginePage subclass that pipes JS console.log into qDebug, so
// anything logged from React lands in the same file as the Qt logs.
class LoggingWebPage : public QWebEnginePage {
public:
    using QWebEnginePage::QWebEnginePage;

protected:
    void javaScriptConsoleMessage(JavaScriptConsoleMessageLevel level,
                                  const QString& msg, int line,
                                  const QString& src) override {
        const QString tail = QString("[JS] %1 (%2:%3)").arg(msg, src, QString::number(line));
        switch (level) {
            case InfoMessageLevel:    qInfo().noquote() << tail; break;
            case WarningMessageLevel: qWarning().noquote() << tail; break;
            case ErrorMessageLevel:   qCritical().noquote() << tail; break;
        }
    }
};

WebShellWidget::WebShellWidget(QWebEngineProfile* profile,
                               web_shell::BridgeRegistry* registry,
                               AppLifecycle* lifecycle,
                               const QUrl& contentUrl,
                               OverlayStyle overlayStyle,
                               QWidget* parent)
    : QWidget(parent), registry_(registry)
{
    // ── Layout ───────────────────────────────────────────────
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);

    // ── Web view + page ──────────────────────────────────────
    view_ = new QWebEngineView(this);
    auto* page = new LoggingWebPage(profile, view_);
    page->setBackgroundColor(kBackground);
    view_->setPage(page);
    layout->addWidget(view_);

    // ── Page-load timing ─────────────────────────────────────
    // Measures the user-visible "page load" cost: from setUrl() to the moment
    // React calls signalReady(). loadFinished gives us the bytes-loaded mark;
    // ready - loadFinished is the JS execution + first paint cost.
    auto loadTimer = std::make_shared<QElapsedTimer>();

    connect(view_, &QWebEngineView::loadStarted, this, [this, loadTimer]() {
        qDebug() << "[load-time]" << this << "loadStarted at"
                 << loadTimer->elapsed() << "ms";
    });
    connect(view_, &QWebEngineView::loadFinished, this, [this, loadTimer](bool ok) {
        qDebug() << "[load-time]" << this << "loadFinished at"
                 << loadTimer->elapsed() << "ms ok=" << ok;
    });
    connect(lifecycle, &AppLifecycle::ready, this, [this, loadTimer]() {
        qDebug() << "[load-time]" << this << "react ready (signalReady) at"
                 << loadTimer->elapsed() << "ms";
    });

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

    // ── Register lifecycle + bridges on this view's channel ──
    auto* channel = new QWebChannel(page);
    channel->registerObject("_shell", lifecycle);
    qInfo() << "[WebShellWidget] creating adapters" << this
            << "bridgeCount=" << registry_->all().size()
            << "url=" << contentUrl.toString();
    for (const auto& [name, bridge_ptr] : registry_->all()) {
        auto qname = QString::fromStdString(name);
        qInfo() << "[WebShellWidget]   bridge=" << qname;
        auto* adapter = new BridgeChannelAdapter(bridge_ptr, channel);
        channel->registerObject(qname, adapter);
    }
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

    // ── Drag & drop ─────────────────────────────────────────
    // QWebEngineView's internal widget (focusProxy) swallows drag events.
    // We install an event filter on it to intercept file drops from the OS.
    // The focusProxy isn't ready until the view is shown, so we defer.
    QTimer::singleShot(0, this, [this]() {
        if (auto* target = view_->focusProxy()) {
            target->setAcceptDrops(true);
            target->installEventFilter(this);
        }
    });

    // ── Load content ─────────────────────────────────────────
    loadTimer->start();
    qDebug() << "[load-time]" << this << "setUrl" << contentUrl.toString();
    view_->setUrl(contentUrl);

    // ── Loading overlay ──────────────────────────────────────
    // Covers the view until React calls signalReady().
    auto style = (overlayStyle == FullOverlay)
        ? LoadingOverlay::Full : LoadingOverlay::Spinner;
    overlay_ = new LoadingOverlay(style, this);

    // Dismiss the overlay when the React app signals it's ready
    connect(lifecycle, &AppLifecycle::ready, this, [this]() {
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

bool WebShellWidget::eventFilter(QObject* obj, QEvent* event) {
    // Intercept drag & drop on QWebEngineView's internal widget.
    // Without this, the web engine swallows the events and they never
    // reach our widget's dragEnterEvent/dropEvent.

    if (event->type() == QEvent::DragEnter) {
        auto* e = static_cast<QDragEnterEvent*>(event);
        if (e->mimeData()->hasUrls()) {
            e->acceptProposedAction();
            return true;
        }
    }

    if (event->type() == QEvent::Drop) {
        auto* e = static_cast<QDropEvent*>(event);
        QStringList paths;
        for (const auto& url : e->mimeData()->urls()) {
            if (url.isLocalFile())
                paths.append(url.toLocalFile());
        }
        if (!paths.isEmpty()) {
            auto* bridge = static_cast<SystemBridge*>(
                registry_->get("system"));
            if (bridge)
                bridge->handleFilesDropped(paths);
        }
        return true;
    }

    return QWidget::eventFilter(obj, event);
}
