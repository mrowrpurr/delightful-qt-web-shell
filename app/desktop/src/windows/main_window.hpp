// MainWindow — the primary application window.
//
// This is thin on purpose. It wires together:
//   - menu bar   (from menus/)
//   - tool bar   (from menus/)
//   - status bar (from widgets/)
//   - Tabified QDockWidgets with WebShellWidgets (main app docks)
//
// Business logic, bridges, and app-level concerns live in Application.
// Window-level concerns (geometry, zoom, docks) live here.

#pragma once

#include <QMainWindow>
#include <QList>

class QDockWidget;
class StatusBar;
class WebShellWidget;
struct MenuActions;

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);

protected:
    // Override close to minimize to system tray instead of quitting.
    // Quit via File > Quit, Ctrl+Q, or the tray icon's Quit action.
    // To disable close-to-tray: remove this override.
    void closeEvent(QCloseEvent* event) override;
    void changeEvent(QEvent* event) override;
    bool eventFilter(QObject* obj, QEvent* event) override;

private:
    QDockWidget* createDock();
    QDockWidget* activeDock() const;
    WebShellWidget* activeTab() const;
    void closeDock(QDockWidget* dock);
    void wireToActiveDock();

    QList<QDockWidget*> docks_;
    QDockWidget* activeDock_ = nullptr;
    StatusBar* statusBar_ = nullptr;
    MenuActions* actions_ = nullptr;  // owned, stored for rewiring on tab switch
};
