// json_adapter.hpp — nlohmann::json ↔ QJsonObject conversion.
//
// These two functions are the ONLY place where nlohmann and Qt JSON meet.
// Everything domain-side speaks nlohmann. Everything transport-side speaks Qt.

#pragma once

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QString>

#include <nlohmann/json.hpp>

namespace app_shell {

// ── nlohmann → Qt ────────────────────────────────────────────────────

inline QJsonObject to_qt_json(const nlohmann::json& j) {
    auto bytes = QByteArray::fromStdString(j.dump());
    return QJsonDocument::fromJson(bytes).object();
}

inline QJsonArray to_qt_json_array(const nlohmann::json& j) {
    auto bytes = QByteArray::fromStdString(j.dump());
    return QJsonDocument::fromJson(bytes).array();
}

inline QJsonValue to_qt_json_value(const nlohmann::json& j) {
    if (j.is_object()) return to_qt_json(j);
    if (j.is_array()) return to_qt_json_array(j);
    if (j.is_string()) return QString::fromStdString(j.get<std::string>());
    if (j.is_boolean()) return j.get<bool>();
    if (j.is_number_integer()) return static_cast<qint64>(j.get<int64_t>());
    if (j.is_number_float()) return j.get<double>();
    return QJsonValue::Null;
}

// ── Qt → nlohmann ────────────────────────────────────────────────────

inline nlohmann::json from_qt_json(const QJsonObject& obj) {
    auto bytes = QJsonDocument(obj).toJson(QJsonDocument::Compact);
    return nlohmann::json::parse(bytes.toStdString());
}

inline nlohmann::json from_qt_json(const QJsonArray& arr) {
    auto bytes = QJsonDocument(arr).toJson(QJsonDocument::Compact);
    return nlohmann::json::parse(bytes.toStdString());
}

inline nlohmann::json from_qt_json(const QJsonValue& val) {
    if (val.isObject()) return from_qt_json(val.toObject());
    if (val.isArray()) return from_qt_json(val.toArray());
    if (val.isString()) return val.toString().toStdString();
    if (val.isBool()) return val.toBool();
    if (val.isDouble()) return val.toDouble();
    return nullptr;
}

} // namespace app_shell
