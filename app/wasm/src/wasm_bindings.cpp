// Embind bindings — exposes typed bridges to JavaScript via WASM.
// One generic WasmBridgeWrapper per bridge, no per-bridge serialization code.

#include <emscripten/bind.h>

#include "todo_bridge.hpp"
#include "wasm_bridge_wrapper.hpp"

// Bridge instances live for the lifetime of the WASM module.
static TodoBridge todoBridge;
static app_shell::WasmBridgeWrapper todoWrapper(&todoBridge);

EMSCRIPTEN_BINDINGS(bridges) {
    emscripten::class_<app_shell::WasmBridgeWrapper>("BridgeWrapper")
        .function("call", &app_shell::WasmBridgeWrapper::call)
        .function("subscribe", &app_shell::WasmBridgeWrapper::subscribe)
        .function("methods", &app_shell::WasmBridgeWrapper::methods)
        .function("signals", &app_shell::WasmBridgeWrapper::signals);

    emscripten::function("getBridge", +[](const std::string& name) -> app_shell::WasmBridgeWrapper* {
        if (name == "todos") return &todoWrapper;
        return nullptr;
    }, emscripten::allow_raw_pointers());
}
