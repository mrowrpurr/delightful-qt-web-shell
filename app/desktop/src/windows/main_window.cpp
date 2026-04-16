// MainWindow — wires together menu bar, tool bar, status bar, and dock widgets.
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

MainWindow::MainWindow(QWidget* parent)
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
    // Store actions on the heap so we can rewire zoom/devtools when active dock changes.
    actions_ = new MenuActions(buildMenuBar(this));
    buildToolBar(this, *actions_);

    // ── Status bar ───────────────────────────────────────────
    statusBar_ = new StatusBar(this);
    setStatusBar(statusBar_);

    // ── Dock-based tab system ────────────────────────────────
    // Each "tab" is a QDockWidget wrapping a WebShellWidget.
    // Docks are tabified in the top dock area so they look like tabs,
    // but can be torn off into floating windows and re-docked.

    // Hide the central widget — all content lives in docks.
    auto* placeholder = new QWidget(this);
    placeholder->setMaximumSize(0, 0);
    setCentralWidget(placeholder);

    // Dock nesting disabled for now — may try true later for IDE-style splits.
    setDockNestingEnabled(false);

    // Tab bar on top (Qt default for tabified docks is bottom).
    setTabPosition(Qt::TopDockWidgetArea, QTabWidget::North);

    // Create docks — restore previous count and URLs if we have saved state.
    int dockCount = settings.value("window/dockCount", 1).toInt();
    if (dockCount < 1) dockCount = 1;
    QStringList savedUrls = settings.value("window/dockUrls").toStringList();
    for (int i = 0; i < dockCount; ++i) {
        QUrl url = (i < savedUrls.size() && !savedUrls[i].isEmpty())
            ? QUrl(savedUrls[i]) : QUrl();
        createDock(url);
    }
    activeDock_ = docks_.first();

    // Restore dock layout (positions, floating state, tabification order).
    // restoreState() may hide some docks — ensure they're all visible after.
    if (settings.contains("window/state")) {
        restoreState(settings.value("window/state").toByteArray());
        for (auto* dock : docks_)
            dock->setVisible(true);
    }

    auto* app = qobject_cast<Application*>(qApp);

    // ── Wire window + dock actions ───────────────────────────
    connect(actions_->newWindow, &QAction::triggered, this, []() {
        auto* win = new MainWindow();
        win->show();
    });

    connect(actions_->newTab, &QAction::triggered, this, [this]() {
        auto* dock = createDock();
        // Raise the new dock so it's the active tab
        dock->raise();
        dock->setFocus();
    });

    connect(actions_->closeTab, &QAction::triggered, this, [this]() {
        if (activeDock_)
            closeDock(activeDock_);
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

    // ── Save state on exit ───────────────────────────────────
    connect(qApp, &QApplication::aboutToQuit, this, [this]() {
        QSettings s(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
        s.setValue("window/geometry", saveGeometry());
        s.setValue("window/state", saveState());
        s.setValue("window/dockCount", docks_.size());
        if (auto* tab = activeTab())
            s.setValue("window/zoomFactor", tab->view()->zoomFactor());

        // Save each dock's URL so we can restore them to the same page.
        QStringList dockUrls;
        for (auto* dock : docks_) {
            auto* widget = qobject_cast<WebShellWidget*>(dock->widget());
            dockUrls.append(widget ? widget->view()->url().toString() : QString());
        }
        s.setValue("window/dockUrls", dockUrls);
    });

    // ── Restore zoom on first dock ───────────────────────────
    if (auto* tab = activeTab())
        tab->view()->setZoomFactor(settings.value("window/zoomFactor", 1.0).toReal());
}

QDockWidget* MainWindow::createDock(const QUrl& contentUrl) {
    auto* app = qobject_cast<Application*>(qApp);
    QUrl url = contentUrl.isEmpty() ? app->appUrl("main") : contentUrl;
    auto* tab = new WebShellWidget(
        app->webProfile(), app->shell(), url,
        WebShellWidget::FullOverlay, this);

    auto* dock = new QDockWidget(APP_NAME, this);
    dock->setObjectName(QString("dock_%1").arg(docks_.size()));
    dock->setWidget(tab);

    // Allow closing, moving (drag to reorder/tear-off), and floating.
    // DockWidgetMovable is required for the user to initiate a drag — without it,
    // DockWidgetFloatable alone won't let them tear off a tabified dock.
    dock->setFeatures(QDockWidget::DockWidgetClosable | QDockWidget::DockWidgetMovable | QDockWidget::DockWidgetFloatable);

    // All docks go to the top area. If we already have docks, tabify with the first.
    addDockWidget(Qt::TopDockWidgetArea, dock);
    if (!docks_.isEmpty())
        tabifyDockWidget(docks_.first(), dock);

    docks_.append(dock);

    // ── Floating docks shouldn't stay on top ───────────────────
    // By default Qt gives floating docks WindowStaysOnTopHint, which means
    // they obscure the main window. We defer the flag change because Qt may
    // re-apply flags after the topLevelChanged signal fires.
    // Install event filter on the dock to catch window activation (for floating docks).
    // When a floating dock is clicked, QEvent::WindowActivate fires on it — this is
    // the only reliable way to detect focus on a floating dock since no Qt signal fires.
    dock->installEventFilter(this);

    // ── Floating dock z-order ─────────────────────────────────
    // Qt intentionally keeps floating docks above their parent QMainWindow.
    // This is by design — the parent-child relationship enforces it, and
    // setParent(nullptr) crashes because the docking system holds references.
    // TODO: Investigate Qt-Advanced-Docking-System (ADS) or proxy widget
    //       approach if "float behind main window" is required.

    // ── Track active dock + rewire zoom/devtools ─────────────
    // Three signals cover all the ways a dock can become "active":
    //   1. QTabBar::currentChanged — clicking between tabified tabs (wired below)
    //   2. topLevelChanged — dock torn off to floating (or re-docked)
    //   3. visibilityChanged — floating dock focused, or dock shown/hidden
    connect(dock, &QDockWidget::topLevelChanged, this, [this, dock](bool) {
        // When a dock is torn off or re-docked, it's the one the user is interacting with.
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
    // When React sets document.title, update the dock's window title.
    // This shows in both the dock title bar and the tabified tab label.
    connect(tab->view()->page(), &QWebEnginePage::titleChanged,
            this, [dock](const QString& title) {
        dock->setWindowTitle(title.isEmpty() ? APP_NAME : title);
    });

    // ── Wire up the tabified tab bar ───────────────────────────
    // When docks are tabified, Qt creates an internal QTabBar. We need it for:
    //   1. Close buttons on tabs
    //   2. Reliable active-dock tracking when clicking between tabified tabs
    // Deferred because tabifyDockWidget() may not have created the tab bar yet.
    QTimer::singleShot(0, this, [this]() {
        for (auto* tabBar : findChildren<QTabBar*>()) {
            // Enable close buttons and middle-click if not already done
            if (!tabBar->tabsClosable()) {
                tabBar->setTabsClosable(true);
                tabBar->installEventFilter(this);  // for middle-click close
                connect(tabBar, &QTabBar::tabCloseRequested, this, [this](int index) {
                    if (docks_.isEmpty()) return;
                    auto tabified = tabifiedDockWidgets(docks_.first());
                    QList<QDockWidget*> allTabbed;
                    allTabbed.append(docks_.first());
                    allTabbed.append(tabified);

                    if (index >= 0 && index < allTabbed.size())
                        closeDock(allTabbed[index]);
                });

                // Track active dock when the user clicks a tab — more reliable
                // than visibilityChanged for tabified tab switches.
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
    });

    return dock;
}

void MainWindow::wireToActiveDock() {
    auto* tab = activeTab();
    if (!tab) return;
    auto* view = tab->view();

    // Disconnect previous zoom/devtools connections — reconnect to the active dock's view.
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

    // Update status bar zoom for active dock
    auto updateZoom = [this, view]() {
        statusBar_->setZoomLevel(qRound(view->zoomFactor() * 100));
    };
    connect(view->page(), &QWebEnginePage::zoomFactorChanged, this, updateZoom);
    updateZoom();
}

QDockWidget* MainWindow::activeDock() const {
    return activeDock_;
}

WebShellWidget* MainWindow::activeTab() const {
    if (activeDock_)
        return qobject_cast<WebShellWidget*>(activeDock_->widget());
    return nullptr;
}

void MainWindow::closeDock(QDockWidget* dock) {
    if (docks_.size() <= 1) return;  // never close the last dock

    docks_.removeOne(dock);

    // If we're closing the active dock, pick another one and rewire
    if (activeDock_ == dock) {
        activeDock_ = docks_.isEmpty() ? nullptr : docks_.last();
        wireToActiveDock();
    }

    dock->deleteLater();
}

bool MainWindow::eventFilter(QObject* obj, QEvent* event) {
    // ── Floating dock activation ─────────────────────────────
    if (event->type() == QEvent::WindowActivate) {
        auto* dock = qobject_cast<QDockWidget*>(obj);
        if (dock && dock->isFloating() && activeDock_ != dock && docks_.contains(dock)) {
            activeDock_ = dock;
            wireToActiveDock();
        }
    }

    // ── Middle-click to close a tabified tab ─────────────────
    // The QTabBar is a child of QMainWindow's dock area. We install
    // an event filter on it (in wireTabBar) to catch middle-click.
    if (event->type() == QEvent::MouseButtonRelease) {
        auto* tabBar = qobject_cast<QTabBar*>(obj);
        if (tabBar) {
            auto* me = static_cast<QMouseEvent*>(event);
            if (me->button() == Qt::MiddleButton) {
                int index = tabBar->tabAt(me->pos());
                if (index >= 0 && !docks_.isEmpty()) {
                    auto tabified = tabifiedDockWidgets(docks_.first());
                    QList<QDockWidget*> allTabbed;
                    allTabbed.append(docks_.first());
                    allTabbed.append(tabified);
                    if (index < allTabbed.size())
                        closeDock(allTabbed[index]);
                    return true;
                }
            }
        }
    }

    return QMainWindow::eventFilter(obj, event);
}

// When the main window itself is activated (clicked back into from a floating dock),
// find which tabified dock is currently raised and make it the active dock.
void MainWindow::changeEvent(QEvent* event) {
    if (event->type() == QEvent::ActivationChange && isActiveWindow()) {
        // Find the currently visible (raised) dock in the tabified group
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
