export interface UIEntity extends Laya.GWidget {
    onInit?(): void;
    onDispose?(): void;
    refresh?(): void;
    show?(dotween?:boolean): Promise<void>;
    onShow?(): void;
    onOpenAnimation?(doTween?: boolean): null | Promise<void>;
    onShown?(): void;

    onHide?(): void;
    hide?(dotween?:boolean): Promise<void>;
    onCloseAnimation?(doTween?: boolean): null | Promise<void>;
    onHidden?(): void;

    close?(): void;

    onBackFront?(): void;
    onPutBackend?(): void;
}

export interface IUIManager {
    open<T extends UIEntity = UIEntity>(address: string, data: any, tween?: boolean): Promise<T | null>;
    open<T extends UIEntity = UIEntity>(panel: T, data: any, tween?: boolean): Promise<T | null>;
    find<T extends UIEntity>(cls: new (...args: any[]) => T): T | null;
    close(uiOrAddress: UIEntity | string, dotween?: boolean): Promise<void>;
    closeAll(): Promise<void>;
    closeExcept(addresses: string[]): Promise<void>;
    disposeOnSceneChanged(): void;
    waitPanelOptionComplete(): Promise<void>;
}

export interface OpenResult<T extends Laya.GWidget> {
    ui: T;
    prefab: string;
    fromCache: boolean;
}

export interface CloseOperation {
    promise: Promise<void>;
    resolve(): void;
    reject(reason?: unknown): void;
    token: object;
    cancelled: boolean;
}
