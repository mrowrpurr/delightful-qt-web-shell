#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QString>

#include "todo_store.hpp"

// Thin QObject wrapper over TodoStore.
// Every Q_INVOKABLE method takes QStrings and returns QJsonObject or QJsonArray.
// The infrastructure (expose_as_ws / QWebChannel) handles serialization automatically.
class TodoBridge : public QObject {
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

    Q_INVOKABLE QJsonArray listLists() const {
        QJsonArray arr;
        for (const auto& l : store_.list_lists())
            arr.append(to_json(l));
        return arr;
    }

    Q_INVOKABLE QJsonObject getList(const QString& listId) const {
        auto detail = store_.get_list(listId.toStdString());
        if (detail.list.id.empty())
            return {{"error", "List not found: " + listId}};
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
        if (item.id.empty())
            return {{"error", "Item not found: " + itemId}};
        emit dataChanged();
        return to_json(item);
    }

    Q_INVOKABLE QJsonObject deleteList(const QString& listId) {
        bool ok = store_.delete_list(listId.toStdString());
        if (!ok) return {{"error", "List not found: " + listId}};
        emit dataChanged();
        return {{"ok", true}};
    }

    Q_INVOKABLE QJsonObject deleteItem(const QString& itemId) {
        bool ok = store_.delete_item(itemId.toStdString());
        if (!ok) return {{"error", "Item not found: " + itemId}};
        emit dataChanged();
        return {{"ok", true}};
    }

    Q_INVOKABLE QJsonObject renameList(const QString& listId, const QString& newName) {
        auto list = store_.rename_list(listId.toStdString(), newName.toStdString());
        if (list.id.empty()) return {{"error", "List not found: " + listId}};
        emit dataChanged();
        return to_json(list);
    }

    Q_INVOKABLE QJsonArray search(const QString& query) const {
        QJsonArray arr;
        for (const auto& i : store_.search(query.toStdString()))
            arr.append(to_json(i));
        return arr;
    }

signals:
    // Emitted after any mutation (add, delete, toggle, rename).
    // Clients should refresh their data when this fires.
    void dataChanged();
};
