/** 临时 Vector3 对象池。 */
export class Vector3Pool {
    private readonly items: Laya.Vector3[] = [];

    rent(x = 0, y = 0, z = 0): Laya.Vector3 {
        const value = this.items.pop() ?? new Laya.Vector3();
        value.x = x;
        value.y = y;
        value.z = z;
        return value;
    }

    release(value: Laya.Vector3): void {
        if (typeof DEBUG !== "undefined" && DEBUG && this.items.includes(value)) {
            console.error("Vector3Pool: duplicate release", value);
            return;
        }
        this.items.push(value);
    }
}
