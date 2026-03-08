set_project("agent-tips")
set_version("0.1.0")

add_rules("mode.release")

-- Default to release simply because failed ASSERT causes annoying popups in debug mode :P
set_defaultmode("release")
set_languages("c++23")

-- includes("some/relative/folder/with/lib/or/app")