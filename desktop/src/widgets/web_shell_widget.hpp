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
//   auto* widget = new WebShellWidget(profile, shell, devMode, this);
//   setCentralWidget(widget);
//
// The widget handles:
//   - QWebEngineView + page setup
//   - qwebchannel.js injection
//   - QWebChannel registration of shell + bridges
//   - LoadingOverlay (auto-dismissed when React calls signalReady())
//   - Dev mode (Vite HMR) vs production (app:// scheme) URL loading
//   - Developer tools window (F12)

#pragma once

#include <QWidget>

class LoadingOverlay;
class QWebEngineView;
class QWebEngineProfile;
class WebShell;

class WebShellWidget : public QWidget {
    Q_OBJECT

public:
    enum OverlayStyle { FullOverlay, SpinnerOverlay };

    // profile      — shared QWebEngineProfile (owned by Application)
    // shell        — the WebShell that owns all bridges (shared across widgets)
    // devMode      — true = load from Vite dev server, false = embedded resources
    // overlayStyle — Full (logo+progress) for main window, Spinner for dialogs
    // parent       — parent widget (MainWindow, QDialog, etc.)
    WebShellWidget(QWebEngineProfile* profile, WebShell* shell,
                   bool devMode, OverlayStyle overlayStyle = FullOverlay,
                   QWidget* parent = nullptr);

    // Access the underlying view (e.g. for zoom control)
    QWebEngineView* view() const { return view_; }

    // Toggle the developer tools window (F12)
    void toggleDevTools();

protected:
    void dragEnterEvent(QDragEnterEvent* event) override;
    void dropEvent(QDropEvent* event) override;

private:
    QWebEngineView* view_ = nullptr;
    QWebEngineView* devToolsView_ = nullptr;
    LoadingOverlay* overlay_ = nullptr;
    WebShell* shell_ = nullptr;
};
