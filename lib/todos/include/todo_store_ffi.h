#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#ifdef _WIN32
#define TODO_FFI_EXPORT __declspec(dllexport)
#else
#define TODO_FFI_EXPORT __attribute__((visibility("default")))
#endif

TODO_FFI_EXPORT void*       todo_store_create(void);
TODO_FFI_EXPORT void        todo_store_destroy(void* store);
TODO_FFI_EXPORT const char* todo_store_invoke(void* store, const char* method, const char* args_json);
TODO_FFI_EXPORT void        todo_store_free_string(const char* str);

#ifdef __cplusplus
}
#endif
