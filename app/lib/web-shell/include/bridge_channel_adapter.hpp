// bridge_channel_adapter.hpp — QObject wrapper for typed_bridge over QWebChannel.
//
// Returns JSON as a QString — QWebChannel reliably transports strings.
// The TS side JSON.parse()s the result.

#pragma once

#include <QJsonDocument>
#include <QObject>
#include <QString>

#include "json_adapter.hpp"
#include "typed_bridge.hpp"

class BridgeChannelAdapter : public QObject {
    Q_OBJECT
    web_shell::typed_bridge* bridge_;

public:
    BridgeChannelAdapter(web_shell::typed_bridge* bridge, QObject* parent = nullptr)
        : QObject(parent), bridge_(bridge) {}

    // Returns JSON as a string. QWebChannel reliably handles QString.
    // QJsonValue/QJsonObject return types can silently drop arrays or hang callbacks.
    Q_INVOKABLE QString dispatch(const QString& method, const QJsonObject& args) {
        auto result = bridge_->dispatch(
            method.toStdString(),
            web_shell::from_qt_json(args));
        return QString::fromStdString(result.dump());
    }
};
