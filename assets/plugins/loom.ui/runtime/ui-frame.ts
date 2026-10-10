import { UILayer } from "./ui-const";

const { regClass, property, runInEditor } = Laya;


@regClass()
@Laya.classInfo({ menu: "loom/ui" })
@runInEditor
export class UIFrame extends Laya.Script {
    private static _inst: UIFrame;
    static get inst() {
        if (!this._inst || this._inst.destroyed || !this._inst.owner || this._inst.owner.destroyed) {
            const node = new Laya.GWidget();
            node.name = "UIFrame";
            const root = Laya.GRoot.inst;
            node.makeFullSize(root);
            node.center(root);
            node.mouseThrough = true;
            root.addChild(node);
            this._inst = node.addComponent(UIFrame);
        }
        return this._inst;
    }

    @property({type: Laya.GWidget }) panel: Laya.GWidget;
    @property({type: Laya.GWidget }) window: Laya.GWidget;
    @property({type: Laya.GWidget }) popup: Laya.GWidget;
    @property({type: Laya.GWidget }) guide: Laya.GWidget;
    @property({type: Laya.GWidget }) top: Laya.GWidget;
    get groot() { return Laya.GRoot.inst; }

    getLayer(layerName:UILayer) {
        switch (layerName) {
            case UILayer.Panel:
                return this.panel;
            case UILayer.Window:
                return this.window;
            case UILayer.Pop:
                return this.popup;
            case UILayer.Guide:
                return this.guide;
            case UILayer.Top:
                return this.top;
            case UILayer.GRoot:
                return this.groot;
            default:
                return this.panel;
        }
    }

    private findOrCreate(name:string): Laya.GWidget {
        const child = this.owner.getChildByName(name);
        if (child && child instanceof Laya.GWidget) {
            return child as Laya.GWidget;
        }
        const widget = new Laya.GWidget();
        this.owner.addChild(widget);
        widget.name = name;
        widget.center(this.owner as any);
        widget.makeFullSize(this.owner as any);

        return widget;
    }

    onEnable(): void {
        UIFrame._inst = this;
        if (!this.panel) this.panel = this.findOrCreate("panel");
        if (!this.window) this.window = this.findOrCreate("window");
        if (!this.popup) this.popup = this.findOrCreate("popup");
        if (!this.guide) this.guide = this.findOrCreate("guide");
        if (!this.top) this.top = this.findOrCreate("top");
    }

    onStart(): void {
        this.owner.name = "UIFrame";
        this.panel.center(this.owner as any);
        this.window.center(this.owner as any);
        this.popup.center(this.owner as any);
        this.top.center(this.owner as any);
        this.guide.center(this.owner as any);

        this.panel.makeFullSize(this.owner as any);
        this.window.makeFullSize(this.owner as any);
        this.popup.makeFullSize(this.owner as any);
        this.top.makeFullSize(this.owner as any);
        this.guide.makeFullSize(this.owner as any);

        this.panel.mouseThrough = true;
        this.window.mouseThrough = true;
        this.popup.mouseThrough = true;
        this.guide.mouseThrough = true;
        this.top.mouseThrough = true;
        this.top.parent.mouseThrough = true;
    }
}