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

The plugin scrapes Bing's HTML search results page and parses them into structured sources. No API key, no registration — works out of the box in any network environment where Bing is accessible.

## Prerequisites

- DSH 0.1.0-rc.6 or newer
- Network access to `www.bing.com`

## License

MIT
