-- Pure C++ — both platforms
includes("bridge/xmake.lua")
includes("bridge-registry/xmake.lua")

if is_plat("wasm") then
    includes("wasm-transport/xmake.lua")
else
    includes("app-lifecycle/xmake.lua")
    includes("qt-transport/xmake.lua")
end
