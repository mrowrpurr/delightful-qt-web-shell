#pragma once

#include <algorithm>
#include <chrono>
#include <ctime>
#include <string>
#include <vector>

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
// The same interface that the Bun test server implements.
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
        return static_cast<int>(std::count_if(
            items_.begin(), items_.end(),
            [&](const TodoItem& i) { return i.list_id == list_id; }
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
        auto it = std::find_if(lists_.begin(), lists_.end(),
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
        TodoList list{gen_id(), name, 0, now_iso()};
        lists_.push_back(list);
        return list;
    }

    TodoItem add_item(const std::string& list_id, const std::string& text) {
        TodoItem item{gen_id(), list_id, text, false, now_iso()};
        items_.push_back(item);
        return item;
    }

    TodoItem toggle_item(const std::string& item_id) {
        auto it = std::find_if(items_.begin(), items_.end(),
            [&](const TodoItem& i) { return i.id == item_id; });
        if (it == items_.end()) return {};
        it->done = !it->done;
        return *it;
    }

    std::vector<TodoItem> search(const std::string& query) const {
        std::vector<TodoItem> results;
        std::string lower_query = query;
        std::transform(lower_query.begin(), lower_query.end(), lower_query.begin(), ::tolower);

        for (const auto& item : items_) {
            std::string lower_text = item.text;
            std::transform(lower_text.begin(), lower_text.end(), lower_text.begin(), ::tolower);
            if (lower_text.find(lower_query) != std::string::npos)
                results.push_back(item);
        }
        return results;
    }
};
