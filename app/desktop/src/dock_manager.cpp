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

QDockWidget* DockManager::createDock(const QUrl& contentUrl, MainWindow* host) {
    auto* app = qobject_cast<Application*>(qApp);
    QUrl url = contentUrl.isEmpty() ? app->appUrl("main") : contentUrl;

    auto* widget = new WebShellWidget(
        app->webProfile(), app->shell(), url,
        WebShellWidget::FullOverlay);

    auto* dock = new QDockWidget(APP_NAME);
    QString id = QUuid::createUuid().toString(QUuid::WithoutBraces);
    dock->setObjectName(id);
    dock->setWidget(widget);
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

    // dock/<uuid>/url, dock/<uuid>/floating, etc.
    // Enter the "dock" group, then enumerate UUIDs.
    s.beginGroup("dock");
    QStringList dockIds = s.childGroups();
    s.endGroup();

    if (dockIds.isEmpty()) {
        log("restoreDocks: no saved docks found");
        return;
    }

    log(QString("restoreDocks: found %1 saved docks").arg(dockIds.size()));

    // Collect saved state, then clear old records.
    // createDock() writes fresh records with new UUIDs.
    struct DockState { QUrl url; bool floating; QByteArray geometry; int order; };
    QList<DockState> saved;
    for (const auto& id : dockIds) {
        QString key = "dock/" + id;
        saved.append({
            QUrl(s.value(key + "/url").toString()),
            s.value(key + "/floating", false).toBool(),
            s.value(key + "/geometry").toByteArray(),
            s.value(key + "/order", 999).toInt()
        });
        s.remove("dock/" + id);  // clean up old record
    }

    // Sort by saved order so tabs restore in the right sequence.
    std::sort(saved.begin(), saved.end(),
              [](const DockState& a, const DockState& b) { return a.order < b.order; });

    restoring_ = true;
    for (const auto& state : saved) {
        auto* dock = createDock(state.url, host);

        if (state.floating && !state.geometry.isEmpty()) {
            dock->setFloating(true);
            dock->restoreGeometry(state.geometry);
            log(QString("  restored floating: id=%1 url=%2").arg(dock->objectName(), state.url.toString()));
        } else {
            log(QString("  restored docked: id=%1 url=%2").arg(dock->objectName(), state.url.toString()));
        }
    }
    restoring_ = false;

    // Save the correct state now that all docks are in their final positions.
    for (auto* dock : docks_)
        saveDock(dock);
}

// ── Shutdown ─────────────────────────────────────────────────

void DockManager::shutdownAll() {
    quitting_ = true;
    log(QString("shutdownAll: %1 docks, %2 top-level widgets")
        .arg(docks_.size()).arg(QApplication::topLevelWidgets().size()));

    // Remove each dock from its parent MainWindow's dock system, then delete it.
    // removeDockWidget() cleans up Qt's internal layout bookkeeping.
    // Without it, deleting a dock corrupts the parent's state and crashes.
    // We do this BEFORE closing MainWindows so they don't cascade-delete
    // docks while QWebEngine views are still mid-teardown.
    // Hide all docks so they vanish immediately, then close everything.
    for (auto* dock : docks_) {
        log(QString("  hiding dock %1 floating=%2").arg(dock->objectName()).arg(dock->isFloating()));
        dock->hide();
    }
    docks_.clear();

    // Close all top-level widgets. Process floating docks and other
    // windows before MainWindow — MainWindow must close last because
    // it's the parent and closing it first orphans the children.
    QList<QWidget*> mainWindows;
    const auto widgets = QApplication::topLevelWidgets();
    for (auto* w : widgets) {
        if (qobject_cast<MainWindow*>(w)) {
            mainWindows.append(w);
        } else {
            log(QString("  closing: %1 (%2)")
                .arg(w->objectName(), w->metaObject()->className()));
            w->close();
        }
    }
    for (auto* w : mainWindows) {
        log(QString("  closing MainWindow: %1").arg(w->objectName()));
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

    log(QString("saveDock: %1 floating=%2 order=%3 url=%4")
        .arg(dock->objectName()).arg(floating).arg(order).arg(url));

    s.setValue(key + "/url", url);
    s.setValue(key + "/floating", floating);
    s.setValue(key + "/order", order);
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
    // NOTE: Floating docks stay on top of the parent MainWindow. This is
    // a known Qt6 limitation. setParent(nullptr) fixes z-order but crashes
    // Qt's dock internals. Revisit later — potential patterns exist but
    // require turning docks into non-dockable QWidgets, which we don't want.
    connect(dock, &QDockWidget::topLevelChanged,
            this, [this, dock](bool floating) {
        if (restoring_ || quitting_) return;
        log(QString("topLevelChanged: %1 floating=%2").arg(dock->objectName()).arg(floating));
        saveDock(dock);
    });

    // Geometry committed (drag ended) → save.
    // We use an event filter to catch NonClientAreaMouseButtonRelease,
    // which fires when the user finishes dragging the title bar.
    dock->installEventFilter(this);
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

    // Save geometry after a floating dock is resized.
    if (event->type() == QEvent::Resize) {
        auto* dock = qobject_cast<QDockWidget*>(obj);
        if (dock && dock->isFloating() && docks_.contains(dock)) {
            log(QString("resize: %1 saving geometry").arg(dock->objectName()));
            saveDock(dock);
        }
    }

    return QObject::eventFilter(obj, event);
}
