// MainWindow — the primary application window.
//
// This is thin on purpose. It wires together:
//   - menu bar   (from menus/)
//   - tool bar   (from menus/)
//   - status bar (from widgets/)
//   - Tabified QDockWidgets with WebShellWidgets (main app docks)
//
// Business logic, bridges, and app-level concerns live in Application.
// Dock lifecycle and persistence live in DockManager.
// Window-level concerns (geometry, zoom, active dock UI) live here.

#pragma once

#include <QMainWindow>
#include <QList>
#include <QUrl>

class QDockWidget;
class StatusBar;
class WebShellWidget;
struct MenuActions;

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);

    // Add a dock to this window's UI. Called by DockManager after creating the dock.
    void addDock(QDockWidget* dock);

    // Remove a dock from this window's UI tracking (does not delete it).
    void removeDock(QDockWidget* dock);

    // Docks currently hosted in this window.
    const QList<QDockWidget*>& docks() const { return docks_; }

protected:
    void closeEvent(QCloseEvent* event) override;
    void changeEvent(QEvent* event) override;
    bool eventFilter(QObject* obj, QEvent* event) override;

private:
    WebShellWidget* activeTab() const;
    void wireToActiveDock();
    void wireTabBar();

    QList<QDockWidget*> docks_;
    QDockWidget* activeDock_ = nullptr;
    StatusBar* statusBar_ = nullptr;
    MenuActions* actions_ = nullptr;
};
