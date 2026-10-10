import type { MiniGameSDK } from "./loom.sdk";

declare global {
  /** 加载对应平台的 SDK 脚本后可用，配置由宿主全局 $env 提供。 */
  var __sdk: MiniGameSDK;
}
