#pragma once

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QObject>
#include <QString>

#include "todo_store.hpp"

// Thin QObject wrapper over TodoStore.
// Every Q_INVOKABLE method takes QStrings and returns a JSON QString.
// This convention is what makes expose_as_ws() generic — it works with
// any QObject that follows this pattern.
class Bridge : public QObject {
    Q_OBJECT
    TodoStore store_;

    // ── JSON helpers ──────────────────────────────────────────────
    static QJsonObject to_json(const TodoList& l) {
        return {
            {"id",         QString::fromStdString(l.id)},
            {"name",       QString::fromStdString(l.name)},
            {"item_count", l.item_count},
            {"created_at", QString::fromStdString(l.created_at)},
        };
    }

    static QJsonObject to_json(const TodoItem& i) {
        return {
            {"id",         QString::fromStdString(i.id)},
            {"list_id",    QString::fromStdString(i.list_id)},
            {"text",       QString::fromStdString(i.text)},
            {"done",       i.done},
            {"created_at", QString::fromStdString(i.created_at)},
        };
    }

    static QString compact(const QJsonDocument& doc) {
        return QString::fromUtf8(doc.toJson(QJsonDocument::Compact));
    }

public:
    using QObject::QObject;

    Q_INVOKABLE QString listLists() {
        QJsonArray arr;
        for (const auto& l : store_.list_lists())
            arr.append(to_json(l));
        return compact(QJsonDocument(arr));
    }

    Q_INVOKABLE QString getList(const QString& listId) {
        auto detail = store_.get_list(listId.toStdString());
        QJsonArray items;
        for (const auto& i : detail.items)
            items.append(to_json(i));
        QJsonObject obj;
        obj["list"] = to_json(detail.list);
        obj["items"] = items;
        return compact(QJsonDocument(obj));
    }

    Q_INVOKABLE QString addList(const QString& name) {
        auto list = store_.add_list(name.toStdString());
        emit dataChanged();
        return compact(QJsonDocument(to_json(list)));
    }

    Q_INVOKABLE QString addItem(const QString& listId, const QString& text) {
        auto item = store_.add_item(listId.toStdString(), text.toStdString());
        emit dataChanged();
        return compact(QJsonDocument(to_json(item)));
    }

    Q_INVOKABLE QString toggleItem(const QString& itemId) {
        auto item = store_.toggle_item(itemId.toStdString());
        emit dataChanged();
        return compact(QJsonDocument(to_json(item)));
    }

    Q_INVOKABLE QString search(const QString& query) {
        QJsonArray arr;
        for (const auto& i : store_.search(query.toStdString()))
            arr.append(to_json(i));
        return compact(QJsonDocument(arr));
    }

signals:
    void dataChanged();
};
