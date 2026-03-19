// MainWindow — wires together menu bar, tool bar, status bar, and central widget.
//
// This file should stay short. If you're adding logic here, ask yourself:
//   - App-level concern? → Application
//   - Menu/toolbar action? → menus/menu_bar.cpp
//   - Reusable widget? → widgets/
//   - Business logic? → lib/

#include "main_window.hpp"
#include "menus/menu_bar.hpp"
#include "widgets/status_bar.hpp"

#include <QLabel>

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
{
    setWindowTitle(APP_NAME);
    resize(900, 640);

    // ── Menu bar + toolbar ───────────────────────────────────
    buildMenuBar(this);
    buildToolBar(this);

    // ── Status bar ───────────────────────────────────────────
    auto* statusBar = new StatusBar(this);
    setStatusBar(statusBar);
    statusBar->flash(QString("Welcome to %1 👋").arg(APP_NAME));

    // ── Central widget ───────────────────────────────────────
    // Placeholder — will become WebShellWidget once we bring back React.
    auto* placeholder = new QLabel("Central widget goes here", this);
    placeholder->setAlignment(Qt::AlignCenter);
    setCentralWidget(placeholder);
}
