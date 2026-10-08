import { UIPanel } from "./ui-panel";

export function findUIEntityInParent(node:Laya.Node) {
    while (node) {
        const panel = node.getComponent(UIPanel);
        if (panel) return panel;
        node = node.parent;
    }
    return null;
}