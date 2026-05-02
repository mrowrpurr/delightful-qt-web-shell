// bridge_channel_adapter.hpp — QObject wrapper for bridge over QWebChannel.
//
// Handles two things:
// 1. Method dispatch: Q_INVOKABLE dispatch(method, args) → bridge → JSON string result
// 2. Signal forwarding: bridge emit_signal → Qt signal → QWebChannel → JS

#pragma once

#include <functional>
#include <vector>

#include <QDebug>
#include <QJsonDocument>
#include <QJsonObject>
#include <QObject>
#include <QString>

#include "json_adapter.hpp"
#include "bridge.hpp"

class BridgeChannelAdapter : public QObject {
    Q_OBJECT
    web_shell::bridge* bridge_;
    std::vector<std::function<void()>> unsubscribers_;

public:
    BridgeChannelAdapter(web_shell::bridge* bridge, QObject* parent = nullptr)
        : QObject(parent), bridge_(bridge)
    {
        auto names = bridge_->signal_names();
        qInfo() << "[BridgeAdapter] ctor" << this
                << "bridge=" << bridge_
                << "wiring" << names.size() << "signals";

        // Subscribe to all bridge signals and re-emit as Qt signals.
        // QWebChannel forwards Qt signals to the JS side automatically.
        // Callbacks post to the event loop via QueuedConnection so emit_signal
        // is safe to call from any thread.
        for (const auto& name : names) {
            unsubscribers_.push_back(
                bridge_->on_signal(name, [this, sig = QString::fromStdString(name)](const nlohmann::json& data) {
                    auto payload = QString::fromStdString(data.is_null() ? "{}" : data.dump());
                    qDebug() << "[BridgeAdapter] forward" << this
                             << "sig=" << sig
                             << "payloadBytes=" << payload.size();
                    QMetaObject::invokeMethod(this, [this, sig, payload]() {
                        emit bridgeSignal(sig, payload);
                    }, Qt::QueuedConnection);
                })
            );
        }
    }

    ~BridgeChannelAdapter() override {
        qInfo() << "[BridgeAdapter] dtor" << this
                << "unsubscribing" << unsubscribers_.size() << "signals";
        // Drop our bridge subscriptions before `this` becomes invalid —
        // otherwise emit_signal will dereference a freed QObject.
        for (auto& unsub : unsubscribers_) unsub();
    }

    Q_INVOKABLE QString dispatch(const QString& method, const QJsonObject& args) {
        qDebug() << "[BridgeAdapter] dispatch" << this
                 << "method=" << method;
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
