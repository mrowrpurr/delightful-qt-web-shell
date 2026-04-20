// Request DTOs for TodoBridge methods.
// Each bridge method takes exactly one of these and returns a domain struct.

#pragma once

#include <def_type.hpp>

using def_type::field;

struct AddListRequest {
    field<std::string> name;
};

struct GetListRequest {
    field<std::string> list_id;
};

struct AddItemRequest {
    field<std::string> list_id;
    field<std::string> text;
};

struct ToggleItemRequest {
    field<std::string> item_id;
};

struct DeleteListRequest {
    field<std::string> list_id;
};

struct DeleteItemRequest {
    field<std::string> item_id;
};

struct RenameListRequest {
    field<std::string> list_id;
    field<std::string> new_name;
};

struct SearchRequest {
    field<std::string> query;
};

// Generic response for delete/void operations
struct OkResponse {
    field<bool> ok{.value = true};
};
