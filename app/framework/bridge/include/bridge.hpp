// bridge.hpp — Bridge base class with def_type dispatch.
//
// The developer writes pure C++ methods that take def_type request structs
// and return def_type response structs. The framework handles serialization.

#pragma once

#include <functional>
#include <mutex>
#include <string>
#include <type_traits>
#include <unordered_map>
#include <vector>

#include <def_type.hpp>
#include <nlohmann/json.hpp>

// Generic response for void-like operations. Shared by all bridges.
struct OkResponse {
    bool ok = true;
};

namespace app_shell {

namespace detail {

// Serialize a response to JSON. Handles:
//   - nlohmann::json → passthrough
//   - bool → {"ok": value}
//   - std::vector<T> → JSON array, each element serialized recursively
//   - def_type struct → def_type::to_json
template <typename T>
nlohmann::json serialize_response(const T& value) {
    if constexpr (std::is_same_v<std::decay_t<T>, nlohmann::json>) {
        return value;
    } else if constexpr (std::is_same_v<std::decay_t<T>, bool>) {
        return {{"ok", value}};
    } else if constexpr (requires { value.begin(); value.end(); typename T::value_type; }) {
        auto arr = nlohmann::json::array();
        for (const auto& elem : value)
            arr.push_back(serialize_response(elem));
        return arr;
    } else {
        return def_type::to_json(value);
    }
}

} // namespace detail

class Bridge {
public:
    using dispatch_fn = std::function<nlohmann::json(const nlohmann::json&)>;
    using signal_callback = std::function<void(const nlohmann::json&)>;

    virtual ~Bridge() = default;

    // ── Method dispatch ──────────────────────────────────────────────

    nlohmann::json dispatch(const std::string& method_name, const nlohmann::json& args) const {
        auto it = methods_.find(method_name);
        if (it == methods_.end())
            return {{"error", "Unknown method: " + method_name}};
        try {
            return it->second(args);
        } catch (const std::exception& e) {
            return {{"error", std::string(e.what())}};
        }
    }

    bool has_method(const std::string& name) const { return methods_.contains(name); }

    std::vector<std::string> method_names() const {
        std::vector<std::string> names;
        names.reserve(methods_.size());
        for (const auto& [name, _] : methods_)
            names.push_back(name);
        return names;
    }

    // ── Signals ──────────────────────────────────────────────────────

    void signal(const std::string& name) {
        std::lock_guard lock(signal_mutex_);
        signals_[name];
    }

    bool has_signal(const std::string& name) const {
        std::lock_guard lock(signal_mutex_);
        return signals_.contains(name);
    }

    bool has_listeners(const std::string& name) const {
        std::lock_guard lock(signal_mutex_);
        auto it = signals_.find(name);
        return it != signals_.end() && !it->second.empty();
    }

    std::vector<std::string> signal_names() const {
        std::lock_guard lock(signal_mutex_);
        std::vector<std::string> names;
        names.reserve(signals_.size());
        for (const auto& [name, _] : signals_)
            names.push_back(name);
        return names;
    }

    std::function<void()> on_signal(const std::string& name, signal_callback cb) {
        std::lock_guard lock(signal_mutex_);
        auto& listeners = signals_[name];
        auto id = next_listener_id_++;
        listeners.push_back({id, std::move(cb)});
        return [this, name, id]() {
            std::lock_guard lock(signal_mutex_);
            auto it = signals_.find(name);
            if (it == signals_.end()) return;
            auto& vec = it->second;
            std::erase_if(vec, [id](const listener& l) { return l.id == id; });
        };
    }

protected:
    // ── Method registration ──────────────────────────────────────────

    // Response fn(Request)
    template <typename Bridge, typename Response, typename Request>
    void method(const std::string& name, Response (Bridge::*fn)(Request)) {
        auto* self = static_cast<Bridge*>(this);
        methods_[name] = [self, fn](const nlohmann::json& args) -> nlohmann::json {
            auto request = def_type::from_json<Request>(args);
            return detail::serialize_response((self->*fn)(std::move(request)));
        };
    }

    // Response fn(Request) const
    template <typename Bridge, typename Response, typename Request>
    void method(const std::string& name, Response (Bridge::*fn)(Request) const) {
        auto* self = static_cast<const Bridge*>(this);
        methods_[name] = [self, fn](const nlohmann::json& args) -> nlohmann::json {
            auto request = def_type::from_json<Request>(args);
            return detail::serialize_response((self->*fn)(std::move(request)));
        };
    }

    // Response fn()
    template <typename Bridge, typename Response>
    void method(const std::string& name, Response (Bridge::*fn)()) {
        auto* self = static_cast<Bridge*>(this);
        methods_[name] = [self, fn](const nlohmann::json&) -> nlohmann::json {
            return detail::serialize_response((self->*fn)());
        };
    }

    // Response fn() const
    template <typename Bridge, typename Response>
    void method(const std::string& name, Response (Bridge::*fn)() const) {
        auto* self = static_cast<const Bridge*>(this);
        methods_[name] = [self, fn](const nlohmann::json&) -> nlohmann::json {
            return detail::serialize_response((self->*fn)());
        };
    }

    // void fn(Request)
    template <typename Bridge, typename Request>
    void method(const std::string& name, void (Bridge::*fn)(Request)) {
        auto* self = static_cast<Bridge*>(this);
        methods_[name] = [self, fn](const nlohmann::json& args) -> nlohmann::json {
            auto request = def_type::from_json<Request>(args);
            (self->*fn)(std::move(request));
            return {{"ok", true}};
        };
    }

    // void fn()
    template <typename Bridge>
    void method(const std::string& name, void (Bridge::*fn)()) {
        auto* self = static_cast<Bridge*>(this);
        methods_[name] = [self, fn](const nlohmann::json&) -> nlohmann::json {
            (self->*fn)();
            return {{"ok", true}};
        };
    }

    // ── Signal emission ──────────────────────────────────────────────

    void emit_signal(const std::string& name, const nlohmann::json& data = nullptr) {
        std::vector<signal_callback> callbacks;
        {
            std::lock_guard lock(signal_mutex_);
            auto it = signals_.find(name);
            if (it == signals_.end()) return;
            callbacks.reserve(it->second.size());
            for (const auto& l : it->second)
                callbacks.push_back(l.cb);
        }
        for (const auto& cb : callbacks)
            cb(data);
    }

    template <typename T>
    void emit_signal(const std::string& name, const T& payload) {
        emit_signal(name, def_type::to_json(payload));
    }

private:
    struct listener {
        uint64_t        id;
        signal_callback cb;
    };

    std::unordered_map<std::string, dispatch_fn>           methods_;
    std::unordered_map<std::string, std::vector<listener>> signals_;
    mutable std::mutex                                     signal_mutex_;
    uint64_t next_listener_id_ = 0;
};

} // namespace app_shell
