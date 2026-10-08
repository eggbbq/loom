import { getModuleTokenLabel, ModuleBase, ModuleClass, ModuleInstance, ModuleKey, ModuleToken } from "./module-base";
import { ModuleManager, mods } from "./module-manager";

type ScopeModule = {
    readonly token: ModuleKey;
    readonly cls: ModuleClass;
    readonly module: ModuleBase;
};

type RegisteredModuleClass<C extends ModuleClass> = C extends { readonly TOKEN: ModuleToken<infer T> } ? ModuleClass<ModuleBase & T> : ModuleClass;

export class ModuleScope {
    private readonly m_modules = new Map<ModuleKey, ScopeModule>();
    private readonly m_list: ScopeModule[] = [];
    private m_initializedCount = 0;
    private m_startedCount = 0;
    private m_startPromise: Promise<void> | null = null;
    private m_stopPromise: Promise<void> | null = null;
    private m_modulesAdded = false;
    private m_running = false;
    private m_disposed = false;

    constructor(readonly manager: ModuleManager = mods) {
        this.onInit();
    }

    protected onInit() {}

    get running(): boolean { return this.m_running; }
    get disposed(): boolean { return this.m_disposed; }

    register<C extends ModuleClass>(cls: C & RegisteredModuleClass<NoInfer<C>>): InstanceType<C>;
    register<K extends ModuleKey, C extends ModuleClass<ModuleBase & NoInfer<ModuleInstance<K>>>>(token: K, cls: C): InstanceType<C>;
    register(tokenOrClass: ModuleKey, cls?: ModuleClass): ModuleBase {
        if (this.m_startPromise || this.m_running || this.m_disposed) throw new Error("Modules can only be registered before ModuleScope.start().");
        const moduleClass = cls ?? tokenOrClass as ModuleClass;
        if (typeof moduleClass !== "function") throw new Error(`Module class is required for token: ${getModuleTokenLabel(tokenOrClass)}`);
        const token = cls ? tokenOrClass : moduleClass.TOKEN ?? moduleClass;
        if (this.m_modules.has(token)) throw new Error(`Module has already been registered: ${getModuleTokenLabel(token)}`);

        const module = new moduleClass();
        const entry = { token, cls: moduleClass, module };
        this.m_modules.set(token, entry);
        this.m_list.push(entry);
        return module;
    }

    get<K extends ModuleKey>(token: K): ModuleInstance<K> | null {
        if (!this.m_modulesAdded) {
            console.error("Modules cannot access each other before ModuleScope finishes registration.");
            return null;
        }
        const entry = this.m_modules.get(token);
        if (!entry) {
            console.error(`Module has not been registered in this ModuleScope: ${getModuleTokenLabel(token)}`);
            return null;
        }
        return entry.module as ModuleInstance<K>;
    }

    has(token: ModuleKey): boolean {
        return this.m_modules.has(token);
    }

    start(): Promise<void> {
        if (this.m_running) return Promise.resolve();
        if (this.m_disposed) return Promise.reject(new Error("ModuleScope has been disposed."));
        if (!this.m_startPromise) this.m_startPromise = this.startInternal();
        return this.m_startPromise;
    }

    stop(): Promise<void> {
        if (this.m_disposed) return Promise.resolve();
        if (!this.m_stopPromise) this.m_stopPromise = this.stopInternal();
        return this.m_stopPromise;
    }

    private async startInternal(): Promise<void> {
        try {
            for (let i = 0; i < this.m_list.length; i++) {
                const module = this.m_list[i].module;
                $env.log?.loom && console.log(`Initializing module: ${module.constructor.name}`);
                try {
                    await module.$init(this);
                    this.m_initializedCount = i + 1;
                } catch (error) {
                    await this.tryDispose(module);
                    console.error(`Failed to initialize module: ${module.constructor.name}`, error);
                }
            }

            for (const entry of this.m_list) {
                $env.log?.loom && console.log(`Registering module: ${entry.module.constructor.name}`);
                this.manager.register(entry.token, entry.module);
            }
            this.m_modulesAdded = true;

            for (const entry of this.m_list) {
                $env.log?.loom && console.log(`Adding module: ${entry.module.constructor.name}`);
                try {
                    await entry.module.$add();
                } catch (error) {
                    console.error(`Failed to add module: ${entry.module.constructor.name}`, error);
                }
            }

            for (let i = 0; i < this.m_list.length; i++) {
                const module = this.m_list[i].module;
                $env.log?.loom && console.log(`Starting module: ${module.constructor.name}`);
                try {
                    await module.$start();
                    this.m_startedCount = i + 1;
                } catch (error) {
                    await this.tryStop(module);
                    console.error(`Failed to start module: ${module.constructor.name}`, error);
                }
            }
            this.m_running = true;
        } catch (error) {
            await this.rollback();
            this.unregisterModules();
            this.m_disposed = true;
            throw error;
        }
    }

    private async stopInternal(): Promise<void> {
        if (this.m_startPromise) {
            try {
                await this.m_startPromise;
            } catch {
                return;
            }
        }

        const errors: unknown[] = [];
        this.m_running = false;
        await this.stopStarted(errors);
        await this.disposeInitialized(errors);
        this.unregisterModules();
        this.m_disposed = true;
        if (errors.length > 0) throw errors[0];
    }

    private async rollback(): Promise<void> {
        const ignored: unknown[] = [];
        await this.stopStarted(ignored);
        await this.disposeInitialized(ignored);
    }

    private async stopStarted(errors: unknown[]): Promise<void> {
        for (let i = this.m_startedCount - 1; i >= 0; i--) {
            try {
                await this.m_list[i].module.$stop();
            } catch (error) {
                errors.push(error);
                console.error(`[ModuleScope] stop failed: ${this.m_list[i].cls.name}`, error);
            }
        }
        this.m_startedCount = 0;
    }

    private async disposeInitialized(errors: unknown[]): Promise<void> {
        for (let i = this.m_initializedCount - 1; i >= 0; i--) {
            try {
                await this.m_list[i].module.$dispose();
            } catch (error) {
                errors.push(error);
                console.error(`[ModuleScope] dispose failed: ${this.m_list[i].cls.name}`, error);
            }
        }
        this.m_initializedCount = 0;
    }

    private async tryStop(module: ModuleBase): Promise<void> {
        try {
            await module.$stop();
        } catch (error) {
            console.error(`[ModuleScope] startup rollback failed: ${module.constructor.name}`, error);
        }
    }

    private async tryDispose(module: ModuleBase): Promise<void> {
        try {
            await module.$dispose();
        } catch (error) {
            console.error(`[ModuleScope] initialization rollback failed: ${module.constructor.name}`, error);
        }
    }

    private unregisterModules(): void {
        for (let i = this.m_list.length - 1; i >= 0; i--) {
            const entry = this.m_list[i];
            this.manager.unregister(entry.token, entry.module);
        }
        this.m_modulesAdded = false;
    }
}
