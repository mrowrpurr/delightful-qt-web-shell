// expose_as_ws.hpp — WebSocket JSON-RPC server for bridges.
//
// Protocol:
//   → {"bridge": "todos", "method": "addList", "args": {"name": "Groceries"}, "id": 1}
//   ← {"id": 1, "result": {"id": "1", "name": "Groceries", ...}}
//
//   → {"method": "appReady", "args": [], "id": 2}
//   ← {"id": 2, "result": {}}
//
//   ← {"bridge": "todos", "event": "dataChanged", "args": {...}}
//
//   → {"method": "__meta__", "args": [], "id": 0}
//   ← {"id": 0, "result": {"bridges": {...}}}

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
#include "bridge_registry.hpp"
#include "app_lifecycle.hpp"

// ── appReady dispatch — calls into AppLifecycle ──

inline QJsonValue invoke_lifecycle_method(AppLifecycle* lifecycle, const QString& method_name) {
    if (method_name == "appReady") {
        QMetaObject::invokeMethod(lifecycle, "appReady", Qt::DirectConnection);
        return QJsonObject{{"ok", true}};
    }
    return QJsonObject{{"error", "Unknown lifecycle method: " + method_name}};
}

// ── Bridge meta ────────────────────────────────────────────────

inline QJsonObject collect_bridge_meta(const web_shell::bridge* bridge) {
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

// ── Forward bridge signals over WebSocket ──────────────────────

inline void forward_signals(web_shell::bridge* bridge, const QString& bridgeName, QWebSocket* socket) {
    for (const auto& signal_name : bridge->signal_names()) {
        bridge->on_signal(signal_name, [socket, bridgeName, sig = QString::fromStdString(signal_name)](const nlohmann::json& data) {
            QJsonObject msg;
            msg["bridge"] = bridgeName;
            msg["event"] = sig;
            if (!data.is_null())
                msg["args"] = web_shell::to_qt_json_value(data);
            auto text = QString::fromUtf8(QJsonDocument(msg).toJson(QJsonDocument::Compact));
            QMetaObject::invokeMethod(socket, [socket, text]() {
                if (socket->isValid())
                    socket->sendTextMessage(text);
            }, Qt::QueuedConnection);
        });
    }
}

// ── expose_as_ws ─────────────────────────────────────────────────────

inline QWebSocketServer* expose_as_ws(web_shell::BridgeRegistry* registry,
                                      AppLifecycle* lifecycle,
                                      int port,
                                      QObject* parent = nullptr) {
    auto* server = new QWebSocketServer(
        QStringLiteral("BridgeServer"), QWebSocketServer::NonSecureMode, parent);

    if (!server->listen(QHostAddress::LocalHost, port)) {
        qWarning() << "expose_as_ws: failed to listen on port" << port;
        delete server;
        return nullptr;
    }

    QObject::connect(server, &QWebSocketServer::newConnection, server, [registry, lifecycle, server]() {
        auto* socket = server->nextPendingConnection();
        if (!socket) return;

        // ── Method dispatch ──────────────────────────────────────
        QObject::connect(socket, &QWebSocket::textMessageReceived, server,
            [registry, lifecycle, socket](const QString& message) {
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
                    for (const auto& [name, bridge_ptr] : registry->all())
                        bridges[QString::fromStdString(name)] = collect_bridge_meta(bridge_ptr);
                    result_value = QJsonObject{{"bridges", bridges}};
                } else if (bridgeName.isEmpty()) {
                    // Lifecycle method (appReady)
                    result_value = invoke_lifecycle_method(lifecycle, method);
                } else {
                    auto* bridge = registry->get(bridgeName.toStdString());
                    if (!bridge) {
                        result_value = QJsonObject{{"error", "Unknown bridge: " + bridgeName}};
                    } else {
                        // Convert args for typed bridge dispatch
                        nlohmann::json nlArgs;
                        if (args.size() == 1 && args[0].isObject())
                            nlArgs = web_shell::from_qt_json(args[0].toObject());
                        else if (args.isEmpty())
                            nlArgs = nlohmann::json::object();
                        else
                            nlArgs = web_shell::from_qt_json(args);

                        auto result = bridge->dispatch(method.toStdString(), nlArgs);
                        result_value = web_shell::to_qt_json_value(result);
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
        for (const auto& [name, bridge_ptr] : registry->all())
            forward_signals(bridge_ptr, QString::fromStdString(name), socket);

        // ── Cleanup ──────────────────────────────────────────────
        QObject::connect(socket, &QWebSocket::disconnected, socket, &QWebSocket::deleteLater);
    });

    qInfo() << "Bridge WebSocket server listening on port" << port;
    return server;
}
