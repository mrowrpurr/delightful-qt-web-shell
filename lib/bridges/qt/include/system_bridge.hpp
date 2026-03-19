// SystemBridge — desktop capabilities exposed to React.
//
// Clipboard, file drop detection, and other OS-level features that
// web content can't access on its own. This bridge is registered as "system".

#pragma once

#include <QClipboard>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QString>
#include <QStringList>

class SystemBridge : public QObject {
    Q_OBJECT

public:
    using QObject::QObject;

    // ── Clipboard ────────────────────────────────────────────

    // Copy text to the system clipboard.
    Q_INVOKABLE QJsonObject copyToClipboard(const QString& text) {
        QGuiApplication::clipboard()->setText(text);
        return {{"ok", true}};
    }

    // Read current clipboard text.
    Q_INVOKABLE QJsonObject readClipboard() {
        return {{"text", QGuiApplication::clipboard()->text()}};
    }

    // ── File drop ────────────────────────────────────────────

    // Called by WebShellWidget when files are dropped onto the view.
    // Stores the paths and emits the parameterless signal so React can fetch them.
    void handleFilesDropped(const QStringList& paths) {
        droppedFiles_ = paths;
        emit filesDropped();
    }

    // Get the paths from the most recent drop.
    Q_INVOKABLE QJsonArray getDroppedFiles() {
        QJsonArray arr;
        for (const auto& path : droppedFiles_)
            arr.append(path);
        return arr;
    }

signals:
    // Emitted when files are dropped onto the web view.
    // Parameterless so it auto-forwards over WebSocket/QWebChannel.
    // React subscribes, then calls getDroppedFiles() to get the paths.
    void filesDropped();

private:
    QStringList droppedFiles_;
};
