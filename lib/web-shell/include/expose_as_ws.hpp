#pragma once

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QMetaMethod>
#include <QObject>
#include <QWebSocket>
#include <QWebSocketServer>

// ── SignalForwarder ───────────────────────────────────────────────────
// Bridges a Qt signal to a WebSocket JSON event.
// Destroyed when the socket disconnects (parent = socket).
class SignalForwarder : public QObject {
    Q_OBJECT
    QWebSocket* socket_;
    QString     event_name_;
public:
    SignalForwarder(QWebSocket* socket, const QString& name, QObject* parent = nullptr)
        : QObject(parent), socket_(socket), event_name_(name) {}
public slots:
    void forward() {
        if (!socket_ || !socket_->isValid()) return;
        QJsonObject msg;
        msg["event"] = event_name_;
        socket_->sendTextMessage(
            QString::fromUtf8(QJsonDocument(msg).toJson(QJsonDocument::Compact)));
    }
};

// ── invoke_bridge_method ──────────────────────────────────────────────
// Calls a Q_INVOKABLE method by name with QString args from a JSON array.
// Bridge methods can return QJsonObject, QJsonArray, or QString.
// The result is returned as a QJsonValue — no re-parsing needed.
inline QJsonValue invoke_bridge_method(QObject* bridge, const QString& method_name, const QJsonArray& args) {
    const QMetaObject* meta = bridge->metaObject();

    // Find the method
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
        return QJsonObject{{"error", "Unknown method"}};

    QMetaMethod method = meta->method(method_index);

    // Extract QString args from the JSON array
    QStringList string_args;
    for (const auto& a : args)
        string_args.append(a.isString() ? a.toString() : QString::number(a.toInt()));

    // Invoke based on return type and parameter count.
    // All parameters are QString by convention.
    bool ok = false;
    QByteArray returnType = method.typeName();

    #define INVOKE(RetType, result) \
        switch (method.parameterCount()) { \
            case 0: ok = method.invoke(bridge, Qt::DirectConnection, \
                Q_RETURN_ARG(RetType, result)); break; \
            case 1: ok = method.invoke(bridge, Qt::DirectConnection, \
                Q_RETURN_ARG(RetType, result), \
                Q_ARG(QString, string_args.value(0))); break; \
            case 2: ok = method.invoke(bridge, Qt::DirectConnection, \
                Q_RETURN_ARG(RetType, result), \
                Q_ARG(QString, string_args.value(0)), \
                Q_ARG(QString, string_args.value(1))); break; \
            case 3: ok = method.invoke(bridge, Qt::DirectConnection, \
                Q_RETURN_ARG(RetType, result), \
                Q_ARG(QString, string_args.value(0)), \
                Q_ARG(QString, string_args.value(1)), \
                Q_ARG(QString, string_args.value(2))); break; \
            default: return QJsonObject{{"error", "Too many parameters"}}; \
        }

    if (returnType == "QJsonObject") {
        QJsonObject result;
        INVOKE(QJsonObject, result)
        if (!ok) return QJsonObject{{"error", "Method invocation failed"}};
        return result;
    }

    if (returnType == "QJsonArray") {
        QJsonArray result;
        INVOKE(QJsonArray, result)
        if (!ok) return QJsonObject{{"error", "Method invocation failed"}};
        return result;
    }

    // QString fallback
    QString result;
    INVOKE(QString, result)
    #undef INVOKE

    if (!ok) return QJsonObject{{"error", "Method invocation failed"}};

    // Parse QString as JSON (legacy path)
    QJsonDocument doc = QJsonDocument::fromJson(result.toUtf8());
    if (doc.isArray())  return doc.array();
    if (doc.isObject()) return doc.object();
    return QJsonValue(result);
}

// ── expose_as_ws ──────────────────────────────────────────────────────
// Takes any QObject with Q_INVOKABLE methods and exposes it as a
// WebSocket JSON-RPC server. Works with ANY bridge, not just TodoBridge.
//
// Protocol:
//   → {"method": "listLists", "args": [], "id": 1}
//   ← {"id": 1, "result": [...]}
//
//   ← {"event": "dataChanged"}   (pushed when a signal fires)
//
// Convention: Q_INVOKABLE methods take QStrings, return QJsonObject or QJsonArray.
//             Parameterless signals are forwarded as events.
inline QWebSocketServer* expose_as_ws(QObject* bridge, int port, QObject* parent = nullptr) {
    auto* server = new QWebSocketServer(
        QStringLiteral("BridgeServer"), QWebSocketServer::NonSecureMode, parent);

    if (!server->listen(QHostAddress::LocalHost, port)) {
        qWarning() << "expose_as_ws: failed to listen on port" << port;
        delete server;
        return nullptr;
    }

    QObject::connect(server, &QWebSocketServer::newConnection, server, [bridge, server]() {
        auto* socket = server->nextPendingConnection();
        if (!socket) return;

        // ── Method dispatch ──────────────────────────────────────
        QObject::connect(socket, &QWebSocket::textMessageReceived, server,
            [bridge, socket](const QString& message) {
                QJsonObject request = QJsonDocument::fromJson(message.toUtf8()).object();
                QString method = request["method"].toString();
                QJsonArray args = request["args"].toArray();
                qint64 id = request["id"].toInteger(-1);

                QJsonValue result_value = invoke_bridge_method(bridge, method, args);

                QJsonObject response;
                if (id >= 0) response["id"] = id;
                response["result"] = result_value;

                socket->sendTextMessage(
                    QString::fromUtf8(QJsonDocument(response).toJson(QJsonDocument::Compact)));
            });

        // ── Forward signals as events ────────────────────────────
        const QMetaObject* meta = bridge->metaObject();
        for (int i = meta->methodOffset(); i < meta->methodCount(); ++i) {
            QMetaMethod m = meta->method(i);
            if (m.methodType() == QMetaMethod::Signal && m.parameterCount() == 0) {
                auto* fwd = new SignalForwarder(socket, QString::fromLatin1(m.name()), socket);
                QObject::connect(
                    bridge, QByteArray("2" + m.methodSignature()).constData(),
                    fwd,    SLOT(forward()));
            }
        }

        // ── Cleanup on disconnect ────────────────────────────────
        QObject::connect(socket, &QWebSocket::disconnected, socket, &QWebSocket::deleteLater);
    });

    qInfo() << "Bridge WebSocket server listening on port" << port;
    return server;
}
