target("web-shell")
    set_kind("headeronly")
    add_headerfiles("include/(**.hpp)")
    add_includedirs("include", {public = true})
