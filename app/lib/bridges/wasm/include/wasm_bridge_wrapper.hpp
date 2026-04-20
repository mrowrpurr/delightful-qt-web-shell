// wasm_bridge_wrapper.hpp — Generic Embind wrapper for bridge.
//
// Wraps any bridge for WASM exposure via Embind.
// One wrapper class, works for every bridge. No per-bridge to_val() code.
//
// C++ side:
//   static TodoBridge todoBridge;
//   static WasmBridgeWrapper todoWrapper(&todoBridge);
//
// JS side:
//   const result = wrapper.call("addList", {name: "Groceries"})
//   wrapper.subscribe("dataChanged", (data) => { ... })

#pragma once

#include <emscripten/val.h>
#include <nlohmann/json.hpp>

#include "bridge.hpp"

namespace web_shell {

// ── nlohmann::json ↔ emscripten::val conversion ─────────────────────

inline emscripten::val to_em_val(const nlohmann::json& j) {
    // Parse the JSON string on the JS side — simplest correct approach.
    // Avoids recursive tree-walking and handles all types uniformly.
    return emscripten::val::global("JSON").call<emscripten::val>(
        "parse", j.dump());
}

inline nlohmann::json from_em_val(const emscripten::val& v) {
    // Stringify on the JS side, parse on the C++ side.
    auto json_str = emscripten::val::global("JSON")
        .call<std::string>("stringify", v);
    return nlohmann::json::parse(json_str);
}

// ── WasmBridgeWrapper ────────────────────────────────────────────────

class WasmBridgeWrapper {
    bridge* bridge_;

public:
    explicit WasmBridgeWrapper(bridge* b) : bridge_(b) {}

    // Call a bridge method. Args come in as a JS object, result goes out as a JS object.
    emscripten::val call(const std::string& method, emscripten::val args) {
        nlohmann::json nl_args;
        if (args.isUndefined() || args.isNull())
            nl_args = nlohmann::json::object();
        else
            nl_args = from_em_val(args);

        nlohmann::json result = bridge_->dispatch(method, nl_args);
        return to_em_val(result);
    }

    // Subscribe to a signal. Callback receives the signal payload as a JS object.
    void subscribe(const std::string& signal_name, emscripten::val callback) {
        bridge_->on_signal(signal_name, [callback](const nlohmann::json& data) {
            if (data.is_null())
                callback();
            else
                callback(to_em_val(data));
        });
    }

    // List available methods (for __meta__ equivalent)
    emscripten::val methods() {
        auto arr = emscripten::val::array();
        for (const auto& name : bridge_->method_names())
            arr.call<void>("push", name);
        return arr;
    }

    // List available signals
    emscripten::val signals() {
        auto arr = emscripten::val::array();
        for (const auto& name : bridge_->signal_names())
            arr.call<void>("push", name);
        return arr;
    }
};

} // namespace web_shell
