// DockManager — app-level dock lifecycle, persistence, and shutdown.
//
// Owned by Application. Tracks all docks across all MainWindows.
// Persists each dock individually (URL, floating state, geometry) keyed by UUID.
// Saves on every meaningful state change — not just on quit.
//
// Does NOT handle (yet):
//   - Tabification groups (which docks are tabbed together)
//   - Dock area positions (compass direction)
//   - Multi-MainWindow dock assignment

#pragma once

#include <QDockWidget>
#include <QEvent>
#include <QList>
#include <QObject>
#include <QUrl>

class MainWindow;

class DockManager : public QObject {
    Q_OBJECT

public:
    explicit DockManager(QObject* parent = nullptr);

    // Create a new dock and register it. If host is provided, the dock
    // is added to that MainWindow; otherwise it floats independently.
    QDockWidget* createDock(const QUrl& contentUrl = {}, MainWindow* host = nullptr);

    // Close and unregister a dock. Persists the removal immediately.
    void closeDock(QDockWidget* dock);

    // Restore docks from QSettings. Called once during startup.
    void restoreDocks(MainWindow* host);

    // Close all top-level windows. Called from aboutToQuit.
    void shutdownAll();

    // All tracked docks.
    const QList<QDockWidget*>& docks() const { return docks_; }

    // True during shutdown — skip close-to-tray, skip dock-close detection.
    bool isQuitting() const { return quitting_; }

    // Delete the dock debug log (call before a test run).
    static void clearLog();

protected:
    bool eventFilter(QObject* obj, QEvent* event) override;

signals:
    void dockCreated(QDockWidget* dock);
    void dockClosed(QDockWidget* dock);

private:
    // Persist a single dock's state to QSettings.
    void saveDock(QDockWidget* dock);

    // Remove a single dock's state from QSettings.
    void removeDockState(const QString& id);

    // Wire signals on a dock so state changes trigger persistence.
    void wirePersistence(QDockWidget* dock);

    // Debug log helper.
    static void log(const QString& msg);

    QList<QDockWidget*> docks_;
    bool quitting_ = false;
    bool restoring_ = false;  // suppress persistence during restore
};
