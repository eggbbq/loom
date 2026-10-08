function isPointerOverUI(): boolean {
    const uiRoot = Laya.GRoot.inst;
    if (!uiRoot) return false;

    const hitNode = Laya.InputManager.inst.getNodeUnderPoint(Laya.stage.mouseX, Laya.stage.mouseY);
    if (!hitNode || hitNode === Laya.stage) return false;

    let current: Laya.Node | null = hitNode;
    while (current) {
        if (current === uiRoot || current.name === "UIFrame") {
            return true;
        }
        current = current.parent;
    }

    return false;
}

export const uif = {
    isPointerOverUI
}