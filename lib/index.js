/**
 * dsh-web-search-generic — Bing search provider for DSH.
 * Scrapes Bing HTML search results (free, no API key needed).
 * @module dsh-web-search-generic
 */

import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";

const name = "web-search-generic";
const inject = ["web"];
const GENERIC_PROVIDER_ID = "generic-search";
const DEFAULT_MAX_RESULTS = 8;

const Config = z.object({
  backend: z.string().default("bing"),
  maxResults: z.number().default(DEFAULT_MAX_RESULTS),
  userAgent: z.string().default("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
});

/**
 * Search Bing via HTML scraping.
 * @param {string} query - search query
 * @param {number} maxResults - max results to return
 * @param {string} userAgent - User-Agent header
 * @param {AbortSignal} [signal] - optional abort signal
 * @returns {Promise<{sources: Array, truncated: boolean}>}
 */
async function searchBing(query, maxResults, userAgent, signal) {
  const url = "https://www.bing.com/search?q=" + encodeURIComponent(query) + "&count=" + Math.min(maxResults, 20);

  let response;
  try {
    response = await fetch(url, {
      signal,
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5"
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new WebError("Search aborted", "WEB_ABORTED");
    }
    throw new WebError("Bing search request failed: " + String(error?.message ?? error), "WEB_PROVIDER_ERROR", { cause: error });
  }

  if (!response.ok) {
    throw new WebError("Bing search returned HTTP " + response.status, "WEB_PROVIDER_ERROR");
  }

  const html = await response.text();
  const sources = [];

  // Parse Bing's <li class="b_algo"> result blocks
  const algoRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let algoMatch;

  while ((algoMatch = algoRegex.exec(html)) !== null && sources.length < maxResults) {
    const block = algoMatch[1];

    // Extract URL and title from <a> tag
    const linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const linkUrl = linkMatch[1].trim();
    const title = linkMatch[2].replace(/<[^>]*>/g, "").trim();
    if (!linkUrl || !title) continue;

    // Extract snippet from <p> tag
    let snippet = "";
    const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) {
      snippet = pMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    }

    sources.push({
      url: linkUrl,
      title: title,
      ...(snippet ? { snippet } : {})
    });
  }

  return { sources, truncated: false };
}

class GenericSearchProvider {
  constructor(resolveOptions) {
    this.resolveOptions = resolveOptions;
    this.id = GENERIC_PROVIDER_ID;
  }

  available() {
    try {
      const options = this.resolveOptions();
      return options.backend === "bing";
    } catch {
      return false;
    }
  }

  async search(request, signal) {
    const options = this.resolveOptions();
    const maxResults = request.maxResults ?? options.maxResults ?? DEFAULT_MAX_RESULTS;

    if (signal?.aborted) {
      throw new WebError("Search aborted", "WEB_ABORTED");
    }

    const result = await searchBing(request.query, maxResults, options.userAgent, signal);

    return {
      sources: result.sources.slice(0, maxResults),
      truncated: result.sources.length > maxResults || result.truncated
    };
  }
}

function apply(ctx, config) {
  const current = () => config;
  ctx.web.registerSearchProvider(new GenericSearchProvider(() => current()));
}

export { Config, GenericSearchProvider, apply, inject, name };
