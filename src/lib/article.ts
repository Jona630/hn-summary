import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { Effect } from "effect";
import { parseHTML } from "linkedom";
import { ArticleError } from "../services/errors";
import type { ArticleSummary } from "../types";
import summarize from "./summarize";
import { KVStorage } from "../services/kv-storage";
import { AI } from "../services/ai";
import { HttpClient } from "../services/http-client";

// Original async function (kept for reference/migration)
export async function getArticleAndSummary(options: {
  articlesKV: KVNamespace;
  ai: Ai;
  url: string;
}) {
  // let result: ArticleSummary | null = null;

  let result = await options.articlesKV.get<ArticleSummary>(
    options.url,
    "json"
  );

  if (result) {
    return result;
  }

  const response = await fetch(options.url, {
    cf: {
      cacheTtl: 60 * 60 * 24,
      cacheEverything: true,
    },
  });
  const html = await response.text();
  const { document } = parseHTML(html);
  [...document.getElementsByTagName("img")].forEach((link) => {
    link.src = new URL(link.src, options.url).href;
  });
  [...document.getElementsByTagName("a")].forEach((link) => {
    link.href = new URL(link.href, options.url).href;
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener nofollow");
  });

  let reader: Readability | null = null;

  try {
    reader = new Readability(document);
  } catch (error) {
    console.error("Readability error", (error as Error).message, options.url);
  }

  result = {
    article: null,
    summary: null,
  };

  if (!reader) {
    await options.articlesKV.put(options.url, JSON.stringify(result));
    return result;
  }

  const article = reader?.parse();

  if (article?.content) {
    const { window } = parseHTML("");
    const purify = DOMPurify(window);
    const cleanArticle = purify.sanitize(article.content);

    console.log("Summarizing:", options.url);
    // const summary = await summarize(options.ai, options.url, cleanArticle);

    result = {
      article: cleanArticle,
      summary: "Summary unavailable.",
    };
  }

  await options.articlesKV.put(options.url, JSON.stringify(result));

  return result;
}

// Helper function to normalize URLs in HTML content
const normalizeUrls = (
  document: any,
  baseUrl: string
): Effect.Effect<void, never> =>
  Effect.sync(() => {
    // Fix image URLs
    [...document.getElementsByTagName("img")].forEach((img) => {
      img.src = new URL(img.src, baseUrl).href;
    });

    // Fix link URLs and add security attributes
    [...document.getElementsByTagName("a")].forEach((link) => {
      link.href = new URL(link.href, baseUrl).href;
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener nofollow");
    });
  });

// Helper function to parse article content using Readability
const parseArticleContent = (
  html: string,
  url: string
): Effect.Effect<string | null, ArticleError> =>
  Effect.gen(function* () {
    const { document } = parseHTML(html);

    // Normalize URLs first
    yield* normalizeUrls(document, url);

    // Try to create Readability instance
    const reader = yield* Effect.try({
      try: () => new Readability(document),
      catch: (error) =>
        new ArticleError({
          url,
          step: "parse",
          message: `Readability error: ${error}`,
        }),
    });

    // Parse the article
    const article = reader.parse();
    if (!article?.content) {
      return null;
    }

    // Clean the HTML content
    const { window } = parseHTML("");
    const purify = DOMPurify(window);
    const cleanArticle = purify.sanitize(article.content);

    return cleanArticle;
  }).pipe(
    Effect.catchAll((error) => {
      // Log the error but don't fail - return null for no content
      return Effect.as(
        Effect.logWarning(`Failed to parse article ${url}: ${error.message}`),
        null
      );
    })
  );

// New Effect-based implementation
export const getArticleAndSummaryEffect = (url: string) =>
  Effect.gen(function* () {
    const kvStorage = yield* KVStorage;
    const httpClient = yield* HttpClient;
    // const aiService = yield* AI;

    // Step 1: Check cache first
    yield* Effect.logInfo(`Checking cache for article: ${url}`);
    const cachedResult = yield* kvStorage
      .getArticleSummary(url)
      .pipe(Effect.catchAll(() => Effect.succeed(null)));

    if (cachedResult) {
      yield* Effect.logInfo(`Cache hit for article: ${url}`);
      return cachedResult;
    }

    yield* Effect.logInfo(`Cache miss, fetching article: ${url}`);

    // Step 2: Fetch the article HTML
    const html = yield* httpClient
      .get(url, {
        cacheTtl: 60 * 60 * 24, // 24 hours
        cacheEverything: true,
        timeout: 15000, // 15s timeout for article fetching
      })
      .pipe(
        Effect.mapError(
          (httpError) =>
            new ArticleError({
              url,
              step: "fetch",
              message: `Failed to fetch article: ${
                httpError instanceof Error
                  ? httpError.message
                  : String(httpError)
              }`,
              cause: httpError as any,
            })
        )
      );

    // Step 3: Parse and clean the article content
    const cleanArticle = yield* parseArticleContent(html, url);

    // Step 4: Create result object
    let result: ArticleSummary;

    if (cleanArticle) {
      yield* Effect.logInfo(`Successfully parsed article: ${url}`);

      // Step 5: Generate summary (currently placeholder)
      // const summary = yield* aiService.summarize(cleanArticle, url).pipe(
      //   Effect.catchAll((error) => {
      //     return Effect.as(
      //       Effect.logWarning(
      //         `AI summarization failed for ${url}: ${
      //           error instanceof Error ? error.message : String(error)
      //         }`
      //       ),
      //       "Summary unavailable."
      //     );
      //   })
      // );

      result = {
        article: cleanArticle,
        summary: "Summary unavailable.",
      };
    } else {
      yield* Effect.logWarning(`No content extracted for article: ${url}`);
      result = {
        article: null,
        summary: null,
      };
    }

    // Step 6: Cache the result
    yield* kvStorage
      .putArticleSummary(url, result)
      .pipe(
        Effect.catchAll((kvError) =>
          Effect.logWarning(
            `Failed to cache article summary for ${url}: ${
              kvError instanceof Error ? kvError.message : String(kvError)
            }`
          )
        )
      );

    return result;
  }).pipe(
    Effect.withLogSpan("getArticleAndSummary"),
    Effect.tapBoth({
      onFailure: (error) =>
        Effect.logError(
          `Failed to process article ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`
        ),
      onSuccess: (result) =>
        Effect.logInfo(
          `Successfully processed article ${url}, has content: ${!!result.article}`
        ),
    })
  );
