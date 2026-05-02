// AppLifecycle — the Qt↔JS ready handshake.
//
// React calls `_shell.appReady()` from the web side after mounting. That call
// lands here as a Q_INVOKABLE, which fires the `ready()` Qt signal. The
// loading overlay subscribes to `ready()` and fades out. If `appReady()`
// never fires (broken bridge, JS crash), the overlay's 15-second timeout
// shows an error.
//
// Registered into QWebChannel as the object name "_shell" (a JS-side
// historical name; rename is its own task in the refactor — Phase 7).

#pragma once

#include <QJsonObject>
#include <QObject>

class AppLifecycle : public QObject {
    Q_OBJECT

public:
    using QObject::QObject;

    Q_INVOKABLE QJsonObject appReady() {
        emit ready();
        return {};
    }

signals:
    void ready();
};
