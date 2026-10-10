# Platform

本目录是 Loom 仓库内的独立 TypeScript 工程，从 `jy_minigame_sdk` 迁入。它提供微信、抖音的具体 SDK 实现；`assets/plugins/loom.sdk` 负责向 Laya 项目生成可修改的适配器，两个工程独立构建。

在仓库根目录可执行 `npm ci --prefix platform`、`npm run platform:check` 与 `npm run platform:build`。小游戏加载下方对应平台 JS 后，可通过生成的 `loom.sdk.init(config)` 使用统一接口；适配器读取全局 `__sdk` 并将初始化配置传入全局 `$env`。平台构建产物与依赖缓存不入库、不进入插件安装包。

1. 这个是一个ts项目
2. 用于适配不同小游戏平台的SDK
3. 设计以微信/抖音的API为基准适配
4. 它的主要目的是提供一层统一的API接口，屏蔽不同平台的差异
5. 最终构建生成一个对应平台的js文件，供小游戏使用，小游戏通过引入这个js文件来使用SDK
6. 构建检查和打包需要提供 sh 脚本调用
7. 项目构建建立在 nodejs npm 生态上

## 快速开始

使用 Node.js 20+ 和 npm，首次安装依赖：

```sh
npm ci
```

类型检查并构建全部平台：

```sh
sh scripts/build.sh
```

只构建指定平台：

```sh
sh scripts/build.sh wechat
sh scripts/build.sh douyin
```

也可以使用 `npm run typecheck` 单独检查类型，或使用 `npm run build -- wechat` 单独打包。`npm test` 构建并执行模拟平台测试；`npm run check` 执行类型检查、全部平台构建和测试。

## 构建产物与使用

构建同时将 `src/loom.sdk.ts` 原样复制到 `dist/loom.sdk.ts`，生成 `dist/loom.sdk.d.ts`（包含类型、`create` 函数声明及全局 `loom.sdk` 声明）。平台脚本命名为 `loom.<平台>.js`，单独构建某个平台时也会输出模板和声明文件。

每个平台生成一个无外部依赖的自执行 JS 文件。脚本执行后自动将平台适配器挂载到全局 `__sdk`：优先使用小游戏的 `GameGlobal`，其他环境使用 `globalThis`。不需要读取模块导出。

| 平台 | 产物 | 原生对象 |
| --- | --- | --- |
| 微信 | `dist/loom.wechat.js` | `wx` |
| 抖音 | `dist/loom.douyin.js` | `tt` |

将对应文件复制到小游戏项目后使用（路径按实际位置调整）：

```js
// 在小游戏入口加载对应平台脚本。
require('./libs/loom.wechat.js');
```

Laya 工程使用 `loom.sdk` 插件生成的适配器，随后调用 `loom.sdk.init({ appid: '游戏 appid', debug: false })`。其他 TypeScript 工程可复制 `dist/loom.sdk.ts`，在业务入口安装客户端模板：

```ts
import { create } from './loom.sdk';

create();
loom.sdk.init({ appid: '游戏 appid', debug: false });
console.log(loom.sdk.platform);
```

两种接入方式均保留已有的 `loom` 成员。Laya 工程已生成适配器时，使用该适配器的类型声明即可，无需再复制独立客户端模板及其声明。

平台由构建入口确定，不进行运行时自动识别。微信产物仅在微信小游戏中加载，直接调用原生 `wx` API。抖音产物同样直接调用 `tt` API，两个平台使用相同的 `__sdk` 接口。

## 微信接入

构建时同时生成两个平台共用的 `dist/loom.sdk.d.ts`，包含接口注释、参数类型及全局 `__sdk` 声明，无需安装平台类型包。客户端声明包含初始化所需的 `IENV` 配置类型，不声明全局 `$env`。

客户端将 `loom.sdk.d.ts` 复制到项目源码目录并纳入 `tsconfig.json` 的 `include`，即可获得类型提示；也可在代码中显式引用：

```ts
/// <reference path="./loom.sdk.d.ts" />

__sdk.login({ success() {}, fail() {} });
```

声明文件只提供类型，运行时仍需加载对应平台的 JS。单独构建某个平台时也会生成 `loom.sdk.d.ts`。

微信运行时直接提供 `wx`，`minigame-api-typings` 仅用于编译时类型检查。当前广告封装使用多例模式及销毁 API，需微信基础库 2.8.0+，并在小游戏后台开通对应广告能力、取得本游戏的广告位 ID。

### 初始化与登录

```js
require('./libs/loom.wechat.js');

globalThis.$env = {
  appid: '替换为本游戏的 appid',
  debug: false,
  interstitialAdUnitId: '替换为真实插屏广告位 ID',
  rewardedVideoAdUnitId: '替换为真实激励视频广告位 ID',
  share: {
    title: '一起来玩吧',
    imageUrl: 'images/share.png',
    query: 'from=invite',
  },
};
__sdk.init();

function login() {
  __sdk.login({
    timeout: 10000,
    success() {
      // 微信登录成功。
    },
    fail() {
      // 登录失败，详情由 SDK 输出日志。
    },
  });
}
```

平台代码直接访问宿主提供的全局 `$env`，不需要 import。`src/loom.sdk.ts` 定义配置类型，各平台源文件声明宿主的 `$env`，`src/loom.global.d.ts` 提供 `__sdk` 与 `loom.sdk` 的全局类型。宿主可在加载脚本前或初始化前设置 `globalThis.$env`；SDK 不创建或覆盖配置，初始化时缺少 `$env` 会报告配置错误。广告位及默认分享配置在调用时读取，修改或替换 `$env` 后对后续调用生效。

`init()` 不再接收配置参数，只检查全局配置是否存在并标记初始化完成，不会自动登录、请求业务服务器、加载广告或打开分享菜单。广告运行期间不允许重新初始化。业务接口要求先初始化。

`appid` 和 `debug` 作为统一环境配置保留，当前微信原生登录和广告 API 不接收 appid，SDK 也未接入依赖这些字段的业务服务器；登录和激励视频结果日志不受 `debug` 控制。初始化不检查广告 ID。调用广告接口时，ID 未提供或为空字符串则立即调用 `fail` 并返回，不创建广告；有值则直接传给微信 API，不校验格式。

`login()` 接收 `success()` / `fail()` 两个无参数回调，可选 `timeout`，返回 `void`，不提供 Promise。SDK 校验微信返回的 code 后调用成功回调，不向外传递或缓存凭证。成功仅表示微信原生登录成功，业务服务端登录尚未接入；错误详情由 SDK 输出日志。

### 获取用户信息

```js
__sdk.getUserInfo({
  lang: 'zh_CN', // 可选
  success(userInfo) {
    console.log(userInfo.nickName, userInfo.avatarUrl);
  },
  fail() {
    // 获取失败，详情由 SDK 输出日志。
  },
});
```

先调用 `init()`。接口返回 `void`，成功回调接收原生 `userInfo`，失败回调无参数。当前使用 `wx.getUserInfo`，需要用户已授权；此接口不会自动创建授权按钮，未授权时通过 `fail()` 通知，可按下面流程创建按钮。实际头像昵称以微信返回内容为准。

只获取基础资料（`withCredentials: false`），不传出加密凭证，也不将用户资料写入 SDK 日志。抖音的对应行为见下方“抖音接入”。

### 查询授权并创建按钮

```js
// 先初始化；按钮引用保留在页面中，退出页面时调用 button?.destroy()。
let button;
__sdk.getSetting({
  success({ authSetting }) {
    if (authSetting['scope.userInfo'] === true) {
      __sdk.getUserInfo({
        success(userInfo) { console.log(userInfo.nickName); },
        fail() { /* 获取失败 */ },
      });
      return;
    }

    button = __sdk.createUserInfoButton({
      text: '授权头像昵称',
      style: { left: 100, top: 200, width: 200, height: 40 },
      success(userInfo) {
        button?.destroy();
        console.log(userInfo.nickName, userInfo.avatarUrl);
      },
      fail() {
        // 授权失败可提示重试或跳过，不应阻塞游戏。
      },
    });
  },
  fail() {
    // 查询失败，不能当作未授权；可由用户再次触发查询。
  },
});
```

`getSetting()` 使用回调，`authSetting['scope.userInfo']` 保留原生的 `true`（已授权）、`false`（拒绝过）、`undefined`（未询问）状态，不缓存或自动弹窗。

`createUserInfoButton()` 同步返回带 `show()` / `hide()` / `destroy()` 的控制对象；创建失败调用无参数 `fail()` 并返回 `undefined`。位置、尺寸使用屏幕逻辑像素，由游戏按自己的界面设置。默认创建文字按钮，可用 `type: 'image'` 配合 `image` 创建图片按钮。SDK 不会主动调用 `hide()`，初始可见性遵循微信原生行为。

每次点击后，取得用户信息就调用 `success(userInfo)`，拒绝或失败调用 `fail()`，无需再调用 `getUserInfo()`。按钮不会自动销毁，游戏应在成功后或离开页面时销毁；拒绝后可继续点击。销毁会移除监听，重复销毁及销毁后的显隐调用无副作用。查询和创建均需先初始化；抖音的按钮采用异步创建，详见下方。真实授权交互需在微信环境验证。

### 获取启动参数

```js
const launchOptions = __sdk.getLaunchOptionsSync();
console.log(launchOptions.query);             // 分享链接等携带的参数
console.log(launchOptions.scene);             // 启动场景值
console.log(launchOptions.referrerInfo?.appId); // 来源应用（可能不存在）
```

`getLaunchOptionsSync()` 同步返回微信原生启动参数，可在 `init()` 前调用，无需回调或 Promise。返回本次冷启动参数；从后台再次进入的参数监听尚未封装。保留原生字段（如 `shareTicket`），不修改或缓存结果；原生调用异常时直接同步抛出。抖音的对应行为见下方“抖音接入”。

### 插屏广告与激励视频

```js
// 在适当的游戏间歇调用。
function showInterstitial() {
  __sdk.showInterstitialAd({
    success() {
      // 到这里表示插屏已关闭。
    },
    fail(error) {
      console.error('插屏广告失败', error);
    },
  });
}

// 在玩家主动点击领取广告奖励时调用。
function watchRewardedVideo() {
  __sdk.showRewardedVideoAd({
    success() {
      // 完整观看，在这里接入游戏自己的奖励逻辑。
    },
    fail() {
      // 未完整观看或调用失败，不发奖；详情由 SDK 输出日志。
    },
  });
}
```

两个接口必须传入包含 `success` 和 `fail` 两个函数的 options，返回 `void`，不提供 Promise。广告位分别读取 `$env.interstitialAdUnitId` 和 `$env.rewardedVideoAdUnitId`。每次调用创建实例、加载并展示，插屏关闭或激励视频完整观看时调用 `success`；未初始化、配置无效、并发冲突及原生错误均通过 `fail` 通知。每次请求只触发一个结果回调，回调前释放实例、监听和并发锁，同一 SDK 同时只允许一个插屏或激励视频请求。

激励视频的 `success()` 和 `fail()` 均无参数。SDK 内部判断完整观看后调用 `success()`；提前关闭、缺少完成状态或调用错误时调用 `fail()`，具体结果及错误详情由 SDK 输出日志。SDK 不自动发奖，也不自动重试失败的广告。

### 主动分享

```js
// 在玩家点击分享按钮时调用，参数覆盖 $env.share 中的默认分享内容。
__sdk.shareAppMessage({
  title: '来挑战我的分数',
  query: 'from=score&player=' + encodeURIComponent('player-123'),
});
```

`shareAppMessage()` 只发起原生分享，返回 `void`，不提供“分享成功”或“取消”的判断。当前只接入主动分享，右上角菜单分享与朋友圈分享尚未封装。

### 错误与验证

SDK 自身错误使用原生 `Error`，通过 `message` 描述原因。插屏的微信原生错误原样传递，保留 `errCode` / `errMsg`；登录和激励视频只调用无参数的 `fail()`，错误详情记录到 SDK 日志。

同步接口通过 `try/catch` 处理异常；登录和广告通过 options 的 `fail` 回调处理。测试使用模拟微信对象验证构建产物，真实登录、广告填充与分享展示需在微信开发者工具及真机中验证。

对应微信 API 文档：[登录](https://developers.weixin.qq.com/minigame/dev/api/open-api/login/wx.login.html)、[插屏广告](https://developers.weixin.qq.com/minigame/dev/api/ad/wx.createInterstitialAd.html)、[激励视频广告](https://developers.weixin.qq.com/minigame/dev/api/ad/wx.createRewardedVideoAd.html)、[主动分享](https://developers.weixin.qq.com/minigame/dev/api/share/wx.shareAppMessage.html)。实现类型以项目安装的微信官方 `minigame-api-typings` 为依据。

## 抖音接入

加载 `dist/loom.douyin.js`，由游戏提供本平台的 `$env`，再调用 `__sdk.init()`。实现集中在 `src/loom.douyin.ts`，直接调用 `tt`，无运行时依赖。使用授权按钮需要抖音基础库 2.46.0+；真实登录、授权、广告填充及分享需在抖音真机验证。

| 接口 | 抖音适配行为 |
| --- | --- |
| `login` | 使用 `tt.login({ force: true })`，拿到 code 才调用无参数 success；取消登录走 fail。微信专用 timeout 不传给抖音。 |
| `getLaunchOptionsSync` | 返回原生启动参数，scene 保留字符串及前导零，统一类型为 `number \| string`，保留 extra。 |
| `getUserInfo` | 需先成功登录。调用 tt.getUserInfo，首次可能弹出授权提示；不传微信专用 lang，不请求加密凭证。 |
| `getSetting` | 查询 authSetting，保留 true / false / undefined。 |
| `createUserInfoButton` | 使用异步 tt.createInteractiveButton，点击后调用 getUserInfo。将 style.color 映射为 textColor。 |
| 插屏 / 激励视频 | 广告 ID 读取 $env，没有 ID 立即 fail。有 ID 时 load → show，结果通知前等待销毁完成。 |
| 激励视频结果 | 不传 multiton（抖音该字段表示“再得广告”）。优先判断 count > 0；没有 count 时判断 isEnded，失败或未完成只调用无参数 fail。 |
| `shareAppMessage` | 普通 IM 分享映射 title、query、desc、templateId，失败记录日志；图片素材使用审核模板，不传微信 imageUrlId / imageUrl。 |

按钮控制对象会立即返回，可以在原生按钮创建完成前调用 hide 或 destroy。异步创建失败通过 fail 通知，已经返回的控制对象变为无操作；销毁后到达的创建结果会立即释放，也不会继续通知用户资料回调。按钮点击获取资料期间会忽略重复点击，拒绝后允许再次尝试。抖音用户拒绝授权后可能需要在宿主设置页面手动修改权限，SDK 不会自动打开设置页面。

```js
require('./libs/loom.douyin.js');
globalThis.$env = {
  appid: 'tt...',
  debug: false,
  interstitialAdUnitId: '插屏广告位',
  rewardedVideoAdUnitId: '激励视频广告位',
  share: { templateId: '审核通过的模板 ID', title: '一起来玩', query: 'from=invite' },
};
__sdk.init();
__sdk.login({
  success() {
    // 在玩家主动点击头像入口时，调用 getSetting / createUserInfoButton / getUserInfo。
  },
  fail() { /* 登录取消或失败 */ },
});
```

官方依据：[登录](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/open-capacity/log-in/tt-login)、[用户信息](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/open-capacity/log-in/tt-get-user-info)、[授权说明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/authorization)、[交互按钮](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/interface/interaction/interactive-button/create-interactive-button)、[启动参数](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/foundation/system/lifecycle/tt-get-launch-options-sync)、[激励视频创建](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/tt-create-rewarded-video-ad)、[关闭结果](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-on-close)、[异步销毁](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-destroy)、[分享参数](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/open-capacity/retweet/share-param)。

### 跳转抖音侧边栏

在玩家点击“去侧边栏”按钮时调用（需先初始化）：

```ts
__sdk.navigateToSidebar({
  success() {
    // 跳转成功，不代表已经从侧边栏返回，不能据此发放复访奖励。
  },
  fail() {
    // 跳转失败，详情由 SDK 输出日志。
  },
});
```

内部调用 `tt.navigateToScene({ scene: 'sidebar' })`，返回 `void`，两个回调均无参数。微信端直接调用 fail。是否显示入口可由游戏通过 `tt.checkScene` 查询；来源判断使用下面的 `isFromSidebar()`。参见[抖音官方侧边栏指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/Introduction-for-tech)。

### 判断是否从侧边栏进入

```ts
if (__sdk.isFromSidebar()) {
  // 最近一次进入来源是侧边栏；游戏自行处理奖励资格和防重复领取。
}
```

同步返回 boolean，可在 init 前调用，微信恒为 false。抖音脚本加载时立即注册 `tt.onShow`：有进入事件后使用最新参数，否则读取冷启动参数。普通前后台切换（showFrom 为 0）保留此前的实际进入来源；从分享、搜索等其他入口再次进入时会更新为 false。请在 game.js 启动阶段加载 SDK，避免错过早期 onShow 事件。

判定顺序：

- 有来源标记时，以 `launch_from === 'homepage'` 且 location 为 `sidebar_card` 或 `homepage_expand` 为准，覆盖首页侧边栏及侧边栏高价值区。
- 没有来源标记时，按场景 ID 后四位 `1001`、`1036`、`1042` 判断，覆盖不同宿主前缀及 iPad 入口；头条和头条极速版的 `011001` / `061001` 是搜索入口，排除。
- 场景值缺失返回 false。文档中的 `1036` 同时包含个人页入口，因此缺少来源标记时只能按场景表作归类，不能进一步区分其具体位置。

依据：[抖音小游戏场景值](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/framework/scene-value/)、[tt.onShow 来源字段](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/foundation/system/lifecycle/tt-on-show)。

## 项目结构

```text
src/
  loom.global.d.ts      # 全局 __sdk 类型声明
  loom.sdk.ts           # 客户端接入模板与统一接口
  loom.wechat.ts        # 微信完整实现及全局挂载
  loom.douyin.ts        # 抖音完整实现及全局挂载
scripts/
  build.mjs             # 按平台打包
  build.sh              # 类型检查与构建
tests/
  loom.wechat.test.mjs   # 微信构建产物测试
  loom.douyin.test.mjs   # 抖音构建产物测试
dist/                   # 生成目录，不提交版本控制
```

## 当前范围与扩展

微信已接入初始化、启动参数获取、用户信息获取、登录、插屏广告、激励视频广告和主动分享。

每个平台在 `src/` 下只保留一个以平台命名的 TS 文件（如 `loom.wechat.ts`）：使用独立函数实现各项能力，汇总为 `sdk` 后挂载到全局 `__sdk`，构建直接使用该文件作为入口。每个游戏只加载对应平台的脚本，后加载的脚本会覆盖已有的 `__sdk`。业务服务端登录和支付尚未实现。新增能力时先在 `src/loom.sdk.ts` 定义统一接口，再补齐平台实现。新增平台时添加 `src/loom.<平台>.ts`，并更新 `scripts/build.mjs` 的平台列表。
