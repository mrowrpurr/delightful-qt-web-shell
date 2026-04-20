#pragma once

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QMetaMethod>
#include <QObject>
#include <QWebSocket>
#include <QWebSocketServer>

#include "json_adapter.hpp"
#include "web_shell.hpp"

// ── SignalForwarder ───────────────────────────────────────────────────
// Bridges a Qt signal to a WebSocket JSON event.
class SignalForwarder : public QObject {
    Q_OBJECT
    QWebSocket* socket_;
    QString     bridge_name_;
    QString     event_name_;
public:
    SignalForwarder(QWebSocket* socket, const QString& bridge, const QString& event, QObject* parent = nullptr)
        : QObject(parent), socket_(socket), bridge_name_(bridge), event_name_(event) {}
public slots:
    void forward() {
        if (!socket_ || !socket_->isValid()) return;
        QJsonObject msg;
        if (!bridge_name_.isEmpty())
            msg["bridge"] = bridge_name_;
        msg["event"] = event_name_;
        socket_->sendTextMessage(
            QString::fromUtf8(QJsonDocument(msg).toJson(QJsonDocument::Compact)));
    }
};

// ── coerce_arg (legacy — for QObject bridges) ────────────────────────
inline QGenericArgument coerce_arg(const QJsonValue& json_val, const QByteArray& param_type, QVariant& storage) {
    if (param_type == "QJsonObject" && json_val.isObject()) {
        storage = QVariant::fromValue(json_val.toObject());
    } else if (param_type == "QJsonArray" && json_val.isArray()) {
        storage = QVariant::fromValue(json_val.toArray());
    } else if (param_type == "int" && json_val.isDouble()) {
        storage = QVariant::fromValue(static_cast<int>(json_val.toDouble()));
    } else {
        QMetaType target_type = QMetaType::fromName(param_type);
        storage = json_val.toVariant();
        if (target_type.isValid() && storage.metaType() != target_type)
            storage.convert(target_type);
    }
    return QGenericArgument(param_type.constData(), storage.constData());
}

// ── invoke_bridge_method (legacy — for QObject bridges) ──────────────
inline QJsonValue invoke_bridge_method(QObject* bridge, const QString& method_name, const QJsonArray& args) {
    const QMetaObject* meta = bridge->metaObject();

    int method_index = -1;
    for (int i = meta->methodOffset(); i < meta->methodCount(); ++i) {
        QMetaMethod m = meta->method(i);
        if (m.name() == method_name.toLatin1() &&
            (m.methodType() == QMetaMethod::Slot || m.methodType() == QMetaMethod::Method)) {
            method_index = i;
            break;
        }
    }
    if (method_index < 0)
        return QJsonObject{{"error", "Unknown method: " + method_name}};

    QMetaMethod method = meta->method(method_index);
    int param_count = method.parameterCount();

    if (param_count > 10)
        return QJsonObject{{"error", method_name + ": too many parameters (max 10)"}};
    if (args.size() < param_count)
        return QJsonObject{{"error", method_name + ": expected " +
            QString::number(param_count) + " args, got " + QString::number(args.size())}};

    QVariant storage[10];
    QGenericArgument ga[10];
    for (int i = 0; i < param_count; ++i)
        ga[i] = coerce_arg(args[i], method.parameterTypeName(i), storage[i]);

    QByteArray returnType = method.typeName();
    bool ok = false;

    if (method.returnType() == QMetaType::Void) {
        ok = method.invoke(bridge, Qt::DirectConnection,
            ga[0], ga[1], ga[2], ga[3], ga[4], ga[5], ga[6], ga[7], ga[8], ga[9]);
        if (!ok) return QJsonObject{{"error", method_name + ": invocation failed"}};
        return QJsonObject{{"ok", true}};
    }

    QMetaType retMeta = QMetaType::fromName(returnType);
    if (!retMeta.isValid())
        return QJsonObject{{"error", method_name + ": unknown return type '" + returnType + "'"}};

    QVariant retStorage(retMeta);
    ok = method.invoke(bridge, Qt::DirectConnection,
        QGenericReturnArgument(returnType.constData(), retStorage.data()),
        ga[0], ga[1], ga[2], ga[3], ga[4], ga[5], ga[6], ga[7], ga[8], ga[9]);
    if (!ok) return QJsonObject{{"error", method_name + ": invocation failed"}};

    QJsonValue json_result = QJsonValue::fromVariant(retStorage);
    if (json_result.isObject()) return json_result;
    if (json_result.isArray()) return json_result;
    return QJsonObject{{"value", json_result}};
}

// ── Legacy QObject meta/signals ──────────────────────────────────────

inline QJsonArray collect_signal_names(const QObject* obj) {
    const QMetaObject* meta = obj->metaObject();
    QJsonArray names;
    for (int i = meta->methodOffset(); i < meta->methodCount(); ++i) {
        QMetaMethod m = meta->method(i);
        if (m.methodType() == QMetaMethod::Signal)
            names.append(QString::fromLatin1(m.name()));
    }
    return names;
}

inline QJsonObject collect_bridge_meta(const QObject* obj) {
    const QMetaObject* meta = obj->metaObject();
    QJsonArray method_list;
    QJsonArray signal_list;

    for (int i = meta->methodOffset(); i < meta->methodCount(); ++i) {
        QMetaMethod m = meta->method(i);
        if (m.methodType() == QMetaMethod::Signal) {
            QJsonObject sig;
            sig["name"] = QString::fromLatin1(m.name());
            sig["paramCount"] = m.parameterCount();
            signal_list.append(sig);
            continue;
        }
        if (m.methodType() != QMetaMethod::Slot && m.methodType() != QMetaMethod::Method)
            continue;
        QJsonObject method;
        method["name"] = QString::fromLatin1(m.name());
        method["returnType"] = QString::fromLatin1(m.typeName());
        method["paramCount"] = m.parameterCount();
        QJsonArray params;
        for (int p = 0; p < m.parameterCount(); ++p) {
            QJsonObject param;
            param["name"] = QString::fromLatin1(m.parameterNames().value(p));
            param["type"] = QString::fromLatin1(m.parameterTypeName(p));
            params.append(param);
        }
        method["params"] = params;
        method_list.append(method);
    }
    return {{"methods", method_list}, {"signals", signal_list}};
}

inline void forward_signals(QObject* source, const QString& bridgeName, QWebSocket* socket) {
    const QMetaObject* meta = source->metaObject();
    const int forwardSlot = SignalForwarder::staticMetaObject.indexOfSlot("forward()");
    for (int i = meta->methodOffset(); i < meta->methodCount(); ++i) {
        QMetaMethod m = meta->method(i);
        if (m.methodType() == QMetaMethod::Signal && m.parameterCount() == 0) {
            auto* fwd = new SignalForwarder(socket, bridgeName, QString::fromLatin1(m.name()), socket);
            QMetaObject::connect(source, i, fwd, forwardSlot);
        }
    }
}

// ── Typed bridge meta ────────────────────────────────────────────────

inline QJsonObject collect_typed_bridge_meta(const web_shell::typed_bridge* bridge) {
    QJsonArray method_list;
    for (const auto& name : bridge->method_names()) {
        QJsonObject m;
        m["name"] = QString::fromStdString(name);
        m["returnType"] = "json";
        m["paramCount"] = 1;
        m["params"] = QJsonArray{QJsonObject{{"name", "args"}, {"type", "json"}}};
        method_list.append(m);
    }
    QJsonArray signal_list;
    for (const auto& name : bridge->signal_names())
        signal_list.append(QString::fromStdString(name));

    return {{"methods", method_list}, {"signals", signal_list}};
}

// ── Forward typed bridge signals over WebSocket ──────────────────────

inline void forward_typed_signals(web_shell::typed_bridge* bridge, const QString& bridgeName, QWebSocket* socket) {
    for (const auto& signal_name : bridge->signal_names()) {
        bridge->on_signal(signal_name, [socket, bridgeName, sig = QString::fromStdString(signal_name)](const nlohmann::json& data) {
            if (!socket || !socket->isValid()) return;
            QJsonObject msg;
            msg["bridge"] = bridgeName;
            msg["event"] = sig;
            if (!data.is_null())
                msg["args"] = web_shell::to_qt_json_value(data);
            socket->sendTextMessage(
                QString::fromUtf8(QJsonDocument(msg).toJson(QJsonDocument::Compact)));
        });
    }
}

// ── expose_as_ws ─────────────────────────────────────────────────────

inline QWebSocketServer* expose_as_ws(WebShell* shell, int port, QObject* parent = nullptr) {
    auto* server = new QWebSocketServer(
        QStringLiteral("BridgeServer"), QWebSocketServer::NonSecureMode, parent);

    if (!server->listen(QHostAddress::LocalHost, port)) {
        qWarning() << "expose_as_ws: failed to listen on port" << port;
        delete server;
        return nullptr;
    }

    QObject::connect(server, &QWebSocketServer::newConnection, server, [shell, server]() {
        auto* socket = server->nextPendingConnection();
        if (!socket) return;

        // ── Method dispatch ──────────────────────────────────────
        QObject::connect(socket, &QWebSocket::textMessageReceived, server,
            [shell, socket](const QString& message) {
                QJsonParseError parseErr;
                QJsonDocument doc = QJsonDocument::fromJson(message.toUtf8(), &parseErr);
                if (parseErr.error != QJsonParseError::NoError) {
                    QJsonObject errResp{{"error", "Invalid JSON: " + parseErr.errorString()}};
                    socket->sendTextMessage(
                        QString::fromUtf8(QJsonDocument(errResp).toJson(QJsonDocument::Compact)));
                    return;
                }
                QJsonObject request = doc.object();
                QString bridgeName = request["bridge"].toString();
                QString method = request["method"].toString();
                QJsonArray args = request["args"].toArray();
                qint64 id = request["id"].toInteger(-1);

                if (method.isEmpty()) {
                    QJsonObject errResp{{"error", "Missing 'method' field"}};
                    if (id >= 0) errResp["id"] = id;
                    socket->sendTextMessage(
                        QString::fromUtf8(QJsonDocument(errResp).toJson(QJsonDocument::Compact)));
                    return;
                }

                QJsonValue result_value;

                if (method == "__meta__") {
                    QJsonObject bridges;
                    // Legacy QObject bridges
                    for (auto it = shell->bridges().begin(); it != shell->bridges().end(); ++it) {
                        auto meta = collect_bridge_meta(it.value());
                        meta["signals"] = collect_signal_names(it.value());
                        bridges[it.key()] = meta;
                    }
                    // Typed bridges
                    for (auto it = shell->typedBridges().begin(); it != shell->typedBridges().end(); ++it)
                        bridges[it.key()] = collect_typed_bridge_meta(it.value());
                    result_value = QJsonObject{{"bridges", bridges}};
                } else {
                    // Check typed bridges first
                    auto* typed = shell->typedBridges().value(bridgeName);
                    if (typed) {
                        // Convert args: the old protocol sends args as a JSON array.
                        // Typed bridges expect a single JSON object (the request DTO).
                        // If args has one element that's an object, use it directly.
                        // If args is a flat array, pass the whole thing.
                        nlohmann::json nlArgs;
                        if (args.size() == 1 && args[0].isObject())
                            nlArgs = web_shell::from_qt_json(args[0].toObject());
                        else if (args.isEmpty())
                            nlArgs = nlohmann::json::object();
                        else
                            nlArgs = web_shell::from_qt_json(args);

                        auto result = typed->dispatch(method.toStdString(), nlArgs);
                        result_value = web_shell::to_qt_json_value(result);
                    } else {
                        // Legacy QObject dispatch
                        QObject* target = bridgeName.isEmpty()
                            ? static_cast<QObject*>(shell)
                            : shell->bridges().value(bridgeName);

                        if (!target)
                            result_value = QJsonObject{{"error", "Unknown bridge: " + bridgeName}};
                        else
                            result_value = invoke_bridge_method(target, method, args);
                    }
                }

                QJsonObject response;
                if (id >= 0) response["id"] = id;
                if (auto obj = result_value.toObject(); obj.contains("error"))
                    response["error"] = obj["error"];
                else
                    response["result"] = result_value;

                socket->sendTextMessage(
                    QString::fromUtf8(QJsonDocument(response).toJson(QJsonDocument::Compact)));
            });

        // ── Forward signals ──────────────────────────────────────
        for (auto it = shell->bridges().begin(); it != shell->bridges().end(); ++it)
            forward_signals(it.value(), it.key(), socket);
        for (auto it = shell->typedBridges().begin(); it != shell->typedBridges().end(); ++it)
            forward_typed_signals(it.value(), it.key(), socket);

        // ── Cleanup ──────────────────────────────────────────────
        QObject::connect(socket, &QWebSocket::disconnected, socket, &QWebSocket::deleteLater);
    });

    qInfo() << "Bridge WebSocket server listening on port" << port;
    return server;
}
