export {};
// Compile this file with --strict --target ES2020 --module commonjs, then run the emitted JavaScript.
declare const require: (path: string) => any;
declare const process: { exitCode?: number };


const { ModuleBase, moduleToken } = require("../assets/plugins/loom.core/runtime/mod/module-base") as typeof import("../assets/plugins/loom.core/runtime/mod/module-base");
const { ModuleManager } = require("../assets/plugins/loom.core/runtime/mod/module-manager") as typeof import("../assets/plugins/loom.core/runtime/mod/module-manager");
const { ModuleScope } = require("../assets/plugins/loom.core/runtime/mod/module-scope") as typeof import("../assets/plugins/loom.core/runtime/mod/module-scope");

(globalThis as any).$env = { log: { loom: false } };

interface ITestService { getName(): string; }
const TestToken = moduleToken<ITestService>("test:service");
const AliasToken = moduleToken<ITestService>("test:alias");
const calls: string[] = [];

class TestModule extends ModuleBase implements ITestService {
    static readonly TOKEN = TestToken;
    getName(): string { return "test"; }
    protected onInit(): void { calls.push("init"); }
    protected onAdd(): void { calls.push("add"); }
    protected onStart(): void { calls.push("start"); }
    protected onStop(): void { calls.push("stop"); }
    protected onDispose(): void { calls.push("dispose"); }
}

class ClassModule extends ModuleBase {
    readonly value = 7;
}

class WrongModule extends ModuleBase {}
class WrongStaticModule extends ModuleBase { static readonly TOKEN = TestToken; }
class PlainStaticModule extends ModuleBase { static readonly TOKEN = "test:plain"; }
class ExplicitModule extends ModuleBase implements ITestService {
    static readonly TOKEN = moduleToken<{ missing(): void }>("test:overridden");
    getName(): string { return "explicit"; }
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function expectType<T extends true>(): void {}

async function run(): Promise<void> {
    const manager = new ModuleManager();
    const scope = new ModuleScope(manager);
    const registered = scope.register(TestModule);
    const classRegistered = scope.register(ClassModule);
    const service = manager.get(TestToken);
    const classService = manager.get(ClassModule);
    const scopeService = scope.get(TestToken);
    const scopeClass = scope.get(ClassModule);
    expectType<Equal<typeof registered, TestModule>>();
    expectType<Equal<typeof classRegistered, ClassModule>>();
    expectType<Equal<typeof service, ITestService | null>>();
    expectType<Equal<typeof classService, ClassModule | null>>();
    expectType<Equal<typeof scopeService, ITestService | null>>();
    expectType<Equal<typeof scopeClass, ClassModule | null>>();

    if (false) {
        // @ts-expect-error token types cannot be overridden by a caller-specified interface.
        manager.get<{ wrong(): void }>(TestToken);
        // @ts-expect-error bare string keys do not carry a service contract.
        manager.get("test:service");
        // @ts-expect-error the token does not expose Module lifecycle methods.
        manager.get(TestToken)?.$start();
        // @ts-expect-error Manager registration checks the token's service interface.
        manager.register(TestToken, new WrongModule());
        // @ts-expect-error registered implementations must be Modules.
        manager.register(TestToken, { getName: () => "plain" });
        // @ts-expect-error class tokens also check the registered instance.
        manager.register(ClassModule, new WrongModule());
        // @ts-expect-error unregistration checks a supplied implementation against the token.
        manager.unregister(TestToken, new WrongModule());
        // @ts-expect-error explicit Scope tokens check the implementation.
        scope.register(TestToken, WrongModule);
        // @ts-expect-error implicit static tokens check the implementation too.
        scope.register(WrongStaticModule);
        // @ts-expect-error static tokens must be created by moduleToken().
        scope.register(PlainStaticModule);
        // @ts-expect-error plain explicit strings are not typed module tokens.
        scope.register("test:service", TestModule);
        // @ts-expect-error Scope retrieval cannot replace the token's service type.
        scope.get<{ wrong(): void }>(TestToken);
    }

    assert(TestToken === "test:service", "typed tokens retain the original runtime string");
    assert(service === null && scopeService === null, "services are unavailable before startup");
    await scope.start();
    assert(manager.get(TestToken) === registered, "static tokens register the correct instance");
    assert(manager.get(moduleToken<ITestService>("test:service")) === registered, "equal names retain string-key identity");
    assert(!manager.has(TestModule), "static-token modules do not also register by class");
    assert(manager.get(ClassModule)?.value === 7, "class tokens retain type inference and runtime lookup");
    assert(scope.get(TestToken)?.getName() === "test", "Scope supports service token lookup");
    assert(scope.get(ClassModule) === classRegistered, "Scope supports class token lookup");
    assert(calls.join(",") === "init,add,start", "startup lifecycle ordering is preserved");

    const replacement = new TestModule();
    manager.unregister(TestToken, replacement);
    assert(manager.has(TestToken), "a different instance must not unregister the current service");
    await scope.stop();
    assert(!manager.has(TestToken) && !manager.has(ClassModule), "Scope stop removes both token kinds");
    assert(manager.get(TestToken) === null, "stopped services are unavailable");
    assert(calls.join(",") === "init,add,start,stop,dispose", "shutdown lifecycle ordering is preserved");

    const explicitScope = new ModuleScope(manager);
    const explicit = explicitScope.register(AliasToken, ExplicitModule);
    expectType<Equal<typeof explicit, ExplicitModule>>();
    await explicitScope.start();
    assert(manager.get(AliasToken)?.getName() === "explicit", "explicit token overrides a Module's static token");
    assert(!manager.has(ExplicitModule.TOKEN), "overridden static tokens are not registered");
    await explicitScope.stop();

    manager.register(TestToken, registered);
    assert(manager.get(TestToken) === registered, "direct Manager registration accepts service implementations");
    manager.unregister(TestToken, registered);
    assert(!manager.has(TestToken), "direct Manager unregistration removes the implementation");
    console.log("Module token type inference and lifecycle tests passed.");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
