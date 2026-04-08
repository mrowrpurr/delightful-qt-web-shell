-- Capture at parse time — globals aren't available inside before_build closures
local _APP_NAME    = APP_NAME
local _APP_SLUG    = APP_SLUG
local _APP_ORG     = APP_ORG
local _APP_VERSION = APP_VERSION

-- ── Web apps to build and embed ──────────────────────────────────────
-- Each entry becomes a separate Vite build + Qt resource bundle.
-- Add/remove entries here to control which web apps ship in the binary.
local WEB_APPS = {"main", "docs"}

target("desktop")
    set_kind("binary")
    add_rules("qt.widgetapp")
    add_deps("qt-bridges", "web-shell")
    add_files("src/**.cpp", "src/**.hpp")
    add_files(
        "resources/resources.qrc",
        "web_dist_resources.cpp"
    )
    add_includedirs("src")
    if is_plat("windows") then
        set_filename(APP_NAME .. ".exe")
        add_files("resources/app.rc")
    elseif is_plat("macosx") then
        set_filename(APP_NAME)
    else
        set_filename(APP_SLUG)
    end
    add_packages("qlementine-icons", "libsass")
    add_frameworks(
        "QtWidgets", "QtGui",
        "QtWebEngineCore", "QtWebEngineWidgets", "QtWebChannel",
        "QtNetwork"  -- QLocalServer/QLocalSocket for single-instance guard
    )
    add_defines('APP_NAME="' .. APP_NAME:gsub('"', '\\"') .. '"')
    add_defines('APP_SLUG="' .. APP_SLUG:gsub('"', '\\"') .. '"')
    add_defines('APP_ORG="' .. APP_ORG:gsub('"', '\\"') .. '"')
    add_defines('APP_VERSION="' .. APP_VERSION:gsub('"', '\\"') .. '"')

    -- Point at the repo's styles folder for live SCSS reload during development.
    -- Not set in CI (no STYLES_DEV_PATH define → falls back to QRC embedded themes).
    if not os.getenv("CI") then
        local styles_path = path.join(os.projectdir(), "desktop", "styles"):gsub("\\", "/")
        add_defines('STYLES_DEV_PATH="' .. styles_path .. '"')
    end

    before_build(function(target)
        local base = os.scriptdir()
        local project_root = os.projectdir()
        local web_dir = path.join(project_root, "web")
        local qrc_path = path.join(base, "web_dist.qrc")
        local cpp_path = path.join(base, "web_dist_resources.cpp")

        -- ── Skip Vite build when SKIP_VITE=1 ──────────────────────
        -- Use this when iterating on C++ only — saves ~30s per build.
        -- Requires a previous Vite build (web_dist_resources.cpp must exist).
        local skip_vite = os.getenv("SKIP_VITE") == "1" and os.isfile(cpp_path)
        if skip_vite then
            print("⚡ SKIP_VITE=1 — skipping Vite build (using existing web bundle)")
        else
            if os.getenv("SKIP_VITE") == "1" then
                print("⚠️  SKIP_VITE=1 but no previous web build found — building anyway")
            end

            -- Pass APP_NAME to Vite so index.html and React can use it
            os.setenv("VITE_APP_NAME", _APP_NAME)

            -- ── Build each web app ───────────────────────────────────
            -- Each app lives in web/apps/<name>/ with its own vite.config.ts.
            -- Always rebuild — Vite is fast (~3s) and stamp files are a footgun.
            -- Vite can import files from anywhere (?raw imports from root, docs/, etc.)
            -- so there's no reliable way to detect "nothing changed" without Vite itself.
            local all_qrc_lines = {'<RCC>'}

            os.execv("bun", {"install"}, {curdir = web_dir})

            for _, app_name in ipairs(WEB_APPS) do
                local app_dir = path.join(web_dir, "apps", app_name)
                local dist_dir = path.join(app_dir, "dist")

                os.execv("bun", {"run", "build:" .. app_name}, {curdir = web_dir})

                -- Add this app's dist files to the qrc with prefix /web-<name>
                table.insert(all_qrc_lines, '    <qresource prefix="/web-' .. app_name .. '">')
                for _, f in ipairs(os.files(path.join(dist_dir, "**"))) do
                    local rel = path.relative(f, dist_dir):gsub("\\", "/")
                    local abs = path.absolute(f):gsub("\\", "/")
                    table.insert(all_qrc_lines, '        <file alias="' .. rel .. '">' .. abs .. '</file>')
                end
                table.insert(all_qrc_lines, '    </qresource>')
            end

            table.insert(all_qrc_lines, '</RCC>')

            -- Write a single qrc containing all web apps
            io.writefile(qrc_path, table.concat(all_qrc_lines, "\n") .. "\n")

            -- Compile the .qrc into a .cpp via rcc
            --    Windows: bin/rcc.exe    macOS/Linux: libexec/rcc (since Qt 6.1)
            local qt_dir = target:data("qt.dir") or get_config("qt")
            local rcc
            if is_host("windows") then
                rcc = path.join(qt_dir, "bin", "rcc.exe")
            else
                rcc = path.join(qt_dir, "libexec", "rcc")
                if not os.isfile(rcc) then
                    rcc = path.join(qt_dir, "bin", "rcc")
                end
            end
            os.runv(rcc, {"-o", cpp_path, qrc_path})
        end

        -- Generate Windows resource file (app.rc) from APP_NAME/APP_SLUG
        if is_plat("windows") then
            local version = _APP_VERSION
            local version_parts = version:split("%.")
            local v1 = version_parts[1] or "0"
            local v2 = version_parts[2] or "0"
            local v3 = version_parts[3] or "0"
            local rc_content = '// Auto-generated by xmake — do not edit manually\n'
                .. '#include <windows.h>\n\n'
                .. 'IDI_ICON1 ICON "icon.ico"\n\n'
                .. 'VS_VERSION_INFO VERSIONINFO\n'
                .. '    FILEVERSION    ' .. v1 .. ',' .. v2 .. ',' .. v3 .. ',0\n'
                .. '    PRODUCTVERSION ' .. v1 .. ',' .. v2 .. ',' .. v3 .. ',0\n'
                .. '    FILEFLAGSMASK  VS_FFI_FILEFLAGSMASK\n'
                .. '    FILEFLAGS      0\n'
                .. '    FILEOS         VOS_NT_WINDOWS32\n'
                .. '    FILETYPE       VFT_APP\n'
                .. '    FILESUBTYPE    VFT2_UNKNOWN\n'
                .. 'BEGIN\n'
                .. '    BLOCK "StringFileInfo"\n'
                .. '    BEGIN\n'
                .. '        BLOCK "040904B0"\n'
                .. '        BEGIN\n'
                .. '            VALUE "CompanyName",      "' .. _APP_ORG .. '"\n'
                .. '            VALUE "FileDescription",  "' .. _APP_NAME .. '"\n'
                .. '            VALUE "FileVersion",      "' .. version .. '"\n'
                .. '            VALUE "InternalName",     "' .. _APP_SLUG .. '"\n'
                .. '            VALUE "OriginalFilename", "' .. _APP_NAME .. '.exe"\n'
                .. '            VALUE "ProductName",      "' .. _APP_NAME .. '"\n'
                .. '            VALUE "ProductVersion",   "' .. version .. '"\n'
                .. '        END\n'
                .. '    END\n'
                .. '    BLOCK "VarFileInfo"\n'
                .. '    BEGIN\n'
                .. '        VALUE "Translation", 0x0409, 0x04B0\n'
                .. '    END\n'
                .. 'END\n'
            io.writefile(path.join(base, "resources", "app.rc"), rc_content)
        end
    end)

    -- Write the binary path so Playwright desktop tests can find and launch it.
    after_build(function(target)
        io.writefile(path.join(os.projectdir(), "build", ".desktop-binary.txt"), target:targetfile())
    end)
