import type { MiniGameSDK, create } from "./loom.sdk";

declare global {
  /** 加载对应平台的 SDK 脚本后可用，配置由宿主全局 $env 提供。 */
  var __sdk: MiniGameSDK;
  interface Loom {
    /** 使用客户端 create() 包装后可用。 */
    sdk: ReturnType<typeof create>;
  }
  var loom: Loom;
}
