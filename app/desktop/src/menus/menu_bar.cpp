// Menu bar + toolbar setup.
//
// All menu structure lives here. MainWindow just calls buildMenuBar() and
// buildToolBar() — it doesn't need to know what's in them.
//
// The toolbar reuses the SAME QAction objects as the menu bar. One action,
// two places — shortcut, tooltip, enabled state, and signal stay in sync.
//
// To add a new menu:
//   auto* myMenu = menuBar->addMenu("&MyMenu");
//   auto* myAction = myMenu->addAction("&Do Thing");
//   myAction->setShortcut(QKeySequence("Ctrl+D"));
//   QObject::connect(myAction, &QAction::triggered, window, [window]() { ... });
//
// To add a toolbar button for an existing menu action:
//   toolBar->addAction(actions.myAction);

#include "menu_bar.hpp"
#include "application.hpp"
#include "dialogs/about_dialog.hpp"
#include "dialogs/demo_widget_dialog.hpp"
#include "dialogs/web_dialog.hpp"
#include "style_manager.hpp"
#include "web_shell.hpp"
#include "system_bridge.hpp"

#include <QAction>
#include <QApplication>
#include <QComboBox>
#include <QCompleter>
#include <QFileDialog>
#include <QIcon>
#include <QKeySequence>
#include <QLabel>
#include <QMainWindow>
#include <QMenuBar>
#include <QMessageBox>
#include <QPainter>
#include <QPixmap>
#include <QToolBar>
#include <QToolButton>

#include <oclero/qlementine/icons/QlementineIcons.hpp>
#include <oclero/qlementine/icons/Icons16.hpp>

using oclero::qlementine::icons::iconPath;
using oclero::qlementine::icons::Icons16;

// Tint an SVG icon to a given color (default: white for dark themes).
// Loads the SVG as a pixmap, paints the color over it using SourceIn
// composition — only existing pixels get recolored, transparency preserved.
static QIcon tintedIcon(Icons16 icon, const QColor& color = Qt::white) {
    QPixmap pix(iconPath(icon));
    QPainter painter(&pix);
    painter.setCompositionMode(QPainter::CompositionMode_SourceIn);
    painter.fillRect(pix.rect(), color);
    painter.end();
    return QIcon(pix);
}

MenuActions buildMenuBar(QMainWindow* window) {
    auto* menuBar = window->menuBar();
    MenuActions out;

    // ── File ─────────────────────────────────────────────────
    auto* fileMenu = menuBar->addMenu("&File");

    // File > Save — emits saveRequested signal to React.
    // If the theme editor is active, React saves the QSS file.
    // Otherwise falls back to a native file picker.
    out.save = fileMenu->addAction(
        tintedIcon(Icons16::Action_Save), "&Save...");
    out.save->setShortcut(QKeySequence("Ctrl+S"));
    out.save->setToolTip("Save file (Ctrl+S)");
    {
        auto* appInstance = qobject_cast<Application*>(qApp);
        auto* sysBridge = appInstance
            ? qobject_cast<SystemBridge*>(appInstance->shell()->bridges().value("system"))
            : nullptr;
        QObject::connect(out.save, &QAction::triggered, window, [window, sysBridge]() {
            if (sysBridge && sysBridge->hasSaveHandler()) {
                // React is listening — let it handle the save
                emit sysBridge->saveRequested();
            } else {
                // No listener — fall back to native file picker
                QString path = QFileDialog::getSaveFileName(
                    window, "Save File", "", "JSON Files (*.json);;All Files (*)");
                if (!path.isEmpty())
                    QMessageBox::information(window, "Save", "You selected file: " + path);
            }
        });
    }

    // File > Open Folder — native folder picker
    out.openFolder = fileMenu->addAction(
        tintedIcon(Icons16::File_FolderOpen), "&Open Folder...");
    out.openFolder->setShortcut(QKeySequence("Ctrl+O"));
    out.openFolder->setToolTip("Open folder (Ctrl+O)");
    QObject::connect(out.openFolder, &QAction::triggered, window, [window]() {
        QString path = QFileDialog::getExistingDirectory(
            window, "Open Folder", "",
            QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
        if (!path.isEmpty())
            QMessageBox::information(window, "Open Folder", "You selected folder: " + path);
    });

    fileMenu->addSeparator();

    // File > New Window — Ctrl+N
    out.newWindow = fileMenu->addAction("New &Window");
    out.newWindow->setShortcut(QKeySequence("Ctrl+N"));


    // File > New Tab — Ctrl+T
    out.newTab = fileMenu->addAction("&New Tab");
    out.newTab->setShortcut(QKeySequence("Ctrl+T"));


    // File > Close Tab — Ctrl+W
    out.closeTab = fileMenu->addAction("&Close Tab");
    out.closeTab->setShortcut(QKeySequence("Ctrl+W"));


    fileMenu->addSeparator();

    auto* quitAction = fileMenu->addAction("&Quit");
    quitAction->setShortcut(QKeySequence("Ctrl+Q"));
    QObject::connect(quitAction, &QAction::triggered,
                     QApplication::instance(), [](){ qobject_cast<Application*>(qApp)->requestQuit(); });

    // ── View ─────────────────────────────────────────────────
    auto* viewMenu = menuBar->addMenu("&View");

    // Zoom In — Ctrl+= and Ctrl+Shift+= (Ctrl++)
    out.zoomIn = viewMenu->addAction(tintedIcon(Icons16::Action_ZoomIn), "Zoom &In");
    out.zoomIn->setShortcuts({QKeySequence::ZoomIn, QKeySequence("Ctrl+=")});


    // Zoom Out — Ctrl+-
    out.zoomOut = viewMenu->addAction(tintedIcon(Icons16::Action_ZoomOut), "Zoom &Out");
    out.zoomOut->setShortcut(QKeySequence::ZoomOut);


    // Reset Zoom — Ctrl+0
    out.zoomReset = viewMenu->addAction(tintedIcon(Icons16::Action_ZoomOriginal), "&Reset Zoom");
    out.zoomReset->setShortcut(QKeySequence("Ctrl+0"));


    // ── Windows ──────────────────────────────────────────────
    auto* windowsMenu = menuBar->addMenu("&Windows");

    out.devTools = windowsMenu->addAction(tintedIcon(Icons16::Navigation_Settings), "&Developer Tools");
    out.devTools->setShortcut(QKeySequence("F12"));


    windowsMenu->addSeparator();

    // React-in-a-dialog — demonstrates WebShellWidget inside a QDialog.
    // Same bridges, same React app, different container.
    auto* webDialogAction = windowsMenu->addAction("&React Dialog...");
    QObject::connect(webDialogAction, &QAction::triggered, window, [window]() {
        WebDialog dlg(window);
        dlg.exec();
    });

    // Demo Widget — gallery of Qt widgets for theme preview.
    auto* demoAction = windowsMenu->addAction("&Demo Widget...");
    QObject::connect(demoAction, &QAction::triggered, window, [window]() {
        auto* demo = new DemoWidgetDialog(nullptr);
        demo->setAttribute(Qt::WA_DeleteOnClose);
        demo->show();
    });

    // ── Tools ─────────────────────────────────────────────────
    auto* toolsMenu = menuBar->addMenu("&Tools");

    // URL protocol register/unregister — shows current state in the label
    auto* protocolAction = toolsMenu->addAction("");
    auto updateProtocolLabel = [protocolAction]() {
        bool registered = Application::isUrlProtocolRegistered();
        QString protocol = Application::urlProtocolName();
        protocolAction->setText(registered
            ? QString("Unregister %1:// Protocol").arg(protocol)
            : QString("Register %1:// Protocol").arg(protocol));
    };
    updateProtocolLabel();

    QObject::connect(protocolAction, &QAction::triggered, window,
                     [window, updateProtocolLabel]() {
        if (Application::isUrlProtocolRegistered()) {
            Application::unregisterUrlProtocol();
        } else {
            Application::registerUrlProtocol();
        }
        updateProtocolLabel();
    });

    // ── Help ─────────────────────────────────────────────────
    auto* helpMenu = menuBar->addMenu("&Help");

    auto* aboutAction = helpMenu->addAction("&About");
    QObject::connect(aboutAction, &QAction::triggered, window, [window]() {
        AboutDialog dlg(window);
        dlg.exec();
    });

    return out;
}

void buildToolBar(QMainWindow* window, const MenuActions& actions) {
    // Main toolbar — reuses QAction objects from the menu bar.
    // Same action = same shortcut, tooltip, enabled state, and signal.
    // No duplicate connections needed — click the toolbar button or the menu
    // item, same thing fires.

    auto* toolBar = window->addToolBar("Main");
    toolBar->setObjectName("MainToolBar");  // QSettings needs a stable name to save state
    toolBar->setMovable(false);             // Docking is a topic for another day

    toolBar->addAction(actions.save);
    toolBar->addAction(actions.openFolder);

    // ── Theme selector ────────────────────────────────────────
    // Searchable dropdown with base theme names (without -dark/-light suffix).
    // Combined with a dark/light toggle button.
    auto* app = qobject_cast<Application*>(qApp);
    if (app && app->styleManager()) {
        toolBar->addSeparator();

        auto* themeLabel = new QLabel(" Theme: ");
        toolBar->addWidget(themeLabel);

        auto* themeCombo = new QComboBox;
        themeCombo->setEditable(true);
        themeCombo->setInsertPolicy(QComboBox::NoInsert);
        themeCombo->setMinimumWidth(250);
        themeCombo->setMaxVisibleItems(20);

        // Populate with base theme names (deduplicated, no -dark/-light)
        QStringList baseThemes = app->styleManager()->availableBaseThemes();
        themeCombo->addItems(baseThemes);

        // Set current base theme
        QString currentBase = app->styleManager()->currentBaseName();
        int idx = baseThemes.indexOf(currentBase);
        if (idx >= 0) themeCombo->setCurrentIndex(idx);

        // Type-to-search via QCompleter
        auto* completer = new QCompleter(baseThemes, themeCombo);
        completer->setCaseSensitivity(Qt::CaseInsensitive);
        completer->setFilterMode(Qt::MatchContains);
        themeCombo->setCompleter(completer);

        // Apply theme when user picks from dropdown or presses Enter.
        // NOT currentTextChanged — that fires on every keystroke and fights typing.
        QObject::connect(themeCombo, &QComboBox::activated,
                         window, [app, themeCombo]() {
            QString baseName = themeCombo->currentText();
            if (!baseName.isEmpty())
                app->styleManager()->applyTheme(baseName, app->styleManager()->isDarkMode());
        });

        toolBar->addWidget(themeCombo);

        // ── Dark/Light toggle ─────────────────────────────────
        auto* darkToggle = new QToolButton;
        darkToggle->setCheckable(true);
        darkToggle->setChecked(app->styleManager()->isDarkMode());
        darkToggle->setText(app->styleManager()->isDarkMode() ? "🌙" : "☀️");
        darkToggle->setToolTip("Toggle dark/light mode");

        QObject::connect(darkToggle, &QToolButton::clicked,
                         window, [app, darkToggle]() {
            app->styleManager()->toggleDarkMode();
            // Update button text after toggle
            darkToggle->setChecked(app->styleManager()->isDarkMode());
            darkToggle->setText(app->styleManager()->isDarkMode() ? "🌙" : "☀️");
        });

        // Keep toggle in sync if theme changes from elsewhere (bridge, etc.)
        QObject::connect(app->styleManager(), &StyleManager::themeChanged,
                         darkToggle, [app, darkToggle, themeCombo]() {
            darkToggle->setChecked(app->styleManager()->isDarkMode());
            darkToggle->setText(app->styleManager()->isDarkMode() ? "🌙" : "☀️");
            // Update combo to match current base name
            QString base = app->styleManager()->currentBaseName();
            if (themeCombo->currentText() != base) {
                // Block signals to avoid re-triggering applyTheme
                themeCombo->blockSignals(true);
                themeCombo->setCurrentText(base);
                themeCombo->blockSignals(false);
            }
        });

        toolBar->addWidget(darkToggle);
    }
}
