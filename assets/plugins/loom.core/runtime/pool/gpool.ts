import { Vector2Pool } from "./vector2-pool";
import { Vector3Pool } from "./vector3-pool";

/** 临时计算使用的对象池入口。 */
export const pool = {
    v2: new Vector2Pool(),
    v3: new Vector3Pool()
};
