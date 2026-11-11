/**
 * dsh-web-search-generic — Bing search provider for DSH.
 * Searches Bing without an API key: prefers Bing's stable RSS output and
 * falls back to parsing the HTML results page when RSS is unavailable.
 * @module dsh-web-search-generic
 */

import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";

const name = "web-search-generic";
const inject = ["web"];
const GENERIC_PROVIDER_ID = "generic-search";
const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const Config = z.object({
  backend: z.string().default("bing"),
  maxResults: z.number().default(DEFAULT_MAX_RESULTS),
  userAgent: z.string().default(DEFAULT_USER_AGENT)
});

/** Common named HTML/XML entities seen in Bing output. */
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  ensp: " ", emsp: " ", thinsp: " ", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "'", rsquo: "'", sbquo: "'", ldquo: "\"", rdquo: "\"", bdquo: "\"",
  middot: "·", bull: "•", dagger: "†", deg: "°", copy: "©", reg: "®",
  trade: "™", euro: "€", pound: "£", yen: "¥", sect: "§", para: "¶",
  laquo: "«", raquo: "»", times: "×", divide: "÷", minus: "−", plusmn: "±",
  ne: "≠", le: "≤", ge: "≥", ordf: "ª", ordm: "º", sup2: "²", sup3: "³"
};

/** Decode one numeric code point, dropping dangerous/invalid values. */
function safeCodePoint(code) {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "";
  if (code < 32 && code !== 9 && code !== 10 && code !== 13) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Decode numeric and well-known named entities (&ensp; &#0183; &amp; …). */
function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, entity) ? NAMED_ENTITIES[entity] : match);
}

/** Tags → spaces, then entity decoding, then whitespace collapsing. */
function htmlToText(value) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, " "))
    .replace(/[\s\u200b\u200c]+/g, " ")
    .trim();
}

/** Clean text and cap its length (input is entity-decoded on the way in). */
function truncateText(value, max) {
  const clean = htmlToText(value);
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

/** Inner text of one XML tag, CDATA-aware (no entity decoding yet). */
function xmlText(block, tag) {
  const match = block.match(new RegExp("<" + tag + ">([\s\S]*?)</" + tag + ">", "i"));
  if (!match) return "";
  const inner = match[1];
  const cdata = inner.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : inner;
}

/** Unwrap Bing's /ck/a redirect links to the real target URL. */
function decodeBingRedirect(url) {
  if (!/^https?:\/\/www\.bing\.com\/ck\/a\?/i.test(url)) return url;
  const match = url.match(/[?&]u=a1([A-Za-z0-9_-]+)/);
  if (!match) return url;
  try {
    const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    return /^https?:\/\//i.test(decoded) ? decoded : url;
  } catch {
    return url;
  }
}

/** Parse Bing's RSS output: stable, compact, and entity-clean. */
function parseRss(xml, maxResults) {
  const sources = [];
  const seen = new Set();
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    if (sources.length >= maxResults) break;
    const item = match[1];
    const rawLink = xmlText(item, "link").trim();
    if (rawLink === "") continue;
    const url = decodeBingRedirect(decodeEntities(rawLink));
    const title = truncateText(xmlText(item, "title"), 300);
    if (!/^https?:\/\//i.test(url) || !title) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const description = truncateText(xmlText(item, "description"), 500);
    sources.push({ url, title, ...(description ? { snippet: description } : {}) });
  }
  return sources;
}

/** Fallback: parse Bing's HTML results, taking the title from the <h2> anchor. */
function parseHtml(html, maxResults) {
  const sources = [];
  const seen = new Set();
  for (const match of html.matchAll(/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    if (sources.length >= maxResults) break;
    const block = match[1];
    const link = block.match(/<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      ?? block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = decodeBingRedirect(decodeEntities(link[1]).trim());
    const title = truncateText(link[2], 300);
    if (!/^https?:\/\//i.test(url) || !title) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const paragraph = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = paragraph ? truncateText(paragraph[1], 500) : "";
    sources.push({ url, title, ...(snippet ? { snippet: snippet } : {}) });
  }
  return sources;
}

/** Fetch a URL with the configured headers; wraps failures in WebError. */
async function fetchText(url, userAgent, signal) {
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
    const aborted = signal?.aborted === true
      || (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError");
    if (aborted) throw new WebError("Search aborted", "WEB_ABORTED");
    throw new WebError("Bing search request failed: " + String(error?.message ?? error), "WEB_PROVIDER_ERROR", { cause: error });
  }
  if (!response.ok) {
    throw new WebError("Bing search returned HTTP " + response.status, "WEB_PROVIDER_ERROR");
  }
  return response.text();
}

/**
 * Search Bing. Prefers the stable RSS output; falls back to HTML scraping
 * when RSS is unavailable or returns no items.
 * @param {string} query - search query
 * @param {number} maxResults - max results to return
 * @param {string} userAgent - User-Agent header
 * @param {AbortSignal} [signal] - optional abort signal
 * @returns {Promise<{sources: Array, truncated: boolean}>}
 */
async function searchBing(query, maxResults, userAgent, signal) {
  const requestCount = Math.min(Math.max(maxResults * 2, 10), 30);
  let sources = [];

  try {
    const rssUrl = "https://www.bing.com/search?q=" + encodeURIComponent(query) + "&format=rss&count=" + requestCount;
    const xml = await fetchText(rssUrl, userAgent, signal);
    if (xml.includes("<item>")) sources = parseRss(xml, maxResults);
  } catch (error) {
    if (signal?.aborted) throw error;
    // Any other RSS failure falls through to the HTML path.
  }

  if (sources.length === 0) {
    const htmlUrl = "https://www.bing.com/search?q=" + encodeURIComponent(query) + "&count=" + Math.min(maxResults, 20);
    const html = await fetchText(htmlUrl, userAgent, signal);
    sources = parseHtml(html, maxResults);
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
      truncated: result.truncated
    };
  }
}

function apply(ctx, config) {
  if (typeof ctx.web?.registerSearchProvider !== "function") {
    throw new Error(
      "dsh-web-search-generic: this DSH version does not expose ctx.web.registerSearchProvider. " +
      "The provider targets the DSH 0.1.x-0.2.x web seam; update this plugin or file an issue."
    );
  }
  const current = () => config;
  ctx.web.registerSearchProvider(new GenericSearchProvider(() => current()));
}

export { Config, GenericSearchProvider, apply, inject, name };
