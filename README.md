# dsh-web-search-generic

A generic Bing search provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) — **free, no API key needed**.

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的通用 Bing 搜索提供方 —— **免费，无需 API Key**。

> 本 README 为中英双语：英文原文在前，中文译文紧随其后。
> This README is bilingual: English first, Chinese translation follows.

## Install 安装

```sh
# 通过 npm 安装（推荐，发布后可用）/ Via npm (recommended, once published)
dsh plugin --profile web add dsh-web-search-generic

# 或从本地目录安装 / Or from a local folder
dsh plugin --profile web add file:/path/to/dsh-web-search-generic
```

Then add to your profile's `cordis.patch.yml`:

再把它加到 profile 的 `cordis.patch.yml`：

```yaml
- id: web
  config:
    searchProvider: generic-search

- id: web-search-generic
  config:
    backend: bing
    maxResults: 8
```

Restart `dsh web` — the `web_search` tool will now use Bing search without requiring any API key.

重启 `dsh web` —— `web_search` 工具此后将使用 Bing 搜索，且不需要任何 API Key。

## How it works 工作原理

The provider first requests Bing's **RSS** output (`&format=rss`), which is
stable, compact, and free of markup noise. If RSS is unavailable or returns no
items, it falls back to scraping the HTML results page, taking each result's
title from the `<h2>` anchor, decoding HTML entities (`&ensp;`, `&#0183;`, …),
unwrapping Bing redirect links, and de-duplicating URLs.

该提供方会先请求 Bing 的 **RSS** 输出（`&format=rss`）：它稳定、紧凑、没有标记噪音。
如果 RSS 不可用或没有返回条目，就回退为抓取 HTML 结果页 —— 从 `<h2>` 锚点提取每条结果的标题、
解码 HTML 实体（`&ensp;`、`&#0183;` 等）、拆掉 Bing 的跳转链接，并对 URL 去重。

## Prerequisites 前置要求

- DSH 0.1.0-rc.6 or newer; tested against 0.1.0-rc.8 and 0.2.0-rc.2
- Network access to `www.bing.com`

- DSH 0.1.0-rc.6 或更高版本；已在 0.1.0-rc.8 与 0.2.0-rc.2 上测试
- 能够访问 `www.bing.com`

## Compatibility 兼容性

This plugin declares **no `@deepseek-ai/dsh*` peer dependencies**, so DSH's
profile compatibility preflight (and the plugin market's peer gate) never
denies it, on any runtime version. DSH packages are imported from the running
runtime through the profile's `node_modules` resolution base, so a DSH upgrade
never requires reinstalling or re-granting an exemption for this plugin.

本插件**不声明任何 `@deepseek-ai/dsh*` peer 依赖**，所以在任何运行时版本下，
DSH 的 profile 兼容性预检（以及插件市场的 peer 门禁）都不会拒绝它。
DSH 各包通过 profile 的 `node_modules` 解析基准从运行中的运行时导入，
因此升级 DSH 后无需为本插件重装或重新申请豁免。

At activation the plugin verifies that `ctx.web.registerSearchProvider` exists
and throws a descriptive error if a future DSH version renames that seam.

激活时插件会校验 `ctx.web.registerSearchProvider` 是否存在；
如果未来 DSH 版本重命名了该接缝，会抛出带说明的错误。

## License 许可

MIT
