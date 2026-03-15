// WASM entry point — Emscripten needs a main() but we don't use it.
// All bridge logic is exposed via EMSCRIPTEN_BINDINGS in wasm_bindings.cpp.
int main() { return 0; }
