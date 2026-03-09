#include <jni.h>
#include <string>
#include <atomic>
#include "todo_store.hpp"

// ── Lightweight JSON helpers ──────────────────────────────────────────
// TodoStore structs are trivially simple — hand-written serialization
// is shorter and dependency-free compared to pulling in a JSON library.

static std::string escape_json(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;
        }
    }
    return out;
}

static std::string to_json(const TodoList& l) {
    return "{\"id\":\"" + escape_json(l.id) +
           "\",\"name\":\"" + escape_json(l.name) +
           "\",\"item_count\":" + std::to_string(l.item_count) +
           ",\"created_at\":\"" + escape_json(l.created_at) + "\"}";
}

static std::string to_json(const TodoItem& i) {
    return "{\"id\":\"" + escape_json(i.id) +
           "\",\"list_id\":\"" + escape_json(i.list_id) +
           "\",\"text\":\"" + escape_json(i.text) +
           "\",\"done\":" + (i.done ? "true" : "false") +
           ",\"created_at\":\"" + escape_json(i.created_at) + "\"}";
}

template<typename T>
static std::string to_json_array(const std::vector<T>& items) {
    std::string out = "[";
    for (size_t i = 0; i < items.size(); ++i) {
        if (i > 0) out += ",";
        out += to_json(items[i]);
    }
    out += "]";
    return out;
}

// ── Minimal JSON argument parsing ─────────────────────────────────────
// Parses a JSON array of strings: ["arg1", "arg2"]
// Only handles string values — sufficient for our bridge protocol.

static std::vector<std::string> parse_json_string_array(const std::string& json) {
    std::vector<std::string> result;
    size_t i = 0;
    while (i < json.size() && json[i] != '[') ++i;
    ++i; // skip '['

    while (i < json.size()) {
        // skip whitespace and commas
        while (i < json.size() && (json[i] == ' ' || json[i] == ',' || json[i] == '\n' || json[i] == '\r' || json[i] == '\t')) ++i;
        if (i >= json.size() || json[i] == ']') break;

        if (json[i] == '"') {
            ++i; // skip opening quote
            std::string val;
            while (i < json.size() && json[i] != '"') {
                if (json[i] == '\\' && i + 1 < json.size()) {
                    ++i;
                    switch (json[i]) {
                        case '"':  val += '"';  break;
                        case '\\': val += '\\'; break;
                        case 'n':  val += '\n'; break;
                        case 'r':  val += '\r'; break;
                        case 't':  val += '\t'; break;
                        default:   val += json[i]; break;
                    }
                } else {
                    val += json[i];
                }
                ++i;
            }
            if (i < json.size()) ++i; // skip closing quote
            result.push_back(val);
        } else {
            ++i; // skip unexpected characters
        }
    }
    return result;
}

// ── Global state ──────────────────────────────────────────────────────

static TodoStore g_store;
static std::atomic<bool> g_data_changed{false};

// ── Dispatch ──────────────────────────────────────────────────────────
// Single entry point: method name + JSON args → JSON result.
// Mirrors the Q_INVOKABLE methods in bridge.hpp.

static std::string dispatch(const std::string& method, const std::string& args_json) {
    auto args = parse_json_string_array(args_json);

    if (method == "listLists") {
        return to_json_array(g_store.list_lists());
    }
    if (method == "getList") {
        if (args.empty()) return "{\"error\":\"Missing listId\"}";
        auto detail = g_store.get_list(args[0]);
        return "{\"list\":" + to_json(detail.list) +
               ",\"items\":" + to_json_array(detail.items) + "}";
    }
    if (method == "addList") {
        if (args.empty()) return "{\"error\":\"Missing name\"}";
        auto list = g_store.add_list(args[0]);
        g_data_changed.store(true);
        return to_json(list);
    }
    if (method == "addItem") {
        if (args.size() < 2) return "{\"error\":\"Missing listId or text\"}";
        auto item = g_store.add_item(args[0], args[1]);
        g_data_changed.store(true);
        return to_json(item);
    }
    if (method == "toggleItem") {
        if (args.empty()) return "{\"error\":\"Missing itemId\"}";
        auto item = g_store.toggle_item(args[0]);
        g_data_changed.store(true);
        return to_json(item);
    }
    if (method == "search") {
        if (args.empty()) return "{\"error\":\"Missing query\"}";
        return to_json_array(g_store.search(args[0]));
    }

    return "{\"error\":\"Unknown method: " + escape_json(method) + "\"}";
}

// ── JNI exports ───────────────────────────────────────────────────────

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_delightful_shell_NativeBridge_invoke(
    JNIEnv* env, jobject /* this */,
    jstring j_method, jstring j_args_json
) {
    const char* method_raw = env->GetStringUTFChars(j_method, nullptr);
    const char* args_raw = env->GetStringUTFChars(j_args_json, nullptr);

    std::string result = dispatch(method_raw, args_raw);

    env->ReleaseStringUTFChars(j_method, method_raw);
    env->ReleaseStringUTFChars(j_args_json, args_raw);

    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jboolean JNICALL
Java_com_delightful_shell_NativeBridge_consumeDataChanged(
    JNIEnv* /* env */, jobject /* this */
) {
    return g_data_changed.exchange(false) ? JNI_TRUE : JNI_FALSE;
}

} // extern "C"
