#include "todo_store.hpp"
#include "todo_store_ffi.h"

#include <nlohmann/json.hpp>
#include <cstring>
#include <string>

using json = nlohmann::json;

// ── JSON helpers (same fields as bridge.hpp, using nlohmann instead of Qt) ──

static json to_json(const TodoList& l) {
    return {
        {"id",         l.id},
        {"name",       l.name},
        {"item_count", l.item_count},
        {"created_at", l.created_at},
    };
}

static json to_json(const TodoItem& i) {
    return {
        {"id",         i.id},
        {"list_id",    i.list_id},
        {"text",       i.text},
        {"done",       i.done},
        {"created_at", i.created_at},
    };
}

static char* to_cstr(const json& j) {
    auto s = j.dump();
    auto* out = static_cast<char*>(std::malloc(s.size() + 1));
    std::memcpy(out, s.c_str(), s.size() + 1);
    return out;
}

// ── C API ───────────────────────────────────────────────────────────────────

void* todo_store_create(void) {
    return new TodoStore();
}

void todo_store_destroy(void* store) {
    delete static_cast<TodoStore*>(store);
}

const char* todo_store_invoke(void* store, const char* method, const char* args_json) {
    auto* s = static_cast<TodoStore*>(store);
    auto args = json::parse(args_json, nullptr, false);
    if (args.is_discarded()) args = json::array();

    std::string m(method);

    if (m == "listLists") {
        json arr = json::array();
        for (const auto& l : s->list_lists())
            arr.push_back(to_json(l));
        return to_cstr(arr);
    }

    if (m == "getList") {
        auto detail = s->get_list(args[0].get<std::string>());
        json items = json::array();
        for (const auto& i : detail.items)
            items.push_back(to_json(i));
        return to_cstr(json{{"list", to_json(detail.list)}, {"items", items}});
    }

    if (m == "addList") {
        auto list = s->add_list(args[0].get<std::string>());
        return to_cstr(to_json(list));
    }

    if (m == "addItem") {
        auto item = s->add_item(args[0].get<std::string>(), args[1].get<std::string>());
        return to_cstr(to_json(item));
    }

    if (m == "toggleItem") {
        auto item = s->toggle_item(args[0].get<std::string>());
        return to_cstr(to_json(item));
    }

    if (m == "search") {
        json arr = json::array();
        for (const auto& i : s->search(args[0].get<std::string>()))
            arr.push_back(to_json(i));
        return to_cstr(arr);
    }

    return to_cstr(json{{"error", "Unknown method: " + m}});
}

void todo_store_free_string(const char* str) {
    std::free(const_cast<char*>(str));
}
