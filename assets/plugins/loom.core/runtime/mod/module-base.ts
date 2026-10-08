import type { ModuleManager } from "./module-manager";
import type { ModuleScope } from "./module-scope";

export type Awaitable<T = void> = T | PromiseLike<T>;

declare const $module: unique symbol;

/** 携带公开接口类型的字符串 token，运行时仍使用原始名称作为注册键。 */
export type ModuleToken<T = unknown> = string & { readonly [$module]: T };

export function moduleToken<T>(name: string): ModuleToken<T> {
    return name as ModuleToken<T>;
}

export type ModuleClass<T extends ModuleBase = ModuleBase> = {
    new (): T;
    readonly TOKEN?: ModuleToken;
};
export type ModuleKey = ModuleClass | ModuleToken;
export type ModuleInstance<K extends ModuleKey> = K extends ModuleToken<infer T> ? T : K extends ModuleClass<infer T> ? T : never;

export function getModuleTokenLabel(token: ModuleKey): string {
    return typeof token === "string" ? token : token.name;
}

/**
 * 模块生命周期：
 * onInit → 注册到 ModuleManager → onAdd → onStart → onStop → onDispose → 注销。
 */
export abstract class ModuleBase {
    protected m_scope: ModuleScope | null = null;
    protected m_added = false;

    protected get scope(): ModuleScope {
        if (!this.m_scope) throw new Error(`${this.constructor.name} has not been initialized.`);
        return this.m_scope;
    }

    protected get mods(): ModuleManager {
        if (!this.m_added) throw new Error(`${this.constructor.name} cannot access other modules before onAdd().`);
        return this.scope.manager;
    }

    /** @internal */
    $init(scope: ModuleScope): Awaitable {
        this.m_scope = scope;
        return this.onInit();
    }

    /** @internal */
    $add(): Awaitable {
        this.m_added = true;
        return this.onAdd();
    }

    /** @internal */
    $start(): Awaitable {
        return this.onStart();
    }

    /** @internal */
    $stop(): Awaitable {
        return this.onStop();
    }

    /** @internal */
    $dispose(): Awaitable {
        return this.onDispose();
    }

    /** 初始化模块自身的数据与内部对象。 */
    protected onInit(): Awaitable {}

    /** 当前作用域的所有模块注册完毕后调用，可以访问其他模块并建立模块间关系。 */
    protected onAdd(): Awaitable {}

    /** 当前作用域的所有模块准备完毕后调用，开始运行。 */
    protected onStart(): Awaitable {}

    /** 停止模块运行。 */
    protected onStop(): Awaitable {}

    /** 释放模块持有的资源。 */
    protected onDispose(): Awaitable {}
}
