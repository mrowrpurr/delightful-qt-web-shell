// MainWindow — wires together menu bar, tool bar, status bar, and central widget.
//
// This file should stay short. If you're adding logic here, ask yourself:
//   - App-level concern? → Application
//   - Menu/toolbar action? → menus/menu_bar.cpp
//   - Reusable widget? → widgets/
//   - Business logic? → lib/

#include "main_window.hpp"
#include "application.hpp"
#include "menus/menu_bar.hpp"
#include "widgets/status_bar.hpp"
#include "widgets/web_shell_widget.hpp"

#include <QCloseEvent>
#include <QMouseEvent>
#include <QScreen>
#include <QSettings>
#include <QSplitter>
#include <QSystemTrayIcon>
#include <QTabBar>
#include <QTabWidget>
#include <QTimer>
#include <QWebEnginePage>
#include <QWebEngineView>

#include "dialogs/web_dialog.hpp"
#include "system_bridge.hpp"
#include "web_shell.hpp"

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
{
    setWindowTitle(APP_NAME);

    // ── Restore geometry or default to 900×640 centered ──────
    QSettings settings(APP_ORG, APP_SLUG);
    if (settings.contains("window/geometry")) {
        restoreGeometry(settings.value("window/geometry").toByteArray());
    } else {
        resize(900, 640);
        if (auto* screen = QApplication::primaryScreen()) {
            QRect geo = screen->availableGeometry();
            move((geo.width() - 900) / 2 + geo.x(),
                 (geo.height() - 640) / 2 + geo.y());
        }
    }

    // ── Menu bar + toolbar ───────────────────────────────────
    auto actions = buildMenuBar(this);
    buildToolBar(this, actions);

    // ── Status bar ───────────────────────────────────────────
    statusBar_ = new StatusBar(this);
    setStatusBar(statusBar_);

    // ── Central widget — QSplitter with tabs + docs ──────────
    auto* app = qobject_cast<Application*>(qApp);

    auto* splitter = new QSplitter(Qt::Horizontal, this);
    splitter->setChildrenCollapsible(true);

    // ── Tab widget for main app tabs ─────────────────────────
    // Starts with one tab, tab bar hidden. Ctrl+T adds tabs.
    tabs_ = new QTabWidget(splitter);
    tabs_->setTabsClosable(true);
    tabs_->setMovable(true);
    tabs_->tabBar()->setVisible(false);  // hidden until 2+ tabs

    // Close tab via X button, middle-click, or Ctrl+W
    connect(tabs_, &QTabWidget::tabCloseRequested, this, &MainWindow::closeTabAt);
    tabs_->tabBar()->installEventFilter(this);  // for middle-click

    // Create the first tab
    createTab();

    // ── Docs app (right panel) ───────────────────────────────
    docsApp_ = new WebShellWidget(
        app->webProfile(), app->shell(), app->appUrl("docs"),
        WebShellWidget::SpinnerOverlay, splitter);

    // Give the main app 2/3 of the space, docs 1/3
    splitter->setSizes({600, 300});
    setCentralWidget(splitter);

    // ── Wire window + tab actions ───────────────────────────────
    connect(actions.newWindow, &QAction::triggered, this, []() {
        auto* win = new MainWindow();
        win->show();
    });

    connect(actions.newTab, &QAction::triggered, this, [this]() {
        createTab();
        tabs_->setCurrentIndex(tabs_->count() - 1);
    });

    connect(actions.closeTab, &QAction::triggered, this, [this]() {
        closeTabAt(tabs_->currentIndex());
    });

    // ── Wire zoom + devtools to active tab ────────────────────
    wireZoomToCurrentTab(actions);

    // Re-wire when the active tab changes
    connect(tabs_, &QTabWidget::currentChanged, this, [this, actions](int) {
        wireZoomToCurrentTab(actions);
    });

    // ── Wire React → native dialog ──────────────────────────
    auto* systemBridge = qobject_cast<SystemBridge*>(
        app->shell()->bridges().value("system"));
    if (systemBridge) {
        connect(systemBridge, &SystemBridge::openDialogRequested, this, [this]() {
            QTimer::singleShot(0, this, [this]() {
                WebDialog dlg(this);
                dlg.exec();
            });
        });
    }

    // ── Save state on exit ───────────────────────────────────
    connect(qApp, &QApplication::aboutToQuit, this, [this]() {
        QSettings s(APP_ORG, APP_SLUG);
        s.setValue("window/geometry", saveGeometry());
        if (auto* tab = currentTab())
            s.setValue("window/zoomFactor", tab->view()->zoomFactor());
    });

    // ── Restore zoom on first tab ────────────────────────────
    if (auto* tab = currentTab())
        tab->view()->setZoomFactor(settings.value("window/zoomFactor", 1.0).toReal());
}

WebShellWidget* MainWindow::createTab() {
    auto* app = qobject_cast<Application*>(qApp);
    auto* tab = new WebShellWidget(
        app->webProfile(), app->shell(), app->appUrl("main"),
        WebShellWidget::FullOverlay, tabs_);

    int index = tabs_->addTab(tab, APP_NAME);

    // Update tab title when React changes document.title
    connect(tab->view()->page(), &QWebEnginePage::titleChanged,
            this, [this, tab](const QString& title) {
        int i = tabs_->indexOf(tab);
        if (i >= 0)
            tabs_->setTabText(i, title.isEmpty() ? APP_NAME : title);
    });

    tabs_->tabBar()->setVisible(tabs_->count() > 1);
    return tab;
}

WebShellWidget* MainWindow::currentTab() const {
    return qobject_cast<WebShellWidget*>(tabs_->currentWidget());
}

void MainWindow::wireZoomToCurrentTab(const MenuActions& actions) {
    auto* tab = currentTab();
    if (!tab) return;
    auto* view = tab->view();

    // Disconnect previous connections — reconnect to the current tab's view.
    // Using lambda + unique context object per connection would be cleaner,
    // but for a template, explicit disconnect/reconnect is easier to follow.
    actions.zoomIn->disconnect();
    actions.zoomOut->disconnect();
    actions.zoomReset->disconnect();
    actions.devTools->disconnect();

    connect(actions.zoomIn, &QAction::triggered, view, [view]() {
        view->setZoomFactor(qMin(view->zoomFactor() + 0.1, 5.0));
    });
    connect(actions.zoomOut, &QAction::triggered, view, [view]() {
        view->setZoomFactor(qMax(view->zoomFactor() - 0.1, 0.25));
    });
    connect(actions.zoomReset, &QAction::triggered, view, [view]() {
        view->setZoomFactor(1.0);
    });
    connect(actions.devTools, &QAction::triggered, tab, [tab]() {
        tab->toggleDevTools();
    });

    // Update status bar zoom for active tab
    auto updateZoom = [this, view]() {
        statusBar_->setZoomLevel(qRound(view->zoomFactor() * 100));
    };
    connect(view->page(), &QWebEnginePage::zoomFactorChanged, this, updateZoom);
    updateZoom();
}

void MainWindow::closeTabAt(int index) {
    if (tabs_->count() <= 1) return;  // never close the last tab
    auto* widget = tabs_->widget(index);
    tabs_->removeTab(index);
    widget->deleteLater();
    tabs_->tabBar()->setVisible(tabs_->count() > 1);
}

bool MainWindow::eventFilter(QObject* obj, QEvent* event) {
    // Middle-click on a tab to close it — standard browser/IDE convention.
    if (obj == tabs_->tabBar() && event->type() == QEvent::MouseButtonRelease) {
        auto* me = static_cast<QMouseEvent*>(event);
        if (me->button() == Qt::MiddleButton) {
            int index = tabs_->tabBar()->tabAt(me->pos());
            if (index >= 0) {
                closeTabAt(index);
                return true;
            }
        }
    }
    return QMainWindow::eventFilter(obj, event);
}

void MainWindow::closeEvent(QCloseEvent* event) {
    // Count visible MainWindows. If this is the last one, minimize to tray
    // instead of quitting. Secondary windows just close normally.
    //
    // To disable close-to-tray: remove this override. The default behavior
    // will close the window and quit the app (since it's the last window).
    int visibleCount = 0;
    for (auto* w : QApplication::topLevelWidgets()) {
        if (auto* mw = qobject_cast<MainWindow*>(w))
            if (mw->isVisible()) ++visibleCount;
    }

    if (visibleCount <= 1 && QSystemTrayIcon::isSystemTrayAvailable()) {
        hide();
        event->ignore();  // don't close — just hide to tray
    } else {
        // Not the last window — just close normally.
        // Qt won't quit the app because other windows are still visible.
        QMainWindow::closeEvent(event);
    }
}
