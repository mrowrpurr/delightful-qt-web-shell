-- ── Scaffold a new bridge ────────────────────────────────────────────
--
-- xmake run scaffold-bridge settings
--
-- Drops a new bridge header into lib/bridges/qt/, wires it into main.cpp
-- and test_server.cpp, and creates a TS interface stub.
-- No xmake.lua edits needed — the glob picks up new headers automatically.

target("scaffold-bridge")
    set_kind("phony")
    set_default(false)
    on_run(function()
        import("core.base.option")

        -- ── Parse name ──────────────────────────────────────────
        local args = option.get("arguments") or {}
        local name = args[1]
        if not name or name == "" then
            raise("Usage: xmake run scaffold-bridge <name>\n  e.g. xmake run scaffold-bridge settings")
        end

        -- ── Derive names ────────────────────────────────────────
        -- "settings" → class "SettingsBridge", file "settings_bridge.hpp",
        --              TS bridge name "settings"
        local slug = name:lower():gsub("[^%w]", "-")           -- settings
        local snake = slug:gsub("-", "_")                       -- settings
        local file_name = snake .. "_bridge"                    -- settings_bridge
        local class_name = slug:gsub("(%a)([%w]*)",             -- SettingsBridge
            function(a, b) return a:upper() .. b end):gsub("-", "") .. "Bridge"

        local root = os.projectdir()
        local hpp_path = path.join(root, "lib", "bridges", "qt", "include", file_name .. ".hpp")

        -- ── Guard against overwrite ─────────────────────────────
        if os.isfile(hpp_path) then
            raise(hpp_path .. " already exists!")
        end

        -- ── 1. Create bridge header ────────────────────────────
        io.writefile(hpp_path,
            '#pragma once\n\n'
            .. '#include <QJsonObject>\n'
            .. '#include <QObject>\n'
            .. '#include <QString>\n\n'
            .. 'class ' .. class_name .. ' : public QObject {\n'
            .. '    Q_OBJECT\n\n'
            .. 'public:\n'
            .. '    using QObject::QObject;\n\n'
            .. '    // Add your Q_INVOKABLE methods here.\n'
            .. '    // Example:\n'
            .. '    //   Q_INVOKABLE QJsonObject getData() const { return {{"hello", "world"}}; }\n\n'
            .. 'signals:\n'
            .. '    void dataChanged();\n'
            .. '};\n')

        -- ── 2. Add #include + registration to main.cpp ─────────
        local main_cpp = path.join(root, "desktop", "src", "main.cpp")
        local main_content = io.readfile(main_cpp)
        if not main_content:find(file_name, 1, true) then
            main_content = main_content:gsub(
                '// @scaffold:include',
                '// @scaffold:include\n#include "' .. file_name .. '.hpp"')
            main_content = main_content:gsub(
                '// @scaffold:bridge',
                '// @scaffold:bridge\n    auto* ' .. snake .. 'Bridge = new ' .. class_name .. ';\n'
                .. '    shell->addBridge("' .. slug .. '", ' .. snake .. 'Bridge);')
            io.writefile(main_cpp, main_content)
        end

        -- ── 3. Add #include + registration to test_server.cpp ──
        local test_cpp = path.join(root, "tests", "helpers", "dev-server", "src", "test_server.cpp")
        local test_content = io.readfile(test_cpp)
        if not test_content:find(file_name, 1, true) then
            test_content = test_content:gsub(
                '// @scaffold:include',
                '// @scaffold:include\n#include "' .. file_name .. '.hpp"')
            test_content = test_content:gsub(
                '// @scaffold:bridge',
                '// @scaffold:bridge\n    auto* ' .. snake .. 'Bridge = new ' .. class_name .. ';\n'
                .. '    shell.addBridge("' .. slug .. '", ' .. snake .. 'Bridge);')
            io.writefile(test_cpp, test_content)
        end

        -- ── 4. Create TS interface stub ─────────────────────────
        local ts_path = path.join(root, "web", "src", "api", slug .. "-bridge.ts")
        io.writefile(ts_path,
            "import { getBridge } from './bridge'\n\n"
            .. "// TypeScript interface for the " .. class_name .. " C++ bridge.\n"
            .. "// Add methods here to match Q_INVOKABLE methods on the C++ side.\n"
            .. "export interface " .. class_name .. " {\n"
            .. "  // getData(): Promise<{ hello: string }>\n"
            .. "  dataChanged(callback: () => void): () => void\n"
            .. "}\n\n"
            .. "export async function get" .. class_name .. "(): Promise<" .. class_name .. "> {\n"
            .. "  return getBridge<" .. class_name .. ">('" .. slug .. "')\n"
            .. "}\n")

        print("")
        print("✅ Scaffolded bridge: " .. class_name)
        print("")
        print("   lib/bridges/qt/include/" .. file_name .. ".hpp   ← C++ bridge (add Q_INVOKABLE methods)")
        print("   web/src/api/" .. slug .. "-bridge.ts          ← TS interface (match C++ methods)")
        print("")
        print("   Also wired into: desktop main.cpp, dev-server test_server.cpp")
        print("")
        print("Next: add methods to the .hpp, mirror them in the .ts, then `xmake build desktop`")
    end)
