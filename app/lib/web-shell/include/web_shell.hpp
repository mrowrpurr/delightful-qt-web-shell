// WebShell — owns bridge registration and lifecycle.

#pragma once

#include <QJsonObject>
#include <QMap>
#include <QObject>
#include <QString>

#include "bridge.hpp"

class WebShell : public QObject {
    Q_OBJECT
    QMap<QString, web_shell::bridge*> bridges_;

public:
    using QObject::QObject;

    void addBridge(const QString& name, web_shell::bridge* bridge) {
        bridges_[name] = bridge;
    }

    const QMap<QString, web_shell::bridge*>& bridges() const { return bridges_; }

    // Called by the transport layer after React renders its first frame.
    Q_INVOKABLE QJsonObject appReady() {
        emit ready();
        return {};
    }

signals:
    void ready();
};
