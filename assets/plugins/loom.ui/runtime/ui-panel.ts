import { UIAnimtion, UILayer, UILife, UINavMode } from "./ui-const";

import { UIEntity } from "./ui-types";
import { UIManager } from "./ui-manager";

export const UI_SYMBOL = Symbol("ui");

const { regClass, property } = Laya;

@regClass()
@Laya.classInfo({ menu: "loom/ui" })
export class UIPanel extends Laya.Script {
    @property({type:UILayer}) layer = UILayer.Panel;
    @property({type:UILife}) life = UILife.Scene;
    @property({type:UINavMode}) nav = UINavMode.Default;
    @property({type:UIAnimtion}) anim = UIAnimtion.Both;
    @property(Boolean) center = true;
    @property(Boolean) full = false;
    @property(Boolean) modal = true;

    [UI_SYMBOL]: boolean = true;
    address:string;

    private _entity:UIEntity;
    get entity():UIEntity {
        if (!this._entity) this._entity = this.owner as UIEntity;
        return this._entity;
    }

    close(): void {
        void UIManager.inst.close(this);
    }

    onAwake() {
        try {
            this.entity.onInit?.();
        } catch (error) {
            console.error("onInit error:", this.address, error);
        }
    }

    onDestroy(): void {
        try {
            this.entity.onDispose?.();
        } catch (error) {
            console.error("onDispose error:", this.address, error);
        }
    }

    layout() {
        if (this.full) this.entity.makeFullSize();
        if (this.center) this.entity.center();
        // todo modal
    }

    refresh(data?:any) {
        if(this.entity && !this.entity.destroyed) {
            if (arguments.length > 0) this.entity.data = data;
            try {
                this.entity.refresh?.();
            } catch (error) {
                console.error("refresh error:", this.address, error);
            }
        }
    }

    async show(dotween:boolean = true) {
        dotween = dotween && (this.anim & UIAnimtion.Open) !== 0;
        try {
            this.entity.onShow?.();
        } catch (error) {
            console.error("onShow error:", this.address, error);
        }
        try {
            const animation = this.entity.onOpenAnimation ? this.entity.onOpenAnimation(dotween) : this.onOpenAnimation(dotween);
            if (animation) await animation;
        } catch (error) {
            console.error("onOpenAnimation error:", this.address, error);
        }
        try {
            this.entity.onShown?.();
        } catch (error) {
            console.error("onShown error:", this.address, error);
        }
    }

    protected onOpenAnimation(doTween: boolean = true): Promise<void> {
        const entity = this.entity as UIEntity & {content?:Laya.GWidget};
        const content = entity.content ?? entity;
        if (!doTween) {
            content?.scale(1, 1);
            return Promise.resolve();
        }
        if(content) {
            content.scale(0.3,0.3);
            return Laya.Tween
                .create(content)
                .to("scaleX", 1)
                .to("scaleY", 1)
                .duration(300)
                .waitForCompletion();
        }
        return Promise.resolve();
    }

    async hide(dotween:boolean = true) {
        dotween = dotween && (this.anim & UIAnimtion.Close) !== 0;
        try {
            this.entity.onHide?.();
        } catch (error) {
            console.error("onHide error:", this.address, error);
        }
        try {
            const animation = this.entity.onCloseAnimation ? this.entity.onCloseAnimation(dotween) : this.onCloseAnimation(dotween);
            if (animation) await animation;
        } catch (error) {
            console.error("onCloseAnimation error:", this.address, error);
        }
        try {
            this.entity.onHidden?.();
        } catch (error) {
            console.error("onHidden error:", this.address, error);
        }
    }

    protected onCloseAnimation(doTween: boolean = true): Promise<void> {
        const entity = this.entity as UIEntity & {content?:Laya.GWidget};
        const content = entity.content ?? entity;
        if (!doTween) {
            content?.scale(0.3, 0.3);
            return Promise.resolve();
        }
        if(content) {
            content.scale(1, 1);
            return Laya.Tween
                .create(content)
                .to("scaleX", 0.3)
                .to("scaleY", 0.3)
                .duration(300)
                .waitForCompletion();
        }
        return Promise.resolve();
    }

    putBackend(): void {
        this.owner.active = false;
        try {
            this.entity.onPutBackend?.();
        } catch (error) {
            console.error("onPutBackend error:", this.address, error);
        }
    }

    backFront(): void {
        this.owner.active = true;
        try {
            this.entity.onBackFront?.();
        } catch (error) {
            console.error("onBackFront error:", this.address, error);
        }
    }
}
