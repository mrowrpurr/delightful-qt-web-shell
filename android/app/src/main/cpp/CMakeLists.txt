cmake_minimum_required(VERSION 3.22.1)
project("delightful_bridge")

add_library(delightful_bridge SHARED android_bridge.cpp)

# Include the shared TodoStore header from the monorepo
target_include_directories(delightful_bridge PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/../../../../../lib/todos/include
)

target_link_libraries(delightful_bridge
    android
    log
)
