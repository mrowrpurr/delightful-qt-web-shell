// DockManager — see dock_manager.hpp for overview.

#include "dock_manager.hpp"
#include "application.hpp"
#include "widgets/web_shell_widget.hpp"
#include "windows/main_window.hpp"

#include <algorithm>

#include <QApplication>
#include <QDateTime>
#include <QDir>
#include <QEvent>
#include <QFile>
#include <QSettings>
#include <QStandardPaths>
#include <QTextStream>
#include <QTimer>
#include <QUuid>
#include <QWebEngineView>

// ── Debug logging ────────────────────────────────────────────
// Writes to <AppData>/<org>/dock-debug.log.
// Intended for development — delete before a test, read after.

void DockManager::log(const QString& msg) {
    static QString logPath;
    if (logPath.isEmpty()) {
        QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
        QDir().mkpath(dir);
        logPath = dir + "/dock-debug.log";
    }
    QFile f(logPath);
    if (f.open(QIODevice::Append | QIODevice::Text)) {
        QTextStream out(&f);
        out << QDateTime::currentDateTime().toString("hh:mm:ss.zzz") << " " << msg << "\n";
    }
}

void DockManager::clearLog() {
    QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QFile::remove(dir + "/dock-debug.log");
}

// ── Construction ─────────────────────────────────────────────

DockManager::DockManager(QObject* parent)
    : QObject(parent)
{
    log("DockManager created");
}

// ── Create ───────────────────────────────────────────────────

QDockWidget* DockManager::createDock(const QUrl& contentUrl, MainWindow* host,
                                     const QString& dockId) {
    auto* app = qobject_cast<Application*>(qApp);
    QUrl url = contentUrl.isEmpty() ? app->appUrl("main") : contentUrl;

    auto* widget = new WebShellWidget(
        app->webProfile(), app->shell(), url,
        WebShellWidget::FullOverlay);

    auto* dock = new QDockWidget(APP_NAME);
    QString id = dockId.isEmpty()
        ? QUuid::createUuid().toString(QUuid::WithoutBraces)
        : dockId;
    dock->setObjectName(id);
    dock->setWidget(widget);
    dock->setAllowedAreas(Qt::AllDockWidgetAreas);
    dock->setFeatures(
        QDockWidget::DockWidgetClosable |
        QDockWidget::DockWidgetMovable |
        QDockWidget::DockWidgetFloatable);

    docks_.append(dock);
    wirePersistence(dock);

    // Add to host MainWindow BEFORE saving — otherwise isFloating()
    // returns true because the dock has no parent yet.
    if (host)
        host->addDock(dock);

    saveDock(dock);

    log(QString("createDock: id=%1 url=%2 host=%3 total=%4")
        .arg(id, url.toString(),
             host ? host->objectName() : "none")
        .arg(docks_.size()));

    emit dockCreated(dock);
    return dock;
}

// ── Close ────────────────────────────────────────────────────

void DockManager::closeDock(QDockWidget* dock) {
    if (!docks_.contains(dock)) return;

    QString id = dock->objectName();
    log(QString("closeDock: id=%1 remaining=%2").arg(id).arg(docks_.size() - 1));

    docks_.removeOne(dock);
    removeDockState(id);

    // Cancel any pending debounced save.
    if (auto* timer = saveTimers_.take(dock)) {
        timer->stop();
        timer->deleteLater();
    }

    // Notify the host MainWindow so it can update its local tracking.
    for (auto* w : QApplication::topLevelWidgets()) {
        if (auto* mw = qobject_cast<MainWindow*>(w)) {
            if (mw->docks().contains(dock)) {
                mw->removeDock(dock);
                break;
            }
        }
    }

    emit dockClosed(dock);
    dock->deleteLater();
}

// ── Restore ──────────────────────────────────────────────────

void DockManager::restoreDocks(MainWindow* host) {
    QSettings s(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);

    // Migration: remove old parallel-list persistence keys.
    s.remove("window/dockCount");
    s.remove("window/dockUrls");
    s.remove("window/dockNames");
    s.remove("window/state");
    // Migration: remove old global window geometry (now per-window).
    s.remove("window/geometry");
    s.remove("window/zoomFactor");

    // dock/<uuid>/url, dock/<uuid>/floating, etc.
    s.beginGroup("dock");
    QStringList dockIds = s.childGroups();
    s.endGroup();

    if (dockIds.isEmpty()) {
        log(QString("restoreDocks: no saved docks for window %1").arg(host->windowId()));
        return;
    }

    // Collect docks that belong to this window (or have no window — migration).
    struct DockState { QString id; QUrl url; bool floating; QByteArray geometry; int order; };
    QList<DockState> saved;
    for (const auto& id : dockIds) {
        QString key = "dock/" + id;
        QString dockWindow = s.value(key + "/window").toString();

        // Only restore docks belonging to this window.
        // Empty window field = legacy data, assign to this window.
        if (!dockWindow.isEmpty() && dockWindow != host->windowId())
            continue;

        saved.append({
            id,
            QUrl(s.value(key + "/url").toString()),
            s.value(key + "/floating", false).toBool(),
            s.value(key + "/geometry").toByteArray(),
            s.value(key + "/order", 999).toInt()
        });
    }

    if (saved.isEmpty()) {
        log(QString("restoreDocks: no docks for window %1").arg(host->windowId()));
        return;
    }

    log(QString("restoreDocks: found %1 docks for window %2")
        .arg(saved.size()).arg(host->windowId()));

    // Sort by saved order so tabs restore in the right sequence.
    std::sort(saved.begin(), saved.end(),
              [](const DockState& a, const DockState& b) { return a.order < b.order; });

    // Phase 1: Create all docks with their original IDs (for restoreState matching).
    restoring_ = true;
    for (const auto& state : saved) {
        createDock(state.url, host, state.id);
        log(QString("  created dock: id=%1 url=%2").arg(state.id, state.url.toString()));
    }

    // Phase 2: Restore the grid layout via QMainWindow::restoreState().
    // This puts docks back into their exact positions — tabified groups,
    // side-by-side splits, splitter ratios — the whole grid.
    QString stateKey = "window/" + host->windowId() + "/dockState";
    QByteArray dockState = s.value(stateKey).toByteArray();
    if (!dockState.isEmpty()) {
        host->restoreState(dockState);
        log(QString("  restored dock layout for window %1").arg(host->windowId()));
    }

    // Phase 3: Restore floating dock geometries (restoreState doesn't handle these).
    for (const auto& state : saved) {
        if (state.floating && !state.geometry.isEmpty()) {
            // Find the dock by its stable ID.
            for (auto* dock : docks_) {
                if (dock->objectName() == state.id) {
                    dock->setFloating(true);
                    dock->restoreGeometry(state.geometry);
                    log(QString("  restored floating: id=%1").arg(state.id));
                    break;
                }
            }
        }
    }
    restoring_ = false;
}

QList<MainWindow*> DockManager::restoreWindows() {
    QSettings s(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);

    // Find all saved window IDs.
    s.beginGroup("window");
    QStringList windowIds = s.childGroups();
    s.endGroup();

    log(QString("restoreWindows: found %1 saved windows").arg(windowIds.size()));

    QList<MainWindow*> windows;
    for (const auto& id : windowIds) {
        auto* win = new MainWindow(id);
        windows.append(win);
        log(QString("  created MainWindow: %1").arg(id));
    }

    return windows;
}

// ── Shutdown ─────────────────────────────────────────────────

void DockManager::shutdownAll() {
    if (quitting_) return;  // idempotent — aboutToQuit may re-enter
    quitting_ = true;
    log(QString("shutdownAll: %1 docks, %2 top-level widgets")
        .arg(docks_.size()).arg(QApplication::topLevelWidgets().size()));

    // Detach each dock from its parent MainWindow, then delete it.
    // removeDockWidget() cleans up Qt's internal dock layout bookkeeping —
    // without it, deleting a dock corrupts the parent and crashes.
    // We take a copy of the list because removeDock() modifies docks_.
    auto docksToClose = docks_;
    for (auto* dock : docksToClose) {
        log(QString("  detaching dock %1 floating=%2").arg(dock->objectName()).arg(dock->isFloating()));

        // Find the host MainWindow and cleanly remove the dock from it.
        for (auto* w : QApplication::topLevelWidgets()) {
            if (auto* mw = qobject_cast<MainWindow*>(w)) {
                if (mw->docks().contains(dock)) {
                    mw->removeDockWidget(dock);
                    mw->removeDock(dock);
                    break;
                }
            }
        }

        dock->hide();
        dock->deleteLater();
    }
    docks_.clear();

    // Process deferred deletes now — the event loop is still alive
    // (requestQuit calls us before quit()).
    QApplication::processEvents();

    // Close all remaining top-level widgets.
    const auto widgets = QApplication::topLevelWidgets();
    for (auto* w : widgets) {
        log(QString("  closing: %1 (%2)")
            .arg(w->objectName(), w->metaObject()->className()));
        w->close();
    }
}

// ── Per-dock persistence ─────────────────────────────────────

void DockManager::saveDock(QDockWidget* dock) {
    auto* widget = qobject_cast<WebShellWidget*>(dock->widget());
    QSettings s(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);

    QString key = "dock/" + dock->objectName();
    QString url = widget ? widget->view()->url().toString() : QString();
    bool floating = dock->isFloating();
    int order = docks_.indexOf(dock);

    // Find the host MainWindow for this dock.
    QString windowId;
    for (auto* w : QApplication::topLevelWidgets()) {
        if (auto* mw = qobject_cast<MainWindow*>(w)) {
            if (mw->docks().contains(dock)) {
                windowId = mw->windowId();
                break;
            }
        }
    }

    log(QString("saveDock: %1 floating=%2 order=%3 window=%4 url=%5")
        .arg(dock->objectName()).arg(floating).arg(order).arg(windowId, url));

    s.setValue(key + "/url", url);
    s.setValue(key + "/floating", floating);
    s.setValue(key + "/order", order);
    s.setValue(key + "/window", windowId);
    if (floating)
        s.setValue(key + "/geometry", dock->saveGeometry());
}

void DockManager::removeDockState(const QString& id) {
    QSettings s(QSettings::IniFormat, QSettings::UserScope, APP_ORG, APP_SLUG);
    s.remove("dock/" + id);
    log(QString("removeDockState: id=%1").arg(id));
}

// ── Wire persistence signals ─────────────────────────────────

void DockManager::wirePersistence(QDockWidget* dock) {
    auto* widget = qobject_cast<WebShellWidget*>(dock->widget());

    // URL changed → save immediately.
    if (widget) {
        connect(widget->view(), &QWebEngineView::urlChanged,
                this, [this, dock](const QUrl& url) {
            if (restoring_ || quitting_) return;
            log(QString("urlChanged: %1 → %2").arg(dock->objectName(), url.toString()));
            saveDock(dock);
        });
    }

    // Dock floated or re-docked → save immediately.
    // NOTE: Floating docks stay on top of the parent MainWindow (Qt6 limitation).
    connect(dock, &QDockWidget::topLevelChanged,
            this, [this, dock](bool floating) {
        if (restoring_ || quitting_) return;
        log(QString("topLevelChanged: %1 floating=%2").arg(dock->objectName()).arg(floating));
        saveDock(dock);
    });

    // Geometry changes (move/resize) → debounced save via event filter.
    dock->installEventFilter(this);
}

void DockManager::debounceSave(QDockWidget* dock) {
    auto*& timer = saveTimers_[dock];
    if (!timer) {
        timer = new QTimer(this);
        timer->setSingleShot(true);
        timer->setInterval(500);
        connect(timer, &QTimer::timeout, this, [this, dock]() {
            if (docks_.contains(dock) && dock->isFloating()) {
                log(QString("debounced save: %1").arg(dock->objectName()));
                saveDock(dock);
            }
            saveTimers_.remove(dock);
            sender()->deleteLater();
        });
    }
    timer->start();  // restart the 500ms window
}

bool DockManager::eventFilter(QObject* obj, QEvent* event) {
    if (restoring_ || quitting_) return QObject::eventFilter(obj, event);

    // Save geometry when the user finishes dragging a floating dock.
    if (event->type() == QEvent::NonClientAreaMouseButtonRelease) {
        auto* dock = qobject_cast<QDockWidget*>(obj);
        if (dock && dock->isFloating() && docks_.contains(dock)) {
            log(QString("dragEnd: %1 saving geometry").arg(dock->objectName()));
            saveDock(dock);
        }
    }

    // Debounce geometry saves for floating dock move/resize.
    if (event->type() == QEvent::Resize || event->type() == QEvent::Move) {
        auto* dock = qobject_cast<QDockWidget*>(obj);
        if (dock && dock->isFloating() && docks_.contains(dock))
            debounceSave(dock);
    }

    return QObject::eventFilter(obj, event);
}
