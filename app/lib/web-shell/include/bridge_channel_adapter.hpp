// bridge_channel_adapter.hpp — QObject wrapper for typed_bridge over QWebChannel.
//
// QWebChannel requires QObject instances. This adapter wraps a typed_bridge
// with a single Q_INVOKABLE dispatch method that routes calls through the
// typed_bridge dispatch engine.

#pragma once

#include <QJsonDocument>
#include <QJsonValue>
#include <QObject>
#include <QString>
#include <QVariant>

#include "json_adapter.hpp"
#include "typed_bridge.hpp"

class BridgeChannelAdapter : public QObject {
    Q_OBJECT
    web_shell::typed_bridge* bridge_;

public:
    BridgeChannelAdapter(web_shell::typed_bridge* bridge, QObject* parent = nullptr)
        : QObject(parent), bridge_(bridge) {}

    // Returns QJsonValue (not QJsonObject) so arrays pass through correctly.
    // QWebChannel serializes QJsonValue to JS natively.
    Q_INVOKABLE QJsonValue dispatch(const QString& method, const QJsonObject& args) {
        auto result = bridge_->dispatch(
            method.toStdString(),
            web_shell::from_qt_json(args));
        return web_shell::to_qt_json_value(result);
    }
};
