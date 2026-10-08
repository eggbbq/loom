export interface UIConfigOptions {
    pop?: boolean;
    center?: boolean;
    full?: boolean;
    modal?: number;
    maskClose?: boolean;
    life?: UILife;
    layer?: UILayer;
    nav?: UINavMode;
}

const UI_CONFIG_OPTION_KEY = Symbol("ui-config-options");

export enum UILayer {
    Panel = "panel",
    Window = "window",
    Pop = "pop",
    Guide = "guide",
    Top = "top",
    GRoot = "groot",
}

export enum UINavMode {
    /**
     * 不影响其他窗体，但是可以被其他窗体影响
     */
    Default = "default",
    /**
     * 把隐藏同一个层级的其他Panel（Ignore除外）
     * hideOther 时候调用 putBackend
     * 当这个窗口关闭时候，会调用 backFront恢复被它putBackend的窗体
     */
    HideOther = "hide-other",

    /**
     * 不受其他窗体影响也不影响其他窗体
     */
    Ignore = "ignore",
}


export enum UILife {
    /**
     * Destroyed when closed.
     * It is usually used for temporary UI components, such as one-time dialogs, popups, etc.
     */
    Temp = 0,

    /**
     * Destroyed when scene changes.
     * It is usually used for scene-specific UI components.
     */
    Scene = 1,

    /**
     * Never destroyed.
     * It is usually used for global UI components, such as toast, loading, etc.
     */
    Persistent = 2,
}

export enum UIAnimtion {
    None = 0,
    Open = 1,
    Close = 2,
    Both = 3,
}