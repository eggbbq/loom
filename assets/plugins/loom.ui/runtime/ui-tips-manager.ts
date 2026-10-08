const DEFAULT_PREFAB = "resources/ui/Tips.lh";

/** 池化文字提示；具体预制体由消费工程提供。 */
export class UITipsManager {
    static readonly inst = new UITipsManager();
    private _prefab: Laya.PrefabImpl;
    private _loading: Promise<Laya.PrefabImpl>;
    private _pool: Laya.GWidget[] = [];

    constructor(private readonly prefabAddress: string = DEFAULT_PREFAB) {}

    async text(text: string): Promise<void> {
        if (!this._prefab || this._prefab.destroyed) {
            this._loading ??= Laya.loader.load(this.prefabAddress, Laya.Loader.HIERARCHY);
            try { this._prefab = await this._loading; }
            finally { this._loading = null; }
        }
        if (!this._prefab) throw new Error(`[UITipsManager] Prefab unavailable: ${this.prefabAddress}`);

        let inst = this._pool.pop();
        if (!inst || inst.destroyed) {
            const node = this._prefab.create();
            if (!(node instanceof Laya.GWidget)) {
                node?.destroy();
                throw new Error(`[UITipsManager] Prefab root must be a GWidget: ${this.prefabAddress}`);
            }
            inst = node;
        }
        inst.data = text;
        (inst as Laya.GWidget & { _data: unknown })._data = text;
        inst.event("setData", text);
        // 原生 REMOVED 事件不携带节点参数，显式绑定归还的实例。
        inst.once(Laya.Event.REMOVED, this, this.onTipsRemoved, [inst]);
        inst.visible = true;
        Laya.GRoot.inst.addChild(inst);
        inst.active = true;
    }

    private onTipsRemoved(node: Laya.GWidget): void {
        if (node.destroyed) return;
        if (this._pool.length >= 10) node.destroy();
        else this._pool.push(node);
    }
}
