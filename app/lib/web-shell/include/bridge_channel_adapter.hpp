// bridge_channel_adapter.hpp — QObject wrapper for bridge over QWebChannel.
//
// Handles two things:
// 1. Method dispatch: Q_INVOKABLE dispatch(method, args) → bridge → JSON string result
// 2. Signal forwarding: bridge emit_signal → Qt signal → QWebChannel → JS

#pragma once

#include <QJsonDocument>
#include <QJsonObject>
#include <QObject>
#include <QString>

#include "json_adapter.hpp"
#include "bridge.hpp"

class BridgeChannelAdapter : public QObject {
    Q_OBJECT
    web_shell::bridge* bridge_;

public:
    BridgeChannelAdapter(web_shell::bridge* bridge, QObject* parent = nullptr)
        : QObject(parent), bridge_(bridge)
    {
        // Subscribe to all bridge signals and re-emit as Qt signals.
        // QWebChannel forwards Qt signals to the JS side automatically.
        for (const auto& name : bridge_->signal_names()) {
            bridge_->on_signal(name, [this, sig = QString::fromStdString(name)](const nlohmann::json& data) {
                emit bridgeSignal(sig, QString::fromStdString(data.is_null() ? "{}" : data.dump()));
            });
        }
    }

    Q_INVOKABLE QString dispatch(const QString& method, const QJsonObject& args) {
        auto result = bridge_->dispatch(
            method.toStdString(),
            web_shell::from_qt_json(args));
        return QString::fromStdString(result.dump());
    }

signals:
    // Generic signal that carries the signal name + JSON payload.
    // QWebChannel exposes this as a subscribable signal on the JS side.
    void bridgeSignal(const QString& name, const QString& data);
};
