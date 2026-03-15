#pragma once

#include <emscripten/val.h>

#include <functional>
#include <vector>

#include "todo_store.hpp"

// WASM equivalent of TodoBridge — same domain logic, Embind instead of Qt.
// Methods return emscripten::val (JS objects) directly — no serialization step.
class TodoWasmBridge {
    TodoStore store_;
    std::vector<emscripten::val> data_changed_listeners_;

    void notify() {
        for (auto& cb : data_changed_listeners_)
            cb();
    }

    static emscripten::val to_val(const TodoList& l) {
        auto obj = emscripten::val::object();
        obj.set("id", l.id);
        obj.set("name", l.name);
        obj.set("item_count", l.item_count);
        obj.set("created_at", l.created_at);
        return obj;
    }

    static emscripten::val to_val(const TodoItem& i) {
        auto obj = emscripten::val::object();
        obj.set("id", i.id);
        obj.set("list_id", i.list_id);
        obj.set("text", i.text);
        obj.set("done", i.done);
        obj.set("created_at", i.created_at);
        return obj;
    }

    static emscripten::val to_val_array(const std::vector<TodoList>& lists) {
        auto arr = emscripten::val::array();
        for (size_t i = 0; i < lists.size(); ++i)
            arr.call<void>("push", to_val(lists[i]));
        return arr;
    }

    static emscripten::val to_val_array(const std::vector<TodoItem>& items) {
        auto arr = emscripten::val::array();
        for (size_t i = 0; i < items.size(); ++i)
            arr.call<void>("push", to_val(items[i]));
        return arr;
    }

public:
    emscripten::val listLists() {
        return to_val_array(store_.list_lists());
    }

    emscripten::val getList(const std::string& listId) {
        auto detail = store_.get_list(listId);
        if (detail.list.id.empty()) {
            auto err = emscripten::val::object();
            err.set("error", std::string("List not found: ") + listId);
            return err;
        }
        auto obj = emscripten::val::object();
        obj.set("list", to_val(detail.list));
        obj.set("items", to_val_array(detail.items));
        return obj;
    }

    emscripten::val addList(const std::string& name) {
        auto list = store_.add_list(name);
        notify();
        return to_val(list);
    }

    emscripten::val addItem(const std::string& listId, const std::string& text) {
        auto item = store_.add_item(listId, text);
        notify();
        return to_val(item);
    }

    emscripten::val toggleItem(const std::string& itemId) {
        auto item = store_.toggle_item(itemId);
        if (item.id.empty()) {
            auto err = emscripten::val::object();
            err.set("error", std::string("Item not found: ") + itemId);
            return err;
        }
        notify();
        return to_val(item);
    }

    emscripten::val deleteList(const std::string& listId) {
        bool ok = store_.delete_list(listId);
        auto result = emscripten::val::object();
        if (!ok) {
            result.set("error", std::string("List not found: ") + listId);
            return result;
        }
        notify();
        result.set("ok", true);
        return result;
    }

    emscripten::val deleteItem(const std::string& itemId) {
        bool ok = store_.delete_item(itemId);
        auto result = emscripten::val::object();
        if (!ok) {
            result.set("error", std::string("Item not found: ") + itemId);
            return result;
        }
        notify();
        result.set("ok", true);
        return result;
    }

    emscripten::val renameList(const std::string& listId, const std::string& newName) {
        auto list = store_.rename_list(listId, newName);
        if (list.id.empty()) {
            auto err = emscripten::val::object();
            err.set("error", std::string("List not found: ") + listId);
            return err;
        }
        notify();
        return to_val(list);
    }

    emscripten::val search(const std::string& query) {
        return to_val_array(store_.search(query));
    }

    void onDataChanged(emscripten::val callback) {
        data_changed_listeners_.push_back(callback);
    }
};
