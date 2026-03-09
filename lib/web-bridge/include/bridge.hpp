#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QString>

#include "todo_store.hpp"

// Thin QObject wrapper over TodoStore.
// Every Q_INVOKABLE method takes QStrings and returns QJsonObject or QJsonArray.
// The infrastructure (expose_as_ws / QWebChannel) handles serialization automatically.
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

public:
    using QObject::QObject;

    Q_INVOKABLE QJsonArray listLists() {
        QJsonArray arr;
        for (const auto& l : store_.list_lists())
            arr.append(to_json(l));
        return arr;
    }

    Q_INVOKABLE QJsonObject getList(const QString& listId) {
        auto detail = store_.get_list(listId.toStdString());
        QJsonArray items;
        for (const auto& i : detail.items)
            items.append(to_json(i));
        return {{"list", to_json(detail.list)}, {"items", items}};
    }

    Q_INVOKABLE QJsonObject addList(const QString& name) {
        auto list = store_.add_list(name.toStdString());
        emit dataChanged();
        return to_json(list);
    }

    Q_INVOKABLE QJsonObject addItem(const QString& listId, const QString& text) {
        auto item = store_.add_item(listId.toStdString(), text.toStdString());
        emit dataChanged();
        return to_json(item);
    }

    Q_INVOKABLE QJsonObject toggleItem(const QString& itemId) {
        auto item = store_.toggle_item(itemId.toStdString());
        emit dataChanged();
        return to_json(item);
    }

    Q_INVOKABLE QJsonArray search(const QString& query) {
        QJsonArray arr;
        for (const auto& i : store_.search(query.toStdString()))
            arr.append(to_json(i));
        return arr;
    }

signals:
    void dataChanged();
};
