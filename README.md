# dsh-web-search-generic

A generic Bing search provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) — **free, no API key needed**.

## Install

```sh
# Via npm (recommended, once published)
dsh plugin --profile web add dsh-web-search-generic

# Or from a local folder
dsh plugin --profile web add file:/path/to/dsh-web-search-generic
```

Then add to your profile's `cordis.patch.yml`:

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

## How it works

The provider first requests Bing's **RSS** output (`&format=rss`), which is
stable, compact, and free of markup noise. If RSS is unavailable or returns no
items, it falls back to scraping the HTML results page, taking each result's
title from the `<h2>` anchor, decoding HTML entities (`&ensp;`, `&#0183;`, …),
unwrapping Bing redirect links, and de-duplicating URLs.

## Prerequisites

- DSH 0.1.0-rc.6 or newer; tested against 0.1.0-rc.8 and 0.2.0-rc.2
- Network access to `www.bing.com`

## Compatibility

This plugin declares **no `@deepseek-ai/dsh*` peer dependencies**, so DSH's
profile compatibility preflight (and the plugin market's peer gate) never
denies it, on any runtime version. DSH packages are imported from the running
runtime through the profile's `node_modules` resolution base, so a DSH upgrade
never requires reinstalling or re-granting an exemption for this plugin.

At activation the plugin verifies that `ctx.web.registerSearchProvider` exists
and throws a descriptive error if a future DSH version renames that seam.

## License

MIT
