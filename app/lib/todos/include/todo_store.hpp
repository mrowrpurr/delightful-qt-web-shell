#pragma once

#include <algorithm>
#include <chrono>
#include <ctime>
#include <ranges>
#include <string>
#include <string_view>
#include <vector>

#include <def_type.hpp>

struct TodoList {
    std::string id;
    std::string name;
    int         item_count = 0;
    std::string created_at;
};

struct TodoItem {
    std::string id;
    std::string list_id;
    std::string text;
    bool        done = false;
    std::string created_at;
};

struct ListDetail {
    TodoList              list;
    std::vector<TodoItem> items;
};

// In-memory todo store. Pure C++, no Qt dependency.
class TodoStore {
    std::vector<TodoList> lists_;
    std::vector<TodoItem> items_;
    int                   next_id_ = 1;

    std::string gen_id() { return std::to_string(next_id_++); }

    static std::string now_iso() {
        auto    tt = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
        std::tm buf{};
#ifdef _MSC_VER
        gmtime_s(&buf, &tt);
#else
        gmtime_r(&tt, &buf);
#endif
        char out[32];
        std::strftime(out, sizeof(out), "%Y-%m-%dT%H:%M:%SZ", &buf);
        return out;
    }

    int count_items(const std::string& list_id) const {
        return static_cast<int>(std::ranges::count_if(
            items_, [&](const TodoItem& i) { return i.list_id == list_id; }
        ));
    }

public:
    std::vector<TodoList> list_lists() const {
        auto result = lists_;
        for (auto& l : result)
            l.item_count = count_items(l.id);
        return result;
    }

    ListDetail get_list(const std::string& list_id) const {
        auto it = std::ranges::find_if(lists_,
            [&](const TodoList& l) { return l.id == list_id; });
        if (it == lists_.end()) return {};

        ListDetail detail;
        detail.list = *it;
        detail.list.item_count = count_items(list_id);
        for (const auto& item : items_)
            if (item.list_id == list_id)
                detail.items.push_back(item);
        return detail;
    }

    TodoList add_list(const std::string& name) {
        TodoList list;
        list.id = gen_id();
        list.name = name;
        list.item_count = 0;
        list.created_at = now_iso();
        lists_.push_back(list);
        return list;
    }

    TodoItem add_item(const std::string& list_id, const std::string& text) {
        TodoItem item;
        item.id = gen_id();
        item.list_id = list_id;
        item.text = text;
        item.done = false;
        item.created_at = now_iso();
        items_.push_back(item);
        return item;
    }

    TodoItem toggle_item(const std::string& item_id) {
        auto it = std::ranges::find_if(items_,
            [&](const TodoItem& i) { return i.id == item_id; });
        if (it == items_.end()) return {};
        it->done = !it->done;
        return *it;
    }

    bool delete_list(const std::string& list_id) {
        auto it = std::ranges::find_if(lists_,
            [&](const TodoList& l) { return l.id == list_id; });
        if (it == lists_.end()) return false;
        lists_.erase(it);
        std::erase_if(items_, [&](const TodoItem& i) { return i.list_id == list_id; });
        return true;
    }

    bool delete_item(const std::string& item_id) {
        auto it = std::ranges::find_if(items_,
            [&](const TodoItem& i) { return i.id == item_id; });
        if (it == items_.end()) return false;
        items_.erase(it);
        return true;
    }

    TodoList rename_list(const std::string& list_id, const std::string& new_name) {
        auto it = std::ranges::find_if(lists_,
            [&](const TodoList& l) { return l.id == list_id; });
        if (it == lists_.end()) return {};
        it->name = new_name;
        it->item_count = count_items(list_id);
        return *it;
    }

    std::vector<TodoItem> search(const std::string& query) const {
        auto to_lower = [](unsigned char c) -> char { return static_cast<char>(std::tolower(c)); };

        std::vector<TodoItem> results;
        std::string lower_query{query};
        std::ranges::transform(lower_query, lower_query.begin(), to_lower);

        for (const auto& item : items_) {
            std::string lower_text = item.text;
            std::ranges::transform(lower_text, lower_text.begin(), to_lower);
            if (lower_text.contains(lower_query))
                results.push_back(item);
        }
        return results;
    }
};
