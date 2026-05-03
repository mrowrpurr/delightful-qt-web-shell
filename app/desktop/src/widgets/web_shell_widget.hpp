// WebShellWidget — a QWidget that embeds a React app via QWebEngineView.
//
// This is the reusable building block for putting web content anywhere in your
// Qt app: as the main window's central widget, inside a dialog, in a tab, etc.
//
// Each instance gets its own QWebEngineView, QWebChannel, and LoadingOverlay,
// but they all share the same bridge objects (same QObject instances registered
// on each channel). That means one TodoBridge, one source of truth, and signals
// fire to every connected view automatically.
//
// Usage:
//   auto* widget = new WebShellWidget(profile, registry, lifecycle,
//                                     QUrl("app://main/"), this);
//
// The widget handles:
//   - QWebEngineView + page setup
//   - qwebchannel.js injection
//   - QWebChannel registration of lifecycle + bridges (read from registry)
//   - LoadingOverlay (auto-dismissed when React calls signalReady())
//   - Developer tools window (F12)

#pragma once

#include <QUrl>
#include <QWidget>

namespace app_shell { class BridgeRegistry; }
class AppLifecycle;
class LoadingOverlay;
class QWebEngineView;
class QWebEngineProfile;

class WebShellWidget : public QWidget {
    Q_OBJECT

public:
    enum OverlayStyle { FullOverlay, SpinnerOverlay };

    // profile      — shared QWebEngineProfile (owned by Application)
    // registry     — the bridge registry (shared across widgets, owned by Application)
    // lifecycle    — Qt↔JS lifecycle handshake (shared, owned by Application)
    // contentUrl   — what to load (e.g. QUrl("app://main/") or QUrl("http://localhost:5173"))
    // overlayStyle — Full (logo+progress) for main window, Spinner for dialogs
    // parent       — parent widget (MainWindow, QDialog, etc.)
    WebShellWidget(QWebEngineProfile* profile,
                   app_shell::BridgeRegistry* registry,
                   AppLifecycle* lifecycle,
                   const QUrl& contentUrl,
                   OverlayStyle overlayStyle = FullOverlay,
                   QWidget* parent = nullptr);

    // Access the underlying view (e.g. for zoom control)
    QWebEngineView* view() const { return view_; }

    // Toggle the developer tools window (F12)
    void toggleDevTools();

protected:
    bool eventFilter(QObject* obj, QEvent* event) override;

private:
    QWebEngineView* view_ = nullptr;
    QWebEngineView* devToolsView_ = nullptr;
    LoadingOverlay* overlay_ = nullptr;
    app_shell::BridgeRegistry* registry_ = nullptr;
};
