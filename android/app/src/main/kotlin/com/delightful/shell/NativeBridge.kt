package com.delightful.shell

object NativeBridge {
    init {
        System.loadLibrary("delightful_bridge")
    }

    external fun invoke(method: String, argsJson: String): String
    external fun consumeDataChanged(): Boolean
}
