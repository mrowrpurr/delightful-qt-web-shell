-- ── WASM dev server ─────────────────────────────────────────────────
-- Copies WASM build artifacts into web/public/ and starts Vite with
-- WASM transport enabled. The React app runs entirely in the browser.
--
-- Usage:
--   xmake f -p wasm && xmake build wasm-app
--   xmake f -p windows --qt=...   (switch back — dev-wasm is a phony target)
--   xmake run dev-wasm

target("dev-wasm")
    set_kind("phony")
    set_default(false)
    on_run(function()
        local root = os.projectdir()
        local wasm_build = path.join(root, "build", "wasm", "wasm32", "release")
        local public_dir = path.join(root, "web", "public")

        -- Verify WASM was built
        local js_file = path.join(wasm_build, "wasm-app.js")
        local wasm_file = path.join(wasm_build, "wasm-app.wasm")
        if not os.isfile(js_file) or not os.isfile(wasm_file) then
            raise("WASM not built. Run: xmake f -p wasm && xmake build wasm-app")
        end

        -- Copy artifacts to web/public/ so Vite serves them
        os.mkdir(public_dir)
        os.cp(js_file, public_dir)
        os.cp(wasm_file, public_dir)
        print("Copied WASM artifacts to web/public/")

        -- Start Vite with WASM transport
        local web_dir = path.join(root, "web")
        local envs = os.getenvs()
        envs["VITE_TRANSPORT"] = "wasm"
        print("Starting Vite with WASM transport...")
        os.execv("bun", {"run", "dev"}, {curdir = web_dir, envs = envs})
    end)
