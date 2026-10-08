import { getModuleTokenLabel, ModuleBase, ModuleInstance, ModuleKey } from "./module-base";

export class ModuleManager {
    private readonly m_modules = new Map<ModuleKey, ModuleBase>();

    get<K extends ModuleKey>(token: K): ModuleInstance<K> | null {
        const module = this.m_modules.get(token);
        if (!module) {
            console.error(`Module is not registered: ${getModuleTokenLabel(token)}`);
            return null;
        }
        return module as ModuleInstance<K>;
    }

    has(token: ModuleKey): boolean {
        return this.m_modules.has(token);
    }

    register<K extends ModuleKey>(token: K, module: ModuleBase & NoInfer<ModuleInstance<K>>): void {
        const current = this.m_modules.get(token);
        if (current) {
            console.error(`Module has already been registered: ${getModuleTokenLabel(token)}`);
        }
        this.m_modules.set(token, module);
    }

    unregister<K extends ModuleKey>(token: K, module?: ModuleBase & NoInfer<ModuleInstance<K>>): void {
        const current = this.m_modules.get(token);
        if (!current) return;
        if (module && current !== module) return;
        this.m_modules.delete(token);
    }
}

export const mods = new ModuleManager();
