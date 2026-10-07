# Manual Atlas Collector

手工图集收集器。包名：`loom.kits.manual-atlas-collector`，版本：`1.0.1`。将已有 LayaAir `.atlas` 接入编辑器、IDE 预览和发布资源索引，纹理按需加载。

## 安装与配置

在目标项目的包管理器中安装 `loom.kits.manual-atlas-collector-1.0.1.layapkg`。插件首次加载会自动创建：

```text
assets/editorResources/manual-atlas-collector/config.json
```

默认配置包含 `__doc__` 使用说明和空的 `atlases` 数组。`__doc__` 仅作说明，不参与图集收集。填入需要接入的图集 UUID 或相对 `assets` 的路径，也兼容 `res://<UUID>`：

```json
{
  "__doc__": ["atlases 支持图集 UUID、res://<UUID> 或相对 assets 的路径；保存后重新运行预览，发布时完整导出资源。"],
  "atlases": [
    "resources/ui/items.atlas"
  ]
}
```

子图名称、前缀与整图路径读取自 `.atlas`；无需维护独立子图清单。支持对象形式的 `frames`，以及 `meta.image` 中逗号分隔的多页图片；无 `meta.prefix` 时使用图集路径去掉扩展名再加 `/`。

更新、重新加载插件均保留已有配置，包括其原有格式。默认配置不会自动选择项目里的全部图集。配置无效、整图缺失或所选子图路径冲突时会报错。

## 开发与构建

在 loom.kits 根目录执行：

```sh
./build.sh manual-atlas-collector
```

产物位于 `release/plugins/loom.kits.manual-atlas-collector-1.0.1.layapkg`。使用 LayaAir CLI 3.4.1 的原生安装包导出；包包含源码及 `.meta`，没有 `precompile`。

源码开发时，IDE 自动编译注册的脚本；无需在业务入口中 import。一个工程只保留源码或安装包其中一种接入，避免重复注册。演示和项目配置位于插件目录之外，不进入安装包。

## 执行流程

- **Scene**：`manual-atlas-collector-plugin.ts` 在加载时创建缺失配置、注册编辑视图的子图映射，并生成 `bin/manual-atlas-collector.json`。配置和图集变化时更新预览描述。
- **Preview/runtime**：`runtime/manual-atlas-collector-runtime.ts` 通过 `@Laya.regClass()` 成为安装包运行时入口，注册初始化回调。仅在预览环境读取描述并建立映射，纹理仍按需加载。
- **Build**：收集所选图集及整图，通过 `AssetExportConfigType.Atlas` 将前缀和子图列表交给 IDE 写入 `fileconfig.json`。发布运行由引擎加载资源索引；预览描述和项目配置不发布到游戏。

修改图集配置后重新运行预览；发布验证应执行完整资源构建，仅重新编译脚本不会更新资源索引。

## 演示

本仓库 `assets/examples/manual-atlas-collector/` 提供两个子图的最小示例，开发工程配置选择该图集。执行 `npm run build:web` 后，发布 `fileconfig.json` 应包含两个子图映射。

## 从旧包迁移

此插件由 Mistedge 的 `com.mistedge.manual-atlas` 1.0.2 整理而来。目标项目应先移除旧包，再安装本包，并将旧配置的 `atlases` 列表复制到新配置目录。脚本 UUID 保留原身份，因此不要同时加载新旧包。新包不读取旧的项目配置，也不包含 Mistedge 的图集或配置 UUID。

## 兼容性与许可证

本工具工程使用 LayaAir 3.4.1；首次跨版本使用时应验证编辑视图、预览和完整发布构建。MIT，见包内 LICENSE。
