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

        signal("listAdded");
        signal("listRenamed");
        signal("listDeleted");
        signal("itemAdded");
        signal("itemToggled");
        signal("itemDeleted");
    }

    std::vector<TodoList> listLists() const {
        return store_.list_lists();
    }

    ListDetail getList(GetListRequest req) const {
        auto detail = store_.get_list(req.list_id);
        if (detail.list.id.empty())
            throw std::runtime_error("List not found: " + req.list_id);
        return detail;
    }

    TodoList addList(AddListRequest req) {
        auto list = store_.add_list(req.name);
        emit_signal("listAdded", list);
        return list;
    }

    TodoItem addItem(AddItemRequest req) {
        auto item = store_.add_item(req.list_id, req.text);
        emit_signal("itemAdded", item);
        return item;
    }

    TodoItem toggleItem(ToggleItemRequest req) {
        auto item = store_.toggle_item(req.item_id);
        if (item.id.empty())
            throw std::runtime_error("Item not found: " + req.item_id);
        emit_signal("itemToggled", item);
        return item;
    }

    OkResponse deleteList(DeleteListRequest req) {
        bool ok = store_.delete_list(req.list_id);
        if (!ok) throw std::runtime_error("List not found: " + req.list_id);
        emit_signal("listDeleted", req);
        return {};
    }

    OkResponse deleteItem(DeleteItemRequest req) {
        bool ok = store_.delete_item(req.item_id);
        if (!ok) throw std::runtime_error("Item not found: " + req.item_id);
        emit_signal("itemDeleted", req);
        return {};
    }

    TodoList renameList(RenameListRequest req) {
        auto list = store_.rename_list(req.list_id, req.new_name);
        if (list.id.empty())
            throw std::runtime_error("List not found: " + req.list_id);
        emit_signal("listRenamed", list);
        return list;
    }

    std::vector<TodoItem> search(SearchRequest req) const {
        return store_.search(req.query);
    }
};
