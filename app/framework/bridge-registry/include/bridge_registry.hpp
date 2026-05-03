// BridgeRegistry — pure C++ map of named bridges.
//
// Holds the master list of registered bridges. Transports (qt-transport's
// QWebChannel adapter, qt-transport's WebSocket exposer, wasm-transport's
// Embind wrapper) read from this to wire bridges to their respective
// channels. No Qt, no Embind — just an std::map.

#pragma once

#include <map>
#include <string>

#include "bridge.hpp"

namespace app_shell {

class BridgeRegistry {
    std::map<std::string, Bridge*> bridges_;

public:
    void add(const std::string& name, Bridge* b) { bridges_[name] = b; }

    Bridge* get(const std::string& name) const {
        auto it = bridges_.find(name);
        return it == bridges_.end() ? nullptr : it->second;
    }

    const std::map<std::string, Bridge*>& all() const { return bridges_; }
};

} // namespace app_shell
