// WebShell — owns bridge registration and lifecycle.
// Supports both legacy QObject bridges and new typed_bridge instances.

#pragma once

#include <QJsonObject>
#include <QMap>
#include <QObject>
#include <QString>

#include "typed_bridge.hpp"

class WebShell : public QObject {
    Q_OBJECT
    QMap<QString, QObject*>               qobject_bridges_;
    QMap<QString, web_shell::typed_bridge*> typed_bridges_;

public:
    using QObject::QObject;

    // Legacy QObject bridge (SystemBridge, etc.)
    void addBridge(const QString& name, QObject* bridge) {
        bridge->setParent(this);
        qobject_bridges_[name] = bridge;
    }

    // New typed bridge (TodoBridge, etc.)
    void addBridge(const QString& name, web_shell::typed_bridge* bridge) {
        typed_bridges_[name] = bridge;
    }

    const QMap<QString, QObject*>& bridges() const { return qobject_bridges_; }
    const QMap<QString, web_shell::typed_bridge*>& typedBridges() const { return typed_bridges_; }

    // Called by the transport layer after React renders its first frame.
    Q_INVOKABLE QJsonObject appReady() {
        emit ready();
        return {};
    }

signals:
    void ready();
};
