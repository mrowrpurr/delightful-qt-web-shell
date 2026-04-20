// Request DTOs for TodoBridge methods.
// Each bridge method takes exactly one of these and returns a domain struct.

#pragma once

#include <def_type.hpp>

struct AddListRequest {
    std::string name;
};

struct GetListRequest {
    std::string list_id;
};

struct AddItemRequest {
    std::string list_id;
    std::string text;
};

struct ToggleItemRequest {
    std::string item_id;
};

struct DeleteListRequest {
    std::string list_id;
};

struct DeleteItemRequest {
    std::string item_id;
};

struct RenameListRequest {
    std::string list_id;
    std::string new_name;
};

struct SearchRequest {
    std::string query;
};
