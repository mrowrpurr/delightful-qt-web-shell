#include <emscripten/bind.h>

#include "todo_wasm_bridge.hpp"

EMSCRIPTEN_BINDINGS(bridges) {
    emscripten::class_<TodoWasmBridge>("TodoBridge")
        .constructor()
        .function("listLists", &TodoWasmBridge::listLists)
        .function("getList", &TodoWasmBridge::getList)
        .function("addList", &TodoWasmBridge::addList)
        .function("addItem", &TodoWasmBridge::addItem)
        .function("toggleItem", &TodoWasmBridge::toggleItem)
        .function("deleteList", &TodoWasmBridge::deleteList)
        .function("deleteItem", &TodoWasmBridge::deleteItem)
        .function("renameList", &TodoWasmBridge::renameList)
        .function("search", &TodoWasmBridge::search)
        .function("onDataChanged", &TodoWasmBridge::onDataChanged);
}
