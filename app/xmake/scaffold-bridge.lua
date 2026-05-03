-- Capture at parse time — globals aren't available inside on_run closures
local _TEMPLATE_ROOT = TEMPLATE_ROOT

-- ── Scaffold a new bridge ────────────────────────────────────────────
--
-- xmake run scaffold-bridge settings
--
-- Creates a pure C++ bridge (extending app_shell::Bridge) with def_type
-- DTOs, wires it into application.cpp and test_server.cpp, and creates
-- a TS interface stub.

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
        local dtos_name = snake .. "_dtos"                      -- settings_dtos
        local class_name = slug:gsub("(%a)([%w]*)",             -- SettingsBridge
            function(a, b) return a:upper() .. b end):gsub("-", "") .. "Bridge"

        local root = _TEMPLATE_ROOT
        local hpp_path = path.join(root, "lib", "bridges", "qt", "include", file_name .. ".hpp")
        local dtos_path = path.join(root, "lib", "bridges", "qt", "include", dtos_name .. ".hpp")

        -- ── Guard against overwrite ─────────────────────────────
        if os.isfile(hpp_path) then
            raise(hpp_path .. " already exists!")
        end

        -- ── 1. Create DTOs header ───────────────────────────────
        io.writefile(dtos_path,
            '#pragma once\n\n'
            .. '#include <def_type.hpp>\n\n'
            .. '// Request/response DTOs for ' .. class_name .. '.\n'
            .. '// Each bridge method takes one request struct and returns one response struct.\n'
            .. '//\n'
            .. '// Example:\n'
            .. '//   struct GetDataRequest {\n'
            .. '//       std::string id;\n'
            .. '//   };\n'
            .. '//\n'
            .. '//   struct GetDataResponse {\n'
            .. '//       std::string name;\n'
            .. '//       int count = 0;\n'
            .. '//   };\n')

        -- ── 2. Create bridge header ─────────────────────────────
        io.writefile(hpp_path,
            '#pragma once\n\n'
            .. '#include "' .. dtos_name .. '.hpp"\n'
            .. '#include "bridge.hpp"\n\n'
            .. 'class ' .. class_name .. ' : public app_shell::Bridge {\n'
            .. 'public:\n'
            .. '    ' .. class_name .. '() {\n'
            .. '        // Register methods:\n'
            .. '        //   method("getData", &' .. class_name .. '::getData);\n'
            .. '        //\n'
            .. '        // Register signals — name them after what happened, not "changed":\n'
            .. '        //   signal("itemCreated");\n'
            .. '        //   signal("itemArchived");\n'
            .. '    }\n\n'
            .. '    // Each method takes a request DTO, returns a response DTO.\n'
            .. '    // def_type handles JSON serialization automatically.\n'
            .. '    //\n'
            .. '    // Example:\n'
            .. '    //   GetDataResponse getData(GetDataRequest req) {\n'
            .. '    //       auto result = do_something(req.id);\n'
            .. '    //       emit_signal("itemCreated", result);\n'
            .. '    //       return result;\n'
            .. '    //   }\n'
            .. '};\n')

        -- ── 3. Add #include + registration to application.cpp ──
        local app_cpp = path.join(root, "desktop", "src", "application.cpp")
        local app_content = io.readfile(app_cpp)
        if not app_content:find(file_name, 1, true) then
            app_content = app_content:gsub(
                '// @scaffold:include',
                '// @scaffold:include\n#include "' .. file_name .. '.hpp"')
            app_content = app_content:gsub(
                '// @scaffold:bridge',
                '// @scaffold:bridge\n    auto* ' .. snake .. 'Bridge = new ' .. class_name .. ';\n'
                .. '    shell_->addBridge("' .. slug .. '", ' .. snake .. 'Bridge);')
            io.writefile(app_cpp, app_content)
        end

        -- ── 4. Add #include + registration to test_server.cpp ──
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

        -- ── 5. Create TS interface stub ──────────────────────────
        local ts_path = path.join(root, "web", "shared", "api", slug .. "-bridge.ts")
        io.writefile(ts_path,
            "import { getBridge } from './bridge'\n\n"
            .. "// TypeScript interface for the " .. class_name .. " C++ bridge.\n"
            .. "// Add methods here to match the C++ bridge methods.\n"
            .. "export interface " .. class_name .. " {\n"
            .. "  // getData(req: { id: string }): Promise<{ name: string; count: number }>\n"
            .. "}\n\n"
            .. "export async function get" .. class_name .. "(): Promise<" .. class_name .. "> {\n"
            .. "  return getBridge<" .. class_name .. ">('" .. slug .. "')\n"
            .. "}\n")

        print("")
        print("✅ Scaffolded bridge: " .. class_name)
        print("")
        print("   lib/bridges/qt/include/" .. dtos_name .. ".hpp    ← Request/response DTOs")
        print("   lib/bridges/qt/include/" .. file_name .. ".hpp    ← Bridge (register methods + signals)")
        print("   web/shared/api/" .. slug .. "-bridge.ts        ← TS interface")
        print("")
        print("   Wired into: desktop application.cpp, dev-server test_server.cpp")
        print("")
        print("Next:")
        print("  1. Define request/response structs in the DTOs header")
        print("  2. Write methods on the bridge class, register with method()")
        print("  3. Mirror method signatures in the TS interface")
        print("  4. xmake build desktop")
    end)
