// MainWindow — the primary application window.
//
// This is thin on purpose. It wires together:
//   - menu bar   (from menus/)
//   - tool bar   (from menus/)
//   - status bar (from widgets/)
//   - central widget (will be WebShellWidget eventually)
//
// Business logic, bridges, and app-level concerns live in Application.
// Window-level concerns (geometry, zoom) live here.

#pragma once

#include <QMainWindow>

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);
};
