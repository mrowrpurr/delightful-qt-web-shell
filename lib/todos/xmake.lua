target("todos")
    set_kind("headeronly")
    add_headerfiles("include/(**.hpp)")
    add_includedirs("include", {public = true})

target("todos-ffi")
    set_kind("shared")
    set_default(false)
    add_deps("todos")
    add_files("src/todo_store_ffi.cpp")
    add_packages("nlohmann_json")
    after_build(function(target)
        io.writefile(
            path.join(os.projectdir(), "build", ".todos-ffi-lib.txt"),
            target:targetfile()
        )
    end)
