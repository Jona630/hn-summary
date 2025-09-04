import { Effect } from "effect";
import { Hono } from "hono";
import { raw } from "hono/html";
import { jsxRenderer } from "hono/jsx-renderer";
import { getArticleAndSummaryEffect } from "./lib/article";
import { getFeedEffect } from "./lib/hacker-news";
import { runEffect } from "./runtime";
import type { CloudflareBindings } from "./services/environment";
import type {
  AppEnv,
  ArticleWithEntry,
  ArticleProcessingResult,
  FeedEntry,
} from "./types";

const app = new Hono<AppEnv>();

app.use(
  "*",
  jsxRenderer(({ children }) => {
    return (
      <html lang="en">
        <head>
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
          />
        </head>
        <body class="container">{children}</body>
      </html>
    );
  })
);

// Main route using Effect
app.get("/", async (c) => {
  try {
    const bindings: CloudflareBindings = {
      summary_rss_articles: c.env.summary_rss_articles,
      AI: c.env.AI,
    };

    // Create the main Effect program
    const program = Effect.gen(function* () {
      // Step 1: Fetch the HN feed
      const items = yield* getFeedEffect;

      // Step 2: Process articles with concurrency control (max 5 concurrent)
      // Use either/catchAll to handle individual failures gracefully
      const results = yield* Effect.forEach(
        // items?.slice(0, 10) || [], // Limit to first 10 items for better performance
        items || [],
        (entry) =>
          Effect.gen(function* () {
            const result: ArticleProcessingResult =
              yield* getArticleAndSummaryEffect(entry.link!).pipe(
                Effect.map(
                  (articleSummary): ArticleProcessingResult => ({
                    success: true,
                    data: articleSummary,
                  })
                ),
                Effect.catchAll(
                  (error): Effect.Effect<ArticleProcessingResult, never> => {
                    // Log the error but don't fail the entire operation
                    return Effect.as(
                      Effect.logError(
                        `Failed to process article ${entry.link}: ${
                          error.message || error
                        }`
                      ),
                      {
                        success: false,
                        error: error.message || String(error),
                        data: null,
                      } as ArticleProcessingResult
                    );
                  }
                )
              );
            return { entry, result };
          }),
        { concurrency: 5 } // Process up to 5 articles concurrently
      );

      return results;
    }).pipe(
      Effect.withLogSpan("main-route"),
      Effect.tapBoth({
        onFailure: (error) => Effect.logError(`Main route failed: ${error}`),
        onSuccess: (results) =>
          Effect.logInfo(`Successfully processed ${results.length} articles`),
      })
    );

    // Run the Effect program
    const results = (await runEffect(program, bindings)) as ArticleWithEntry[];

    // Render the results
    return c.render(
      <>
        <h1>Hacker News Summary</h1>
        {results.map(({ entry, result }) => (
          <details key={entry.link}>
            {/** biome-ignore lint/a11y/useSemanticElements: using summary container */}
            <summary role="button" class="outline contrast">
              {entry.title}
            </summary>
            <article>
              <header>
                <a href={entry.link} target="_blank" rel="nofollow noopener">
                  Article
                </a>
                {" | "}
                <a
                  href={entry.comments}
                  target="_blank"
                  rel="nofollow noopener"
                >
                  Comments
                </a>
              </header>
              {result.success ? (
                <div>
                  <h2>Summary</h2>
                  {result.data.summary ? (
                    raw(result.data.summary)
                  ) : (
                    <p>Summary unavailable.</p>
                  )}
                  <hr />
                  <h2>Article</h2>
                  {result.data.article ? (
                    raw(result.data.article)
                  ) : (
                    <p>No article content available.</p>
                  )}
                </div>
              ) : (
                <div>
                  <h2>Unable to retrieve article</h2>
                  <p>
                    <small>Error: {result.error}</small>
                  </p>
                </div>
              )}
            </article>
          </details>
        ))}
      </>
    );
  } catch (error) {
    console.error("Route error:", error);
    c.status(500);
    return c.render(
      <h1>Error: {error instanceof Error ? error.message : "Unknown error"}</h1>
    );
  }
});

app.notFound((c) => {
  return c.render(<h1>Not found - {c.req.path}</h1>);
});

app.onError((error, c) => {
  console.error("App error:", error);
  c.status(500);
  return c.render(<h1>Error - {error.message}</h1>);
});

export default app;
