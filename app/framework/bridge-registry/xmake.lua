target("app.framework.bridge-registry")
    set_kind("headeronly")
    add_deps("app.framework.bridge", {public = true})
    add_includedirs("include", {public = true})
