-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  Customize your app:
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APP_NAME    = "Delightful Qt Web Shell"
APP_SLUG    = "delightful-qt-web-shell"
APP_ORG     = "MyOrganization"
APP_VERSION = "0.1.0"
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set_project(APP_SLUG)
set_version(APP_VERSION)

add_rules("mode.release")
set_defaultmode("release")
set_languages("c++23")

if is_plat("windows") then
    set_runtimes("MD")
end

add_requires("catch2 3.x")

-- ── Shared libraries ─────────────────────────────────────────────────

includes("lib/todos/xmake.lua")

-- ── Platform-specific targets ───────────────────────────────────────

if is_plat("wasm") then
    includes("lib/bridges/wasm/xmake.lua")
    includes("wasm/xmake.lua")
else
    includes("lib/web-shell/xmake.lua")
    includes("lib/bridges/qt/xmake.lua")
    includes("desktop/xmake.lua")
    includes("tests/helpers/dev-server/xmake.lua")
    includes("xmake/setup.lua")
    includes("xmake/scaffold-bridge.lua")
    includes("xmake/dev.lua")
    includes("xmake/dev-wasm.lua")
    includes("xmake/testing.lua")
end
