# Emby Crx 服务端适配版

[English](README-EN.md) | 简体中文

这是 [Nolovenodie/emby-crx](https://github.com/Nolovenodie/emby-crx) 的服务端适配分支，保留原项目的 Emby Web 首页横幅、媒体库卡片动画和详情入口，并适配 Emby Server 4.9.5.0 的新版首页栏目结构。

## 兼容性

- 已针对 Emby Server `4.9.5.0` 官方安装包中的 `system/dashboard-ui` 做结构校验。
- 不再依赖旧版首页的 `.section0`。
- 按栏目中的 `CollectionFolder` 数据识别媒体库栏目，因此不依赖用户的首页排列顺序。
- 只修改服务器提供的 Emby Web UI；不会改变自带前端资源的电视、手机或其他原生客户端。
- Emby 更新或重建 Docker 容器后，通常需要重新运行安装脚本。

其他 Emby 版本会在浏览器控制台给出提示，但不会被安装脚本仅凭版本号强制阻止。安装脚本会检查实际 dashboard 结构，不符合预期时直接停止。

## 相比原版的主要修复

- 支持 Emby 4.9 的 `.verticalSection` 首页结构。
- 不再永久等待不存在的 `.section0`。
- 页面切换时清理轮播并恢复媒体库栏目位置。
- 使用 `Promise.all` 保证横幅数据完成后再渲染。
- 标题和简介通过 `textContent` 写入，避免直接拼接未经转义的 HTML。
- 图片或 API 加载失败时移除加载层，并输出明确的控制台错误。
- 安装资源全部来自本地 checkout，不再执行远程 `wget | sh`。
- 安装过程自动备份、原子更新且可重复执行；用户配置会在重装时保留。

## Docker / NAS 安装

先克隆本仓库并进入目录：

```sh
git clone https://github.com/hikki-fan/emby-crx.git
cd emby-crx
git switch codex/emby-4.9.5-server
```

默认容器名为 `EmbyServer`，dashboard 路径为 `/system/dashboard-ui`：

```sh
sh server/docker-install.sh EmbyServer /system/dashboard-ui
docker restart EmbyServer
```

安装后在浏览器中强制刷新 Emby Web：

- Windows/Linux：`Ctrl + F5`
- macOS：`Command + Shift + R`

如果容器名称不是 `EmbyServer`，把命令中的第一个参数改为真实容器名。
脚本默认使用容器内的 root 用户修改 `/system`。特殊镜像可以通过
`EMBY_CRX_DOCKER_USER` 环境变量覆盖。

## 非 Docker 安装

在 Emby 服务器本机执行，并把路径改为实际的 dashboard 目录：

```sh
sudo sh server/install.sh /opt/emby-server/system/dashboard-ui
```

常见 Docker 镜像内路径是：

```text
/system/dashboard-ui
```

安装前可以单独检查：

```sh
sh server/check-compatibility.sh /system/dashboard-ui
```

## 配置

首次安装会生成：

```text
/system/dashboard-ui/emby-crx/config.js
```

默认配置：

```javascript
globalThis.EmbyCrxConfig = {
    enabled: true,
    bannerItemCount: 10,
    rotationIntervalMs: 8000,
    initializationTimeoutMs: 30000,
    moveLibrarySectionOnDesktop: true,
    showOverview: true,
    detailButtonText: "MORE",
    includeItemTypes: "Movie,Series",
    sortBy: "ProductionYear,PremiereDate,SortName",
    sortOrder: "Descending",
    maxImageWidth: 3000
};
```

重新执行安装脚本时，现有的 `config.js` 不会被覆盖。新版默认配置保存在同目录的 `config.default.js`。

修改后重启 Emby，并强制刷新浏览器缓存。

## 卸载

Docker：

```sh
sh server/docker-uninstall.sh EmbyServer /system/dashboard-ui
docker restart EmbyServer
```

非 Docker：

```sh
sudo sh /system/dashboard-ui/emby-crx/uninstall.sh /system/dashboard-ui
```

安装时创建的应急备份位于：

```text
/system/dashboard-ui/index.html.emby-crx.backup
```

如果需要完整恢复该备份：

```sh
sh /system/dashboard-ui/emby-crx/uninstall.sh /system/dashboard-ui --restore-backup
```

Docker 完整回退：

```sh
sh server/docker-uninstall.sh EmbyServer /system/dashboard-ui --restore-backup
docker restart EmbyServer
```

备份可能早于后续 Emby 更新，因此正常卸载优先使用默认的“只移除注入块”模式。

## 开发与测试

无需安装第三方 npm 依赖：

```sh
npm run check
npm test
sh tests/server-install.sh
```

测试覆盖首页路由、媒体库语义识别、配置边界、重复安装、配置保留、卸载和备份保留。

## 故障排查

如果首页没有出现横幅：

1. 确认当前用户的首页包含“我的媒体”栏目。
2. 打开浏览器开发者工具，搜索 `[Emby Crx]`。
3. 确认至少有电影或剧集具备 Backdrop 图片。
4. 检查 `index.html` 中是否只有一组 `emby-crx-4.9` 标记。
5. 强制刷新浏览器，必要时清除该 Emby 地址的站点缓存。

如果页面显示“拒绝访问路径 `/dashboard-ui/index.html`”，说明旧版安装
脚本把 `index.html` 留成了仅 root 可读。执行：

```sh
sudo docker exec -u 0 emby chmod 644 /system/dashboard-ui/index.html
sudo docker restart emby
```

然后更新本仓库并重新运行安装脚本。当前版本会保留原文件的所有者和
权限。

## 授权

本项目继承上游的 [MIT License](LICENSE)。视觉设计和原始实现归上游作者所有。
