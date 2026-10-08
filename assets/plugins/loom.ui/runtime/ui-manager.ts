import { UIAnimtion, UILife, UINavMode } from "./ui-const";

import { UIEntity } from "./ui-types";
import { UIFrame } from "./ui-frame";
import { UIPanel } from "./ui-panel";

enum UIState {
    None,
    Showing,
    Shown,
    Hiding,
    Hidden,
}

class PanelHandle {
    loadPromise: Promise<Laya.PrefabImpl | null>;
    address: string;
    generation: number;
    prefab?: Laya.PrefabImpl;
    state: UIState;
    panel?: UIPanel;
    loaded: boolean;
    navBackends: string[];
}

enum PanelOp {
    Show,
    Hide,
}

class PanelOption {
    data?: any;
    tween?: boolean;
    op: PanelOp;
    handle: PanelHandle;
    promise?: Promise<boolean>;
}

export class UIManager {
    static readonly inst: UIManager = new UIManager();
    private static readonly PanelAnimationTimeout = 1000;

    private _panelHandles = new Map<string, PanelHandle>();
    private _panelActives = new Map<string, PanelHandle>();
    private _panelGenerations = new Map<string, number>();
    private _panelGenerationSeed = 0;
    private _panelOptions: PanelOption[] = [];
    private _panelOptionPromise?: Promise<void>;
    private _panelBackendBy = new Map<string, Set<string>>();

    async open<T extends UIEntity = UIEntity>(address: string, data?: any, tween?: boolean): Promise<T | null>;
    async open<T extends UIEntity = UIEntity>(entity: T, data?: any, tween?: boolean): Promise<T | null>;
    async open<T extends UIEntity = UIEntity>(panel: UIPanel, data?: any, tween?: boolean): Promise<T | null>;
    async open(addressOrPanel: string | UIEntity | UIPanel, data: any, tween: boolean = true): Promise<UIEntity | null> {
        if (typeof addressOrPanel === "string") {
            return this.openByAddress(addressOrPanel, data, tween);
        } else if (addressOrPanel) {
            const panel = this.resolvePanel(addressOrPanel);
            return panel ? this.openByPanel(panel, data, tween) : null;
        }
        return null;
    }

    private async openByAddress(address: string, data: any, tween: boolean): Promise<UIEntity | null> {
        let handle = this._panelHandles.get(address);
        if (!handle) {
            handle = this.load(address);
        }

        if (!await this.ensurePanelReady(handle)) return null;
        this._panelActives.set(address, handle);
        if (this.appendPanelOption(handle, PanelOp.Show, data, tween)) {
            await this.waitPanelOptionComplete();
        }
        return this.isHandleShown(handle) ? handle.panel.entity : null;
    }

    private async openByPanel(panel: UIPanel, data: any, tween: boolean): Promise<UIEntity | null> {
        const handle = this._panelHandles.get(panel.address);
        if (!handle) return null;
        if (!await this.ensurePanelReady(handle)) return null;
        if (handle.panel !== panel) return null;
        this._panelActives.set(panel.address, handle);
        if (this.appendPanelOption(handle, PanelOp.Show, data, tween)) {
            await this.waitPanelOptionComplete();
        }
        return this.isHandleShown(handle) ? handle.panel.entity : null;
    }

    find<T extends UIEntity>(cls: new (...args: any[]) => T): T | null {
        for (const handle of this._panelActives.values()) {
            if (!this.isCurrentHandle(handle)) continue;
            if (!this.isHandleReady(handle)) continue;
            if (!this.isPanelVisibleOrOpening(handle)) continue;
            if (handle.panel.entity instanceof cls) return handle.panel.entity as T;
        }
        return null;
    }

    private appendPanelOption(handle: PanelHandle, op: PanelOp, data?: any, tween?: boolean) {
        for (let i = this._panelOptions.length - 1; i >= 0; i--) {
            const option = this._panelOptions[i];
            if (option.handle.address !== handle.address) continue;
            if (option.promise) break;

            if (option.op === op) {
                option.handle = handle;
                option.data = data;
                option.tween = tween;
                return true;
            }

            this._panelOptions.splice(i, 1);
            if (op === PanelOp.Hide && !this.isPanelVisibleOrOpening(handle)) {
                this._panelActives.delete(handle.address);
                return false;
            }
            break;
        }

        if (op === PanelOp.Hide && !this.isPanelVisibleOrOpening(handle)) {
            this._panelActives.delete(handle.address);
            return false;
        }

        const option = new PanelOption();
        option.op = op;
        option.data = data;
        option.tween = tween;
        option.handle = handle;
        this._panelOptions.push(option);
        return true;
    }

    /**
     * 等待面板操作完成. 在外部切换场景关闭UI时调用，确保UI操作完成，在切换
     * @returns
     */
    async waitPanelOptionComplete(): Promise<void> {
        do {
            if (!this._panelOptionPromise) this._panelOptionPromise = this.processPanelOptions();

            const promise = this._panelOptionPromise;
            try {
                await promise;
            } catch (e) {
                console.error("[UIManager] panel option worker failed", e);
            } finally {
                if (this._panelOptionPromise === promise) this._panelOptionPromise = undefined;
            }
        } while (this._panelOptions.length > 0);
    }

    private async processPanelOptions(): Promise<void> {
        while (this._panelOptions.length > 0) {
            const option = this._panelOptions[0];
            try {
                if (!this.isCurrentHandle(option.handle)) continue;

                if (!option.promise) {
                    option.promise = option.op === PanelOp.Show
                        ? this.panelOpen(option.handle, option.data, option.tween)
                        : this.panelClose(option.handle, option.tween);
                }
                const completed = await option.promise;
                if (!completed) this.recoverFailedPanelOption(option);
            } catch (e) {
                console.error(`[UIManager] panel operation failed: ${option.handle.address}`, e);
                this.recoverFailedPanelOption(option);
            } finally {
                const index = this._panelOptions.indexOf(option);
                if (index >= 0) this._panelOptions.splice(index, 1);
            }
        }
    }

    private recoverFailedPanelOption(option: PanelOption): void {
        const handle = option.handle;
        if (!this.isCurrentHandle(handle)) return;

        try {
            this.backFrontPanels(handle);
        } catch (e) {
            console.error(`[UIManager] recover panel navigation failed: ${handle.address}`, e);
        }
        handle.state = UIState.Hidden;
        this._panelActives.delete(handle.address);

        const owner = handle.panel?.owner;
        if (!owner || owner.destroyed) return;
        try {
            owner.removeSelf();
            owner.active = false;
        } catch (e) {
            console.error(`[UIManager] detach failed panel: ${handle.address}`, e);
        }
    }

    private async panelOpen(handle: PanelHandle, data: any, tween: boolean): Promise<boolean> {
        try {
            if (!this.isCurrentHandle(handle)) return false;
            if (handle.state === UIState.Showing || handle.state === UIState.Shown) {
                const panel = handle.panel;
                if (panel && !panel.destroyed && panel.owner && !panel.owner.destroyed && panel.owner.parent) {
                    panel.refresh(data);
                    return true;
                }
                this.backFrontPanels(handle);
                handle.state = UIState.Hidden;
                this._panelActives.delete(handle.address);
            }
            if (!await this.ensurePanelReady(handle)) return false;
            if (!this.isCurrentHandle(handle)) return false;

            const panel = handle.panel;
            handle.navBackends = [];
            tween = (tween ?? true) && ((panel.anim & UIAnimtion.Open) !== 0);

            handle.state = UIState.Showing;
            this._panelActives.set(handle.address, handle);
            const parent = UIFrame.inst.getLayer(panel.layer);
            parent.addChild(panel.owner);
            panel.owner.active = true;
            this.putOtherPanelsBackend(handle);

            panel.layout();
            panel.refresh(data);
            await this.waitPanelAnimation(panel.show(tween), handle.address, "show");
            if (!this.isCurrentHandle(handle) || !this.isHandleReady(handle)) return false;
            this.onPanelOpenComplete(handle);
            return true;
        } catch (e) {
            console.error(`[UIManager] open panel failed: ${handle.address}`, e);
            if (this.isCurrentHandle(handle)) {
                this.backFrontPanels(handle);
                handle.state = UIState.Hidden;
                this._panelActives.delete(handle.address);
            }
            if (handle.panel && !handle.panel.destroyed) {
                handle.panel.owner.removeSelf();
                handle.panel.owner.active = false;
            }
            return false;
        }
    }

    private async panelClose(handle: PanelHandle, tween: boolean): Promise<boolean> {
        if (!this.isCurrentHandle(handle)) return false;
        let completed = false;
        try {
            if (handle.state === UIState.Hiding || handle.state === UIState.Hidden) return true;
            if (!this.isHandleReady(handle)) {
                this._panelActives.delete(handle.address);
                return true;
            }
            const panel = handle.panel;
            tween = (tween ?? true) && ((panel.anim & UIAnimtion.Close) !== 0);

            handle.state = UIState.Hiding;
            await this.waitPanelAnimation(panel.hide(tween), handle.address, "hide");
            if (!this.isCurrentHandle(handle)) return false;
            panel.owner.removeSelf();
            panel.owner.active = false;
            this.onPanelCloseComplete(handle);
            completed = true;
            return true;
        } catch (e) {
            console.error(`[UIManager] close panel failed: ${handle.address}`, e);
            return false;
        } finally {
            if (this.isCurrentHandle(handle)) {
                if (!completed) this.onPanelCloseComplete(handle);
                if (handle.panel && !handle.panel.destroyed) {
                    handle.panel.owner.removeSelf();
                    handle.panel.owner.active = false;
                }
                this._panelActives.delete(handle.address);
            }
        }
    }

    private waitPanelAnimation(promise: Promise<void>, address: string, action: "show" | "hide") {
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                console.warn(`[UIManager] ${action} panel timeout after ${UIManager.PanelAnimationTimeout}ms: ${address}`);
                resolve();
            }, UIManager.PanelAnimationTimeout);

            const finish = (callback: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                callback();
            };

            promise.then(
                () => finish(resolve),
                e => finish(() => reject(e)),
            );
        });
    }

    private onPanelOpenComplete(handle: PanelHandle) {
        handle.state = UIState.Shown;
    }

    private putOtherPanelsBackend(handle: PanelHandle) {
        const panel = handle.panel;
        if (panel.nav !== UINavMode.HideOther) return;
        handle.navBackends = [];
        for (const [address, other] of this._panelActives.entries()) {
            if (address === handle.address) continue;
            if (!this.isPanelActiveVisible(other)) continue;
            if (!other.panel || other.panel.layer !== panel.layer) continue;
            if (other.panel.nav === UINavMode.Ignore) continue;

            let backendBy = this._panelBackendBy.get(address);
            if (!backendBy) {
                backendBy = new Set<string>();
                this._panelBackendBy.set(address, backendBy);
            }
            if (backendBy.size === 0) {
                other.panel.putBackend && other.panel.putBackend();
            }
            backendBy.add(handle.address);
            handle.navBackends.push(address);
        }
    }

    private backFrontPanels(handle: PanelHandle) {
        if (!handle.navBackends) return;
        for (const address of handle.navBackends) {
            const backendBy = this._panelBackendBy.get(address);
            if (!backendBy) continue;
            backendBy.delete(handle.address);
            if (backendBy.size > 0) continue;
            this._panelBackendBy.delete(address);

            const other = this._panelHandles.get(address);
            if (!other || !this.isPanelActiveVisible(other)) continue;
            other.panel.backFront && other.panel.backFront();
        }
        handle.navBackends.length = 0;
    }

    private clearPanelBackendRefs(address: string) {
        this._panelBackendBy.delete(address);
        for (const backendBy of this._panelBackendBy.values()) {
            backendBy.delete(address);
        }
        for (const handle of this._panelHandles.values()) {
            if (!handle.navBackends) continue;
            const index = handle.navBackends.indexOf(address);
            if (index >= 0) handle.navBackends.splice(index, 1);
        }
    }

    private hasPendingShowOption(address: string) {
        return this._panelOptions.some(option =>
            option.handle.address === address && option.op === PanelOp.Show
        );
    }

    private onPanelCloseComplete(handle: PanelHandle) {
        if (!handle) return;
        const address = handle.address;
        this.backFrontPanels(handle);
        handle.state = UIState.Hidden;
        this._panelActives.delete(address);
        if (handle.panel && handle.panel.life === UILife.Temp && !this.hasPendingShowOption(address)) {
            this.disposeHandle(handle);
        }
    }

    async close(address: string, dotween?: boolean): Promise<void>;
    async close(panel: UIPanel | UIEntity, dotween?: boolean): Promise<void>;
    async close(addressOrPanel: string | UIPanel | UIEntity, dotween?: boolean): Promise<void> {
        if (typeof addressOrPanel === "string") {
            return this.closeByAddress(addressOrPanel, dotween);
        } else if (addressOrPanel) {
            const panel = this.resolvePanel(addressOrPanel);
            if (panel) return this.closeByPanel(panel, dotween);
        }
    }

    async closeAll() {
        const invalidHandles: PanelHandle[] = [];
        for (const [address, handle] of this._panelActives.entries()) {
            if (!this.isHandleReady(handle)) {
                invalidHandles.push(handle);
                continue;
            }
            this.appendPanelOption(handle, PanelOp.Hide, null, true);
        }
        for (const handle of invalidHandles) this.disposeHandle(handle);
        const loadingHandles = [...this._panelHandles.values()].filter(handle => !handle.loaded);
        for (const handle of loadingHandles) this.disposeHandle(handle);
        await this.waitPanelOptionComplete();
    }

    async closeExcept(addresses: string[]) {
        const invalidHandles: PanelHandle[] = [];
        for (const [address, handle] of this._panelActives.entries()) {
            if (!addresses.includes(address)) {
                if (!this.isHandleReady(handle)) {
                    invalidHandles.push(handle);
                    continue;
                }
                this.appendPanelOption(handle, PanelOp.Hide, null, true);
            }
        }
        for (const handle of invalidHandles) this.disposeHandle(handle);
        const loadingHandles = [...this._panelHandles.entries()]
            .filter(([address, handle]) => !addresses.includes(address) && !handle.loaded)
            .map(([, handle]) => handle);
        for (const handle of loadingHandles) this.disposeHandle(handle);
        await this.waitPanelOptionComplete();
    }

    /**
     * 调用此方法之前，请确保已经调用了closeAll或closeExcept方法
     */
    disposeOnSceneChanged() {
        const addresses: string[] = [];
        for (const [address, handle] of this._panelHandles.entries()) {
            if (this._panelActives.has(address)) continue;
            if (handle.panel?.life === UILife.Persistent) continue;
            addresses.push(address);
        }
        for (const address of addresses) {
            const handle = this._panelHandles.get(address);
            if (!handle) continue;
            this.disposeHandle(handle);
        }
    }

    private async closeByAddress(address: string, dotween: boolean = true): Promise<void> {
        const handle = this._panelHandles.get(address);
        if (!handle) return;
        if (!this._panelActives.has(address)) {
            if (!handle.loaded) this.disposeHandle(handle);
            return;
        }
        if (!handle.loaded) {
            this.disposeHandle(handle);
            return;
        }
        if (!this.isHandleReady(handle)) {
            this.disposeHandle(handle);
            return;
        }
        if (this.appendPanelOption(handle, PanelOp.Hide, null, dotween)) {
            await this.waitPanelOptionComplete();
        }
    }

    private async closeByPanel(panel: UIPanel, dotween: boolean = true): Promise<void> {
        const handle = this._panelHandles.get(panel.address);
        if (!handle) return;
        if (handle.panel !== panel) return;
        if (!this._panelActives.has(panel.address)) {
            if (!handle.loaded) this.disposeHandle(handle);
            return;
        }
        if (!handle.loaded) {
            this.disposeHandle(handle);
            return;
        }
        if (!this.isHandleReady(handle)) {
            this.disposeHandle(handle);
            return;
        }
        if (this.appendPanelOption(handle, PanelOp.Hide, null, dotween)) {
            await this.waitPanelOptionComplete();
        }
    }

    private isCurrentHandle(handle: PanelHandle) {
        return this._panelHandles.get(handle.address) === handle
            && this._panelGenerations.get(handle.address) === handle.generation;
    }

    private isHandleReady(handle: PanelHandle) {
        const prefab = handle.prefab;
        const panel = handle.panel;
        return handle.loaded && !!prefab && !prefab.destroyed && !!panel && !panel.destroyed && !!panel.owner && !panel.owner.destroyed;
    }

    private isHandleShown(handle: PanelHandle) {
        return this.isCurrentHandle(handle) && this.isHandleReady(handle) && handle.state === UIState.Shown;
    }

    private isPanelVisibleOrOpening(handle: PanelHandle) {
        return handle.state === UIState.Showing || handle.state === UIState.Shown;
    }

    private isPanelActiveVisible(handle: PanelHandle) {
        return this.isCurrentHandle(handle)
            && this.isHandleReady(handle)
            && this._panelActives.get(handle.address) === handle
            && this.isPanelVisibleOrOpening(handle);
    }

    private async ensurePanelReady(handle: PanelHandle) {
        await handle.loadPromise;

        if (!this.isCurrentHandle(handle)) return false;
        if (!handle.prefab || handle.prefab.destroyed) {
            console.error(`[UIManager] panel prefab unavailable: ${handle.address}`);
            this.disposeHandle(handle);
            return false;
        }

        const owner = handle.panel?.owner;
        if (!handle.panel || handle.panel.destroyed || !owner || owner.destroyed) {
            this.backFrontPanels(handle);
            this._panelActives.delete(handle.address);
            handle.state = UIState.None;

            let node: Laya.Node | null = null;
            try {
                node = handle.prefab.create();
                if (!(node instanceof Laya.GWidget)) {
                    console.error(`[UIManager] panel root is not a GWidget: ${handle.address}`);
                    node.destroy();
                    this.disposeHandle(handle);
                    return false;
                }
                const panel = node.getComponent(UIPanel);
                if (!panel) {
                    console.error(`[UIManager] panel missing UIPanel: ${handle.address}`);
                    node.destroy();
                    this.disposeHandle(handle);
                    return false;
                }
                panel.address = handle.address;
                handle.panel = panel;
            } catch (e) {
                console.error(`[UIManager] create panel failed: ${handle.address}`, e);
                if (node && !node.destroyed) node.destroy();
                this.disposeHandle(handle);
                return false;
            }
        }

        handle.loaded = true;
        return true;
    }

    private resolvePanel(panelOrEntity: UIPanel | UIEntity): UIPanel | null {
        if (panelOrEntity instanceof UIPanel) return panelOrEntity;
        return panelOrEntity.getComponent(UIPanel);
    }

    private disposeHandle(handle: PanelHandle) {
        const address = handle.address;
        const current = this.isCurrentHandle(handle);
        if (current) this.backFrontPanels(handle);
        if (handle.panel && !handle.panel.destroyed) {
            handle.panel.owner.removeSelf();
            handle.panel.owner.destroy();
        }
        if (!current) return;

        this.clearPanelBackendRefs(address);
        if (handle.prefab) {
            Laya.loader.clearRes(address, handle.prefab);
        }
        this._panelActives.delete(address);
        this._panelHandles.delete(address);
        this._panelGenerations.delete(address);
    }

    private releaseStaleLoadedPrefab(address: string, prefab: Laya.PrefabImpl | null) {
        if (!prefab) return;
        if (this._panelHandles.has(address)) return;
        Laya.loader.clearRes(address, prefab);
    }

    private async loadPrefab(handle: PanelHandle): Promise<Laya.PrefabImpl | null> {
        try {
            const prefab = await Laya.loader.load(handle.address, Laya.Loader.HIERARCHY);
            if (this.isCurrentHandle(handle)) {
                handle.prefab = prefab;
            } else {
                this.releaseStaleLoadedPrefab(handle.address, prefab);
            }
            return prefab;
        } catch (e) {
            console.error(`[UIManager] load panel failed: ${handle.address}`, e);
            this.disposeHandle(handle);
            return null;
        }
    }

    private load(address: string): PanelHandle {
        const handle = new PanelHandle();
        this._panelHandles.set(address, handle);

        handle.loaded = false;
        handle.address = address;
        handle.generation = ++this._panelGenerationSeed;
        handle.state = UIState.None;
        handle.navBackends = [];
        this._panelGenerations.set(address, handle.generation);
        handle.loadPromise = this.loadPrefab(handle);
        return handle;
    }
}
