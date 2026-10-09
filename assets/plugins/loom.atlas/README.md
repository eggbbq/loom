# Loom Atlas

使用手工制作或外部工具生成的 LayaAir `.atlas` 时，UI 和业务代码通常引用的是子图路径，而这些子图并不是独立的图片文件。要让子图路径在编辑视图、IDE 预览和发布后的游戏中正确解析，需要建立子图到图集的映射，并在发布时收集图集及其整图资源。

Loom Atlas（手工图集收集器）将所选 `.atlas` 接入这三个环节：从图集文件读取子图信息，注册编辑器与预览映射，并写入发布资源索引。只需配置需要使用的图集，无需维护独立子图清单，纹理仍按需加载。

包名：`loom.atlas`，版本：`1.0.1`。

## 安装与配置

执行 `./build.sh loom.atlas`，在目标项目的包管理器中安装 `release/plugins/loom.atlas-1.0.1.layapkg`。插件首次加载会自动创建：

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
./build.sh loom.atlas
```

产物位于 `release/plugins/loom.atlas-1.0.1.layapkg`。使用 LayaAir CLI 3.4.1 的原生安装包导出；包包含预编译 Runtime/Scene JS、类型声明、资源及 `.meta`。

源码开发时，IDE 自动编译注册的脚本；无需在业务入口中 import。一个工程只保留源码或安装包其中一种接入，避免重复注册。演示和项目配置位于插件目录之外，不进入安装包。

## 执行流程与对应源码

- **Scene**：`manual-atlas-collector-plugin.ts` 在加载时创建缺失配置、注册编辑视图的子图映射，并生成 `bin/manual-atlas-collector.json`。配置和图集变化时更新预览描述。
- **Preview/runtime**：`index.ts` 显式加载 `runtime/manual-atlas-collector-runtime.ts`，注册初始化回调；入口保留编译器需要的注册标记。仅在预览环境读取描述并建立映射，纹理仍按需加载。
- **Build**：收集所选图集及整图，通过 `AssetExportConfigType.Atlas` 将前缀和子图列表交给 IDE 写入 `fileconfig.json`。发布运行由引擎加载资源索引；预览描述和项目配置不发布到游戏。

修改图集配置后重新运行预览；发布验证应执行完整资源构建，仅重新编译脚本不会更新资源索引。

## 演示

本仓库 `assets/examples/manual-atlas-collector/` 提供两个子图的最小示例，开发工程配置选择该图集。执行 `npm run build:web` 后，发布 `fileconfig.json` 应包含两个子图映射。

## 兼容性与许可证

本工具工程使用 LayaAir 3.4.1；首次跨版本使用时应验证编辑视图、预览和完整发布构建。MIT，见包内 LICENSE。

默认安装包中的 `loom.atlas.runtime.js` 自动加载并注册预览初始化回调；编辑器代码由 `build~/` 加载。插件不提供 `loom.atlas` 命名空间，业务通过正常子图地址加载纹理。无需为了图集映射在业务中 import。构建结构见仓库的 [安装与构建指南](../../../docs/plugin-distribution.md)，实际验证见 [JS 安装包验证](../../../docs/js-plugin-verification.md)。
