// Menu bar + toolbar setup.
//
// All menu structure lives here. MainWindow just calls buildMenuBar() and
// buildToolBar() — it doesn't need to know what's in them.
//
// To add a new menu:
//   auto* myMenu = menuBar->addMenu("&MyMenu");
//   auto* myAction = myMenu->addAction("&Do Thing");
//   myAction->setShortcut(QKeySequence("Ctrl+D"));
//   QObject::connect(myAction, &QAction::triggered, window, [window]() { ... });
//
// To add a toolbar button for an existing action:
//   toolBar->addAction(myAction);

#include "menu_bar.hpp"

#include <QAction>
#include <QApplication>
#include <QFileDialog>
#include <QKeySequence>
#include <QMainWindow>
#include <QMenuBar>
#include <QMessageBox>
#include <QStyle>
#include <QToolBar>

void buildMenuBar(QMainWindow* window) {
    auto* menuBar = window->menuBar();

    // ── File ─────────────────────────────────────────────────
    auto* fileMenu = menuBar->addMenu("&File");

    // File > Save — native file picker (testable with pywinauto)
    auto* saveAction = fileMenu->addAction("&Save...");
    saveAction->setShortcut(QKeySequence("Ctrl+S"));
    QObject::connect(saveAction, &QAction::triggered, window, [window]() {
        QFileDialog::getSaveFileName(
            window, "Save File", "", "JSON Files (*.json);;All Files (*)");
    });

    // File > Open Folder — native folder picker
    auto* openFolderAction = fileMenu->addAction("&Open Folder...");
    openFolderAction->setShortcut(QKeySequence("Ctrl+O"));
    QObject::connect(openFolderAction, &QAction::triggered, window, [window]() {
        QFileDialog::getExistingDirectory(
            window, "Open Folder", "",
            QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
    });

    fileMenu->addSeparator();

    auto* quitAction = fileMenu->addAction("&Quit");
    quitAction->setShortcut(QKeySequence("Ctrl+Q"));
    QObject::connect(quitAction, &QAction::triggered,
                     QApplication::instance(), &QApplication::quit);

    // ── View ─────────────────────────────────────────────────
    auto* viewMenu = menuBar->addMenu("&View");

    // Zoom In — Ctrl+= and Ctrl+Shift+= (Ctrl++)
    auto* zoomInAction = viewMenu->addAction("Zoom &In");
    zoomInAction->setShortcuts({QKeySequence::ZoomIn, QKeySequence("Ctrl+=")});
    zoomInAction->setShortcutContext(Qt::ApplicationShortcut);

    // Zoom Out — Ctrl+-
    auto* zoomOutAction = viewMenu->addAction("Zoom &Out");
    zoomOutAction->setShortcut(QKeySequence::ZoomOut);
    zoomOutAction->setShortcutContext(Qt::ApplicationShortcut);

    // Reset Zoom — Ctrl+0
    auto* zoomResetAction = viewMenu->addAction("&Reset Zoom");
    zoomResetAction->setShortcut(QKeySequence("Ctrl+0"));
    zoomResetAction->setShortcutContext(Qt::ApplicationShortcut);

    // ── Windows ──────────────────────────────────────────────
    auto* windowsMenu = menuBar->addMenu("&Windows");

    auto* devToolsAction = windowsMenu->addAction("&Developer Tools");
    devToolsAction->setShortcut(QKeySequence("F12"));
    devToolsAction->setShortcutContext(Qt::ApplicationShortcut);

    // ── Help ─────────────────────────────────────────────────
    auto* helpMenu = menuBar->addMenu("&Help");

    auto* aboutAction = helpMenu->addAction("&About");
    QObject::connect(aboutAction, &QAction::triggered, window, [window]() {
        QMessageBox::about(
            window, "About " APP_NAME,
            QString("%1 v%2\n\nA template for Qt + React apps with real testing.")
                .arg(APP_NAME)
                .arg(APP_VERSION));
    });
}

void buildToolBar(QMainWindow* window) {
    // Main toolbar — common actions as icon buttons.
    //
    // Using standard pixmap icons so the template works out of the box.
    // Replace with custom icons (QIcon(":/icons/save.png")) for your app.
    //
    // Tip: toolbar actions are often the same QAction objects from the menu bar.
    // That way the shortcut, tooltip, and enabled state stay in sync automatically.
    // For now we create separate actions to keep menus/ self-contained.

    auto* toolBar = window->addToolBar("Main");
    toolBar->setObjectName("MainToolBar");  // QSettings needs a stable name to save state
    toolBar->setMovable(false);             // Docking is a topic for another day

    auto* saveButton = toolBar->addAction(
        window->style()->standardIcon(QStyle::SP_DialogSaveButton), "Save");
    saveButton->setToolTip("Save file (Ctrl+S)");
    QObject::connect(saveButton, &QAction::triggered, window, [window]() {
        QFileDialog::getSaveFileName(
            window, "Save File", "", "JSON Files (*.json);;All Files (*)");
    });

    auto* openButton = toolBar->addAction(
        window->style()->standardIcon(QStyle::SP_DirOpenIcon), "Open Folder");
    openButton->setToolTip("Open folder (Ctrl+O)");
    QObject::connect(openButton, &QAction::triggered, window, [window]() {
        QFileDialog::getExistingDirectory(
            window, "Open Folder", "",
            QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
    });
}
