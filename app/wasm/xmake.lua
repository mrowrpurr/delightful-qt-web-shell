target("wasm-app")
    set_kind("binary")
    set_default(false)
    add_deps("app.framework.wasm-transport", "todos-bridge")
    add_files("src/main.cpp", "src/wasm_bindings.cpp")
    add_ldflags("--bind", "-sEXPORT_ES6=1", "-sMODULARIZE=1",
                "-sENVIRONMENT=web", "-sALLOW_MEMORY_GROWTH=1",
                {force = true})
    set_extension(".js")
