-- ── Template root ──────────────────────────────────────────────────
-- os.projectdir() returns the repo root, which may be above us.
-- TEMPLATE_ROOT always points at this directory (app/) so every
-- included file can find web/, desktop/, tests/, etc.
TEMPLATE_ROOT = os.scriptdir()

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

add_rules("mode.release", "mode.releasedbg", "mode.debug")
set_defaultmode("releasedbg")
set_languages("c++23")

if is_plat("windows") then
  local runtime = is_mode("debug", "check") and "MDd" or "MD"
  set_runtimes(runtime)
  add_requireconfs("*", { configs = { runtimes = runtime } })
end

add_requires("catch2")
add_requires("libsass")


-- ── For qlementine-icons and def_type───────────────────────────────────────────

add_repositories("BuildWithCollab https://github.com/BuildWithCollab/Packages")
add_requires("qlementine-icons")
add_requires("def_type")

-- ── Framework runtime (bridge base, registry, lifecycle, transports) ────

includes("framework/xmake.lua")

-- ── Domain bridges (move out in Phase 3) ────────────────────────────

includes("lib/todos/xmake.lua")

-- ── Platform-specific targets ───────────────────────────────────────

if is_plat("wasm") then
    includes("wasm/xmake.lua")
else
    includes("lib/bridges/qt/xmake.lua")
    includes("desktop/xmake.lua")
    includes("tests/helpers/dev-server/xmake.lua")
    includes("xmake/setup.lua")
    includes("xmake/scaffold-bridge.lua")
    includes("xmake/dev.lua")
    includes("xmake/dev-wasm.lua")
    includes("xmake/testing.lua")
end
