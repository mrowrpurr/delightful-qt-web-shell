// MainWindow — wires together menu bar, tool bar, status bar, and dock widgets.
//
// This file should stay short. If you're adding logic here, ask yourself:
//   - App-level concern? → Application
//   - Dock lifecycle/persistence? → DockManager
//   - Menu/toolbar action? → menus/menu_bar.cpp
//   - Reusable widget? → widgets/
//   - Business logic? → lib/

#include "main_window.hpp"
#include "application.hpp"
#include "dock_manager.hpp"
#include "menus/menu_bar.hpp"
#include "widgets/status_bar.hpp"
#include "widgets/web_shell_widget.hpp"

#include <QCloseEvent>
#include <QDockWidget>
#include <QMouseEvent>
#include <QScreen>
#include <QSettings>
#include <QSystemTrayIcon>
#include <QTabBar>
#include <QTimer>
#include <QWebEnginePage>
#include <QWebEngineView>

#include "dialogs/web_dialog.hpp"
#include "system_bridge.hpp"
#include "web_shell.hpp"

MainWindow::MainWindow(bool shouldRestoreDocks, QWidget* parent)
    : QMainWindow(parent)
{
    setWindowTitle(APP_NAME);

    // ── Restore geometry or default to 900×640 centered ──────
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
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
    actions_ = new MenuActions(buildMenuBar(this));
    buildToolBar(this, *actions_);

    // ── Status bar ───────────────────────────────────────────
    statusBar_ = new StatusBar(this);
    setStatusBar(statusBar_);

    // ── Dock-based tab system ────────────────────────────────
    // Hide the central widget — all content lives in docks.
    auto* placeholder = new QWidget(this);
    placeholder->setMaximumSize(0, 0);
    setCentralWidget(placeholder);

    setDockNestingEnabled(true);
    setTabPosition(Qt::TopDockWidgetArea, QTabWidget::North);

    // ── Docks ─────────────────────────────────────────────────
    auto* app = qobject_cast<Application*>(qApp);
    auto* dm = app->dockManager();

    if (shouldRestoreDocks)
        dm->restoreDocks(this);

    // If no docks were restored (or this is a fresh window), create a default one.
    if (docks_.isEmpty()) {
        auto* dock = dm->createDock({}, this);
        Q_UNUSED(dock);
    }

    activeDock_ = docks_.first();

    // ── Wire window + dock actions ───────────────────────────
    connect(actions_->newWindow, &QAction::triggered, this, []() {
        auto* win = new MainWindow(false);
        win->show();
    });

    connect(actions_->newTab, &QAction::triggered, this, [this, dm]() {
        auto* dock = dm->createDock({}, this);
        dock->raise();
        dock->setFocus();
    });

    connect(actions_->closeTab, &QAction::triggered, this, [this, dm]() {
        if (activeDock_ && docks_.size() > 1)
            dm->closeDock(activeDock_);
    });

    // ── Initial zoom/devtools wiring ─────────────────────────
    wireToActiveDock();

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

    // ── Save main window geometry on exit ────────────────────
    // Dock persistence is handled by DockManager. MainWindow only
    // saves its own geometry and zoom level.
    connect(qApp, &QApplication::aboutToQuit, this, [this]() {
        QSettings s(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
        s.setValue("window/geometry", saveGeometry());
        if (auto* tab = activeTab())
            s.setValue("window/zoomFactor", tab->view()->zoomFactor());
    });

    // ── Restore zoom on first dock ───────────────────────────
    if (auto* tab = activeTab())
        tab->view()->setZoomFactor(settings.value("window/zoomFactor", 1.0).toReal());
}

// ── Dock hosting ─────────────────────────────────────────────

void MainWindow::addDock(QDockWidget* dock) {
    addDockWidget(Qt::TopDockWidgetArea, dock);
    if (!docks_.isEmpty())
        tabifyDockWidget(docks_.first(), dock);

    docks_.append(dock);

    // Event filter for floating dock activation and close detection.
    dock->installEventFilter(this);

    // ── Track active dock ────────────────────────────────────
    connect(dock, &QDockWidget::topLevelChanged, this, [this, dock](bool) {
        if (activeDock_ != dock) {
            activeDock_ = dock;
            wireToActiveDock();
        }
    });

    connect(dock, &QDockWidget::visibilityChanged, this, [this, dock](bool visible) {
        if (visible && activeDock_ != dock) {
            activeDock_ = dock;
            wireToActiveDock();
        }
    });

    // ── Reactive dock title from document.title ──────────────
    auto* widget = qobject_cast<WebShellWidget*>(dock->widget());
    if (widget) {
        connect(widget->view()->page(), &QWebEnginePage::titleChanged,
                this, [dock](const QString& title) {
            dock->setWindowTitle(title.isEmpty() ? APP_NAME : title);
        });
    }

    // ── Wire tab bar (deferred — Qt may not have created it yet) ──
    QTimer::singleShot(0, this, [this]() { wireTabBar(); });
}

void MainWindow::removeDock(QDockWidget* dock) {
    docks_.removeOne(dock);

    if (activeDock_ == dock) {
        activeDock_ = docks_.isEmpty() ? nullptr : docks_.last();
        wireToActiveDock();
    }
}

// ── Tab bar wiring ───────────────────────────────────────────

void MainWindow::wireTabBar() {
    auto* dm = qobject_cast<Application*>(qApp)->dockManager();

    for (auto* tabBar : findChildren<QTabBar*>()) {
        if (!tabBar->tabsClosable()) {
            tabBar->setTabsClosable(true);
            tabBar->installEventFilter(this);

            connect(tabBar, &QTabBar::tabCloseRequested, this, [this, dm](int index) {
                if (docks_.isEmpty()) return;
                auto tabified = tabifiedDockWidgets(docks_.first());
                QList<QDockWidget*> allTabbed;
                allTabbed.append(docks_.first());
                allTabbed.append(tabified);

                if (index >= 0 && index < allTabbed.size() && docks_.size() > 1)
                    dm->closeDock(allTabbed[index]);
            });

            connect(tabBar, &QTabBar::currentChanged, this, [this](int index) {
                if (docks_.isEmpty() || index < 0) return;
                auto tabified = tabifiedDockWidgets(docks_.first());
                QList<QDockWidget*> allTabbed;
                allTabbed.append(docks_.first());
                allTabbed.append(tabified);

                if (index < allTabbed.size()) {
                    auto* dock = allTabbed[index];
                    if (activeDock_ != dock) {
                        activeDock_ = dock;
                        wireToActiveDock();
                    }
                }
            });
        }
    }
}

// ── Active dock wiring ───────────────────────────────────────

void MainWindow::wireToActiveDock() {
    auto* tab = activeTab();
    if (!tab) return;
    auto* view = tab->view();

    actions_->zoomIn->disconnect();
    actions_->zoomOut->disconnect();
    actions_->zoomReset->disconnect();
    actions_->devTools->disconnect();

    connect(actions_->zoomIn, &QAction::triggered, view, [view]() {
        view->setZoomFactor(qMin(view->zoomFactor() + 0.1, 5.0));
    });
    connect(actions_->zoomOut, &QAction::triggered, view, [view]() {
        view->setZoomFactor(qMax(view->zoomFactor() - 0.1, 0.25));
    });
    connect(actions_->zoomReset, &QAction::triggered, view, [view]() {
        view->setZoomFactor(1.0);
    });
    connect(actions_->devTools, &QAction::triggered, tab, [tab]() {
        tab->toggleDevTools();
    });

    auto updateZoom = [this, view]() {
        statusBar_->setZoomLevel(qRound(view->zoomFactor() * 100));
    };
    connect(view->page(), &QWebEnginePage::zoomFactorChanged, this, updateZoom);
    updateZoom();
}

WebShellWidget* MainWindow::activeTab() const {
    if (activeDock_)
        return qobject_cast<WebShellWidget*>(activeDock_->widget());
    return nullptr;
}

// ── Event handling ───────────────────────────────────────────

bool MainWindow::eventFilter(QObject* obj, QEvent* event) {
    // Floating dock activation — track which dock the user is interacting with.
    if (event->type() == QEvent::WindowActivate) {
        auto* dock = qobject_cast<QDockWidget*>(obj);
        if (dock && dock->isFloating() && activeDock_ != dock && docks_.contains(dock)) {
            activeDock_ = dock;
            wireToActiveDock();
        }
    }

    // Floating dock close — user clicked X on a floating dock.
    // Skip during shutdown — shutdownAll handles cleanup.
    if (event->type() == QEvent::Close) {
        auto* dm = qobject_cast<Application*>(qApp)->dockManager();
        auto* dock = qobject_cast<QDockWidget*>(obj);
        if (dock && !dm->isQuitting() && dock->isFloating()
            && docks_.contains(dock) && docks_.size() > 1) {
            QTimer::singleShot(0, this, [this, dm, dock]() {
                if (!dm->isQuitting() && docks_.contains(dock) && docks_.size() > 1)
                    dm->closeDock(dock);
            });
        }
    }

    // Middle-click to close a tabified tab.
    if (event->type() == QEvent::MouseButtonRelease) {
        auto* tabBar = qobject_cast<QTabBar*>(obj);
        if (tabBar) {
            auto* me = static_cast<QMouseEvent*>(event);
            if (me->button() == Qt::MiddleButton) {
                int index = tabBar->tabAt(me->pos());
                if (index >= 0 && !docks_.isEmpty() && docks_.size() > 1) {
                    auto tabified = tabifiedDockWidgets(docks_.first());
                    QList<QDockWidget*> allTabbed;
                    allTabbed.append(docks_.first());
                    allTabbed.append(tabified);
                    if (index < allTabbed.size()) {
                        auto* dm = qobject_cast<Application*>(qApp)->dockManager();
                        dm->closeDock(allTabbed[index]);
                    }
                    return true;
                }
            }
        }
    }

    return QMainWindow::eventFilter(obj, event);
}

void MainWindow::changeEvent(QEvent* event) {
    if (event->type() == QEvent::ActivationChange && isActiveWindow()) {
        for (auto* dock : docks_) {
            if (!dock->isFloating() && dock->isVisible() && !dock->visibleRegion().isEmpty()) {
                if (activeDock_ != dock) {
                    activeDock_ = dock;
                    wireToActiveDock();
                }
                break;
            }
        }
    }
    QMainWindow::changeEvent(event);
}

void MainWindow::closeEvent(QCloseEvent* event) {
    // During shutdown, always accept the close — don't hide to tray.
    auto* dm = qobject_cast<Application*>(qApp)->dockManager();
    if (dm->isQuitting()) {
        QMainWindow::closeEvent(event);
        return;
    }

    int visibleCount = 0;
    for (auto* w : QApplication::topLevelWidgets()) {
        if (auto* mw = qobject_cast<MainWindow*>(w))
            if (mw->isVisible()) ++visibleCount;
    }

    if (visibleCount <= 1 && QSystemTrayIcon::isSystemTrayAvailable()) {
        hide();
        event->ignore();
    } else {
        // Close all docks in this window via DockManager so it
        // cleans up its tracking and settings. Take a copy because
        // closeDock() modifies docks_ via removeDock().
        auto docksToClose = docks_;
        for (auto* dock : docksToClose)
            dm->closeDock(dock);

        QMainWindow::closeEvent(event);
    }
}
