// Embind bindings — exposes typed bridges to JavaScript via WASM.
// One generic WasmBridgeWrapper per bridge, no per-bridge serialization code.

#include <emscripten/bind.h>

#include "todo_bridge.hpp"
#include "wasm_bridge_wrapper.hpp"

// Bridge instances live for the lifetime of the WASM module.
static TodoBridge todoBridge;
static web_shell::WasmBridgeWrapper todoWrapper(&todoBridge);

EMSCRIPTEN_BINDINGS(bridges) {
    emscripten::class_<web_shell::WasmBridgeWrapper>("BridgeWrapper")
        .function("call", &web_shell::WasmBridgeWrapper::call)
        .function("subscribe", &web_shell::WasmBridgeWrapper::subscribe)
        .function("methods", &web_shell::WasmBridgeWrapper::methods)
        .function("signals", &web_shell::WasmBridgeWrapper::signals);

    emscripten::function("getBridge", +[](const std::string& name) -> web_shell::WasmBridgeWrapper* {
        if (name == "todos") return &todoWrapper;
        return nullptr;
    }, emscripten::allow_raw_pointers());
}
