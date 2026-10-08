const DEFAULT_PREFAB = "resources/ui/Tooltips.lh";

/** 单实例悬浮提示；预制体和具体表现由消费工程提供。 */
export class UIToolTipsManager {
    static readonly inst = new UIToolTipsManager();
    private _prefab: Laya.PrefabImpl;
    private _loading: Promise<Laya.PrefabImpl>;
    private _toolTips: Laya.GWidget;

    constructor(private readonly prefabAddress: string = DEFAULT_PREFAB) {}

    async text(data: string | { text: string; pos?: { x: number; y: number } }): Promise<void> {
        if (!this._prefab || this._prefab.destroyed) {
            this._loading ??= Laya.loader.load(this.prefabAddress, Laya.Loader.HIERARCHY);
            try { this._prefab = await this._loading; }
            finally { this._loading = null; }
        }
        if (!this._prefab) throw new Error(`[UIToolTipsManager] Prefab unavailable: ${this.prefabAddress}`);
        if (!this._toolTips || this._toolTips.destroyed) {
            const node = this._prefab.create();
            if (!(node instanceof Laya.GWidget)) {
                node?.destroy();
                throw new Error(`[UIToolTipsManager] Prefab root must be a GWidget: ${this.prefabAddress}`);
            }
            this._toolTips = node;
        }
        this._toolTips.data = data;
        (this._toolTips as Laya.GWidget & { _data: unknown })._data = data;
        this._toolTips.event("setData", data);
        if (this._toolTips.parent) this._toolTips.removeSelf();
        this._toolTips.visible = true;
        this._toolTips.active = true;
        Laya.GRoot.inst.showPopup(this._toolTips, null, Laya.PopupDirection.Up);
    }
}
