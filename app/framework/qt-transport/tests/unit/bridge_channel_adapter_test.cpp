#include <catch2/catch_test_macros.hpp>

#include <QCoreApplication>
#include <QSignalSpy>

#include "bridge.hpp"
#include "bridge_channel_adapter.hpp"

namespace {

class TestBridge : public web_shell::bridge {
public:
    TestBridge() {
        signal("foo");
        signal("bar");
    }
    void emit_foo(const nlohmann::json& data = {}) { emit_signal("foo", data); }
};

QCoreApplication& qt_app() {
    static int   argc = 1;
    static char  arg0[] = "bridge-channel-adapter-test";
    static char* argv[] = {arg0, nullptr};
    static QCoreApplication app{argc, argv};
    return app;
}

} // namespace

TEST_CASE("BridgeChannelAdapter subscribes to all bridge signals on construction") {
    qt_app();
    TestBridge b;

    REQUIRE_FALSE(b.has_listeners("foo"));
    REQUIRE_FALSE(b.has_listeners("bar"));

    auto* adapter = new BridgeChannelAdapter(&b);

    REQUIRE(b.has_listeners("foo"));
    REQUIRE(b.has_listeners("bar"));

    delete adapter;
}

TEST_CASE("BridgeChannelAdapter unsubscribes its bridge callbacks when destroyed") {
    qt_app();
    TestBridge b;

    auto* adapter = new BridgeChannelAdapter(&b);
    REQUIRE(b.has_listeners("foo"));
    REQUIRE(b.has_listeners("bar"));

    delete adapter;

    // Without the fix, the bridge still holds lambdas capturing the dangling
    // adapter pointer — the next emit_signal will dereference freed memory.
    REQUIRE_FALSE(b.has_listeners("foo"));
    REQUIRE_FALSE(b.has_listeners("bar"));
}

TEST_CASE("emit_signal is safe to call after BridgeChannelAdapter is destroyed") {
    qt_app();
    TestBridge b;

    auto* adapter = new BridgeChannelAdapter(&b);
    delete adapter;

    // This is the production crash: a surviving caller fires the bridge
    // signal, the dead adapter's lambda runs, QMetaObject::invokeMethod
    // calls object->thread() on freed QObjectPrivate -> 💥.
    REQUIRE_NOTHROW(b.emit_foo({{"hello", "world"}}));
}

TEST_CASE("BridgeChannelAdapter forwards bridge signals as Qt signals while alive") {
    qt_app();
    TestBridge b;
    BridgeChannelAdapter adapter(&b);

    QSignalSpy spy(&adapter, &BridgeChannelAdapter::bridgeSignal);
    b.emit_foo({{"answer", 42}});

    // QueuedConnection — drain the event loop so the spy receives it.
    QCoreApplication::processEvents();

    REQUIRE(spy.count() == 1);
    auto args = spy.takeFirst();
    REQUIRE(args.at(0).toString().toStdString() == "foo");
    auto payload = args.at(1).toString().toStdString();
    REQUIRE(payload.find("\"answer\":42") != std::string::npos);
}
