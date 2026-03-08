#include <catch2/catch_test_macros.hpp>

#include <todo_store.hpp>

TEST_CASE("TodoStore starts empty") {
    TodoStore store;
    REQUIRE(store.list_lists().empty());
}

TEST_CASE("add_list creates a list with correct fields") {
    TodoStore store;
    auto list = store.add_list("Groceries");

    REQUIRE(list.name == "Groceries");
    REQUIRE_FALSE(list.id.empty());
    REQUIRE_FALSE(list.created_at.empty());
    REQUIRE(list.item_count == 0);
}

TEST_CASE("list_lists returns all lists with item counts") {
    TodoStore store;
    auto groceries = store.add_list("Groceries");
    store.add_list("Chores");

    store.add_item(groceries.id, "Milk");
    store.add_item(groceries.id, "Eggs");

    auto lists = store.list_lists();
    REQUIRE(lists.size() == 2);

    auto& g = lists[0];
    REQUIRE(g.name == "Groceries");
    REQUIRE(g.item_count == 2);

    auto& c = lists[1];
    REQUIRE(c.name == "Chores");
    REQUIRE(c.item_count == 0);
}

TEST_CASE("get_list returns the list and its items") {
    TodoStore store;
    auto list = store.add_list("Work");
    store.add_item(list.id, "Ship feature");
    store.add_item(list.id, "Write tests");

    auto detail = store.get_list(list.id);
    REQUIRE(detail.list.name == "Work");
    REQUIRE(detail.list.item_count == 2);
    REQUIRE(detail.items.size() == 2);
    REQUIRE(detail.items[0].text == "Ship feature");
    REQUIRE(detail.items[1].text == "Write tests");
}

TEST_CASE("get_list for unknown id returns empty detail") {
    TodoStore store;
    auto detail = store.get_list("nonexistent");
    REQUIRE(detail.list.id.empty());
    REQUIRE(detail.items.empty());
}

TEST_CASE("add_item creates an item linked to the list") {
    TodoStore store;
    auto list = store.add_list("List");
    auto item = store.add_item(list.id, "Do thing");

    REQUIRE(item.text == "Do thing");
    REQUIRE(item.list_id == list.id);
    REQUIRE(item.done == false);
    REQUIRE_FALSE(item.id.empty());
}

TEST_CASE("toggle_item flips done state") {
    TodoStore store;
    auto list = store.add_list("List");
    auto item = store.add_item(list.id, "Task");
    REQUIRE(item.done == false);

    auto toggled = store.toggle_item(item.id);
    REQUIRE(toggled.done == true);

    auto again = store.toggle_item(item.id);
    REQUIRE(again.done == false);
}

TEST_CASE("toggle_item for unknown id returns empty item") {
    TodoStore store;
    auto result = store.toggle_item("nonexistent");
    REQUIRE(result.id.empty());
}

TEST_CASE("search finds matching items case-insensitively") {
    TodoStore store;
    auto list = store.add_list("List");
    store.add_item(list.id, "Buy MILK");
    store.add_item(list.id, "Buy eggs");
    store.add_item(list.id, "Walk dog");

    auto results = store.search("buy");
    REQUIRE(results.size() == 2);
    REQUIRE(results[0].text == "Buy MILK");
    REQUIRE(results[1].text == "Buy eggs");
}

TEST_CASE("search with no matches returns empty") {
    TodoStore store;
    auto list = store.add_list("List");
    store.add_item(list.id, "Something");

    REQUIRE(store.search("zzz").empty());
}

TEST_CASE("items from different lists stay independent") {
    TodoStore store;
    auto work = store.add_list("Work");
    auto home = store.add_list("Home");
    store.add_item(work.id, "Ship it");
    store.add_item(home.id, "Clean kitchen");

    auto work_detail = store.get_list(work.id);
    REQUIRE(work_detail.items.size() == 1);
    REQUIRE(work_detail.items[0].text == "Ship it");

    auto home_detail = store.get_list(home.id);
    REQUIRE(home_detail.items.size() == 1);
    REQUIRE(home_detail.items[0].text == "Clean kitchen");
}
