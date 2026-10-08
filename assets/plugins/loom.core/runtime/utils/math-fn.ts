
/**
 * 计算射线与水平地面 y=groundY 的交点。
 * @param ray 射线
 * @param y 地面高度
 * @param out 输出交点
 * @returns 是否存在交点
 */
function intersectYPlane(ray: Laya.Ray, y: number = 0, out = new Laya.Vector3()): boolean {
    const dirY = ray.direction.y;
    if (Math.abs(dirY) < 1e-6) return false;

    const t = (y - ray.origin.y) / dirY;
    if (t < 0) return false;

    out.x = ray.origin.x + ray.direction.x * t;
    out.y = y;
    out.z = ray.origin.z + ray.direction.z * t;
    return true;
}


type Vec2 = { x: number, y: number };
type Vec3 = { x: number, y: number, z: number };

function distanceXZ(p0: Vec3, p1: Vec3) {
    return Math.sqrt((p0.x - p1.x) ** 2 + (p0.z - p1.z) ** 2);
}

function distanceV2(p0: Vec2, p1: Vec2) {
    return Math.sqrt((p0.x - p1.x) ** 2 + (p0.y - p1.y) ** 2);
}

function distanceV3(p0: Vec3, p1: Vec3) {
    const dx = p0.x - p1.x;
    const dy = p0.y - p1.y;
    const dz = p0.z - p1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export const mathf = {
    intersectYPlane,
    distanceXZ,
    distanceV2,
    distanceV3,
};
