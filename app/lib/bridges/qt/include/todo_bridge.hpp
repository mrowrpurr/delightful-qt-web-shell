// TodoBridge — typed bridge over TodoStore.
// Pure C++. No Qt types. def_type handles serialization.

#pragma once

#include <stdexcept>

#include "todo_dtos.hpp"
#include "todo_store.hpp"
#include "bridge.hpp"

class TodoBridge : public web_shell::bridge {
    TodoStore store_;

public:
    TodoBridge() {
        method("listLists",  &TodoBridge::listLists);
        method("getList",    &TodoBridge::getList);
        method("addList",    &TodoBridge::addList);
        method("addItem",    &TodoBridge::addItem);
        method("toggleItem", &TodoBridge::toggleItem);
        method("deleteList", &TodoBridge::deleteList);
        method("deleteItem", &TodoBridge::deleteItem);
        method("renameList", &TodoBridge::renameList);
        method("search",     &TodoBridge::search);

        signal("dataChanged");
    }

    std::vector<TodoList> listLists() const {
        return store_.list_lists();
    }

    nlohmann::json getList(GetListRequest req) const {
        auto detail = store_.get_list(req.list_id);
        if (detail.list.id.empty())
            throw std::runtime_error("List not found: " + req.list_id);
        auto items_json = nlohmann::json::array();
        for (const auto& item : detail.items)
            items_json.push_back(def_type::to_json(item));
        return {
            {"list", def_type::to_json(detail.list)},
            {"items", items_json}
        };
    }

    TodoList addList(AddListRequest req) {
        auto list = store_.add_list(req.name);
        emit_signal("dataChanged", list);
        return list;
    }

    TodoItem addItem(AddItemRequest req) {
        auto item = store_.add_item(req.list_id, req.text);
        emit_signal("dataChanged", item);
        return item;
    }

    TodoItem toggleItem(ToggleItemRequest req) {
        auto item = store_.toggle_item(req.item_id);
        if (item.id.empty())
            throw std::runtime_error("Item not found: " + req.item_id);
        emit_signal("dataChanged", item);
        return item;
    }

    OkResponse deleteList(DeleteListRequest req) {
        bool ok = store_.delete_list(req.list_id);
        if (!ok) throw std::runtime_error("List not found: " + req.list_id);
        emit_signal("dataChanged");
        return {};
    }

    OkResponse deleteItem(DeleteItemRequest req) {
        bool ok = store_.delete_item(req.item_id);
        if (!ok) throw std::runtime_error("Item not found: " + req.item_id);
        emit_signal("dataChanged");
        return {};
    }

    TodoList renameList(RenameListRequest req) {
        auto list = store_.rename_list(req.list_id, req.new_name);
        if (list.id.empty())
            throw std::runtime_error("List not found: " + req.list_id);
        emit_signal("dataChanged", list);
        return list;
    }

    std::vector<TodoItem> search(SearchRequest req) const {
        return store_.search(req.query);
    }
};
