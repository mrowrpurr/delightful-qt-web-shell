// DockManager — app-level dock lifecycle, persistence, and shutdown.
//
// Owned by app_shell::App. Tracks all docks across all MainWindows.
// Persists each dock individually (URL, floating state, geometry) keyed by UUID.
// Grid layout (tabified groups, splits, splitter ratios) persisted via
// QMainWindow::saveState/restoreState with stable dock UUIDs.
// Saves on every meaningful state change — not just on quit.

#pragma once

#include <QDockWidget>
#include <QEvent>
#include <QHash>
#include <QList>
#include <QObject>
#include <QUrl>

class QTimer;

class MainWindow;

namespace app_shell { class App; }

class DockManager : public QObject {
    Q_OBJECT

public:
    explicit DockManager(app_shell::App& app, QObject* parent = nullptr);

    // Create a new dock and register it. If host is provided, the dock
    // is added to that MainWindow; otherwise it floats independently.
    // If dockId is provided, reuse it as the objectName (for restore).
    QDockWidget* createDock(const QUrl& contentUrl = {}, MainWindow* host = nullptr,
                            const QString& dockId = {});

    // Close and unregister a dock. Persists the removal immediately.
    void closeDock(QDockWidget* dock);

    // Restore docks for a specific window from QSettings.
    void restoreDocks(MainWindow* host);

    // Restore all saved windows and their docks. Returns the list of
    // created MainWindows. If no windows were saved, returns empty.
    QList<MainWindow*> restoreWindows();

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

    // Schedule a debounced geometry save for a dock.
    void debounceSave(QDockWidget* dock);

    // Debug log helper.
    static void log(const QString& msg);

    app_shell::App& app_;
    QList<QDockWidget*> docks_;
    QHash<QDockWidget*, QTimer*> saveTimers_;  // debounce timers per dock
    bool quitting_ = false;
    bool restoring_ = false;  // suppress persistence during restore
};
