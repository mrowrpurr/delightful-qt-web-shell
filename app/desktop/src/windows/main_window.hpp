// MainWindow — the primary application window.
//
// This is thin on purpose. It wires together:
//   - menu bar   (from menus/)
//   - tool bar   (from menus/)
//   - status bar (from widgets/)
//   - Tabified QDockWidgets with WebShellWidgets (main app docks)
//
// Business logic, bridges, and app-level concerns live in app_shell::App.
// Dock lifecycle and persistence live in DockManager.
// Window-level concerns (geometry, zoom, active dock UI) live here.

#pragma once

#include <QMainWindow>
#include <QList>
#include <QUrl>

class DockTabManager;
class QDockWidget;
class QTabBar;
class StatusBar;
class WebShellWidget;
struct MenuActions;

namespace app_shell { class App; }

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    // windowId: if non-empty, restore this window's geometry from settings.
    // Empty = fresh window with default geometry.
    explicit MainWindow(app_shell::App& app, const QString& windowId = {},
                        QWidget* parent = nullptr);

    // Add a dock to this window's UI. Called by DockManager after creating the dock.
    void addDock(QDockWidget* dock);

    // Remove a dock from this window's UI tracking (does not delete it).
    void removeDock(QDockWidget* dock);

    // Docks currently hosted in this window.
    const QList<QDockWidget*>& docks() const { return docks_; }

    // This window's unique ID (used as key in settings).
    QString windowId() const { return objectName(); }

protected:
    void closeEvent(QCloseEvent* event) override;
    void changeEvent(QEvent* event) override;
    bool eventFilter(QObject* obj, QEvent* event) override;

private:
    WebShellWidget* activeTab() const;
    void wireToActiveDock();
    void wireTabBar();

    // Resolve a tab index to its QDockWidget without string matching.
    // Qt stamps tabData() with reinterpret_cast<quintptr>(dock) when it builds
    // the tab bar; we compare against our own live pointers in docks_ rather
    // than dereferencing whatever Qt handed us.
    QDockWidget* dockForTab(QTabBar* tabBar, int index) const;

    app_shell::App& app_;
    QList<QDockWidget*> docks_;
    QDockWidget* activeDock_ = nullptr;
    StatusBar* statusBar_ = nullptr;
    MenuActions* actions_ = nullptr;
    DockTabManager* tabManager_ = nullptr;
    bool closed_ = false;
};
