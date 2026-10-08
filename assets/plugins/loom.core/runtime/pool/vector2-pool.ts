/** 临时 Vector2 对象池。 */
export class Vector2Pool {
    private readonly items: Laya.Vector2[] = [];

    rent(x = 0, y = 0): Laya.Vector2 {
        const value = this.items.pop() ?? new Laya.Vector2();
        value.x = x;
        value.y = y;
        return value;
    }

    release(value: Laya.Vector2): void {
        if (typeof DEBUG !== "undefined" && DEBUG && this.items.includes(value)) {
            console.error("Vector2Pool: duplicate release", value);
            return;
        }
        this.items.push(value);
    }
}
