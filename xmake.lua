add_rules("mode.release")
set_defaultmode("release")
set_languages("c++23")

-- Your project stuff goes here!

-- Pure C++ domain libraries — reusable across projects, no Qt/Embind deps.
includes("lib/todos/xmake.lua")

-- And you can pull in the Delightful Qt Web Shell template's xmake:
includes("app/xmake.lua")
