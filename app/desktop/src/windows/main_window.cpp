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
#include "widgets/dock_tab_manager.hpp"
#include "widgets/status_bar.hpp"
#include "widgets/web_shell_widget.hpp"

#include <QCloseEvent>
#include <QContextMenuEvent>
#include <QDockWidget>
#include <QMenu>
#include <QMouseEvent>
#include <QScreen>
#include <QSettings>
#include <QSystemTrayIcon>
#include <QTabBar>
#include <QTimer>
#include <QUuid>
#include <QWebEnginePage>
#include <QWebEngineView>

#include "dialogs/web_dialog.hpp"
#include "system_bridge.hpp"
#include "web_shell.hpp"

MainWindow::MainWindow(const QString& windowId, QWidget* parent)
    : QMainWindow(parent)
{
    // Assign or generate a UUID for this window.
    if (windowId.isEmpty())
        setObjectName(QUuid::createUuid().toString(QUuid::WithoutBraces));
    else
        setObjectName(windowId);

    setWindowTitle(APP_NAME);

    // ── Restore geometry or default to 900×640 centered ──────
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
    QString geoKey = "window/" + objectName() + "/geometry";
    if (settings.contains(geoKey)) {
        restoreGeometry(settings.value(geoKey).toByteArray());
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
    tabManager_ = new DockTabManager(this);

    // ── Docks ─────────────────────────────────────────────────
    auto* app = qobject_cast<Application*>(qApp);
    auto* dm = app->dockManager();

    if (!windowId.isEmpty())
        dm->restoreDocks(this);

    // If no docks were restored (or this is a fresh window), create a default one.
    if (docks_.isEmpty()) {
        auto* dock = dm->createDock({}, this);
        Q_UNUSED(dock);
    }

    activeDock_ = docks_.first();

    // ── Wire window + dock actions ───────────────────────────
    connect(actions_->newWindow, &QAction::triggered, this, []() {
        auto* win = new MainWindow();
        win->show();
    });

    connect(actions_->newTab, &QAction::triggered, this, [this, dm]() {
        auto* dock = dm->createDock({}, this);
        dock->raise();
        dock->setFocus();
    });

    connect(actions_->closeTab, &QAction::triggered, this, [this, dm]() {
        if (activeDock_)
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
        // Don't re-save a window that was already closed.
        if (closed_) return;
        QSettings s(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
        QString key = "window/" + objectName();
        s.setValue(key + "/geometry", saveGeometry());
        s.setValue(key + "/dockState", saveState());
        if (auto* tab = activeTab())
            s.setValue(key + "/zoomFactor", tab->view()->zoomFactor());
    });

    // ── Restore zoom on first dock ───────────────────────────
    if (auto* tab = activeTab()) {
        QString zoomKey = "window/" + objectName() + "/zoomFactor";
        tab->view()->setZoomFactor(settings.value(zoomKey, 1.0).toReal());
    }
}

// ── Dock hosting ─────────────────────────────────────────────

void MainWindow::addDock(QDockWidget* dock) {
    addDockWidget(Qt::TopDockWidgetArea, dock);
    if (!docks_.isEmpty())
        tabifyDockWidget(docks_.first(), dock);

    docks_.append(dock);

    // Event filter for floating dock activation and close detection.
    dock->installEventFilter(this);
    tabManager_->manage(dock);

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
    tabManager_->unmanage(dock);
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
        if (!tabBar->property("dockWired").toBool()) {
            tabBar->setProperty("dockWired", true);
            tabBar->setTabsClosable(true);
            tabBar->installEventFilter(this);
            tabManager_->manageTabBar(tabBar);

            connect(tabBar, &QTabBar::tabCloseRequested, this, [this, tabBar, dm](int index) {
                if (index < 0 || index >= tabBar->count()) return;
                QString title = tabBar->tabText(index);
                for (auto* dock : docks_) {
                    if (dock->windowTitle() == title) {
                        dm->closeDock(dock);
                        break;
                    }
                }
            });

            connect(tabBar, &QTabBar::currentChanged, this, [this, tabBar](int index) {
                if (docks_.isEmpty() || index < 0 || index >= tabBar->count()) return;
                QString title = tabBar->tabText(index);
                for (auto* dock : docks_) {
                    if (dock->windowTitle() == title && activeDock_ != dock) {
                        activeDock_ = dock;
                        wireToActiveDock();
                        break;
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
                if (index >= 0) {
                    QString title = tabBar->tabText(index);
                    for (auto* dock : docks_) {
                        if (dock->windowTitle() == title) {
                            auto* dm = qobject_cast<Application*>(qApp)->dockManager();
                            dm->closeDock(dock);
                            break;
                        }
                    }
                    return true;
                }
            }
        }
    }

    // Right-click context menu on tabified tabs.
    if (event->type() == QEvent::ContextMenu) {
        auto* tabBar = qobject_cast<QTabBar*>(obj);
        if (tabBar) {
            auto* ce = static_cast<QContextMenuEvent*>(event);
            int index = tabBar->tabAt(ce->pos());
            if (index >= 0) {
                auto* dm = qobject_cast<Application*>(qApp)->dockManager();

                // Resolve the right-clicked dock by title.
                QString clickedTitle = tabBar->tabText(index);
                QDockWidget* clickedDock = nullptr;
                for (auto* dock : docks_) {
                    if (dock->windowTitle() == clickedTitle) {
                        clickedDock = dock;
                        break;
                    }
                }
                if (!clickedDock) return QMainWindow::eventFilter(obj, event);

                QMenu menu;
                auto* closeTab = menu.addAction("Close tab");
                auto* closeOthers = menu.addAction("Close other tabs");
                auto* closeRight = menu.addAction("Close to the right");
                auto* closeAll = menu.addAction("Close all");

                // Disabled rules:
                // "Close other tabs" — disabled if this is the only tab.
                closeOthers->setEnabled(tabBar->count() > 1);
                // "Close to the right" — disabled if this is the rightmost tab.
                closeRight->setEnabled(index < tabBar->count() - 1);

                auto* chosen = menu.exec(ce->globalPos());
                if (!chosen) return true;

                if (chosen == closeTab) {
                    dm->closeDock(clickedDock);
                } else if (chosen == closeOthers) {
                    // Collect docks to close — everything except the clicked one.
                    QList<QDockWidget*> toClose;
                    for (int i = 0; i < tabBar->count(); ++i) {
                        if (i == index) continue;
                        QString title = tabBar->tabText(i);
                        for (auto* dock : docks_) {
                            if (dock->windowTitle() == title) {
                                toClose.append(dock);
                                break;
                            }
                        }
                    }
                    for (auto* dock : toClose)
                        dm->closeDock(dock);
                } else if (chosen == closeRight) {
                    // Close tabs to the right of the clicked one.
                    QList<QDockWidget*> toClose;
                    for (int i = index + 1; i < tabBar->count(); ++i) {
                        QString title = tabBar->tabText(i);
                        for (auto* dock : docks_) {
                            if (dock->windowTitle() == title) {
                                toClose.append(dock);
                                break;
                            }
                        }
                    }
                    for (auto* dock : toClose)
                        dm->closeDock(dock);
                } else if (chosen == closeAll) {
                    QList<QDockWidget*> toClose(docks_);
                    for (auto* dock : toClose)
                        dm->closeDock(dock);
                }

                return true;
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

        // Remove this window's state from settings.
        closed_ = true;
        QSettings s(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
        s.remove("window/" + objectName());

        QMainWindow::closeEvent(event);
    }
}
