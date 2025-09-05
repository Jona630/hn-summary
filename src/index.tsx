import { Effect } from "effect";
import { Hono } from "hono";
import { raw } from "hono/html";
import { jsxRenderer } from "hono/jsx-renderer";
import { getArticleAndSummaryEffect } from "./lib/article";
import { getFeedEffect } from "./lib/hacker-news";
import { getTheVergeFeedEffect } from "./lib/the-verge";
import { runEffect } from "./runtime";
import type { CloudflareBindings } from "./services/environment";
import type {
  AppEnv,
  ArticleProcessingResult,
  ArticleWithEntry,
} from "./types";

const app = new Hono<AppEnv>();

app.use(
  "*",
  jsxRenderer(({ children }) => {
    return (
      <html lang="en">
        <head>
          <link
            rel="icon"
            href="https://jkrdok5j3d.ufs.sh/f/jaHwekd2vgiCSeTG8yxaRfnOYq90p8kxmlH1MJGgK7Nrv5Fa"
          />
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.purple.min.css"
          />
          <title>Tatu News</title>
        </head>
        <body class="container">
          <nav>
            <ul>
              <li>
                <strong>Tatu News</strong>
              </li>
            </ul>
            <ul>
              <li>
                <a href="/" class="contrast">
                  Hacker News
                </a>
              </li>
              <li>
                <a href="/the-verge" class="contrast">
                  The Verge
                </a>
              </li>
            </ul>
          </nav>
          {children}
        </body>
      </html>
    );
  })
);

// Main route using Effect
app.get("/", async (c) => {
  try {
    const page = parseInt(c.req.query("page") || "1");
    const itemsPerPage = 10;

    const bindings: CloudflareBindings = {
      summary_rss_articles: c.env.summary_rss_articles,
      AI: c.env.AI,
    };

    // Create the main Effect program
    const program = Effect.gen(function* () {
      // Step 1: Fetch the HN feed
      const items = yield* getFeedEffect;

      // Step 2: Calculate pagination
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedItems = items?.slice(startIndex, endIndex) || [];
      const totalItems = items?.length || 0;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      // Step 3: Process articles with concurrency control (max 3 concurrent)
      // Use either/catchAll to handle individual failures gracefully
      const results = yield* Effect.forEach(
        paginatedItems,
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
        { concurrency: 3 } // Process up to 3 articles concurrently
      );

      return { results, totalPages, currentPage: page, totalItems };
    }).pipe(
      Effect.withLogSpan("main-route"),
      Effect.tapBoth({
        onFailure: (error) => Effect.logError(`Main route failed: ${error}`),
        onSuccess: (data) =>
          Effect.logInfo(
            `Successfully processed ${data.results.length} articles on page ${data.currentPage}`
          ),
      })
    );

    // Run the Effect program
    const { results, totalPages, currentPage, totalItems } = await runEffect(
      program,
      bindings
    );

    // Render the results
    return c.render(
      <>
        <h1>Hacker News Summary</h1>
        <p>
          Page {currentPage} of {totalPages} ({totalItems} total articles)
        </p>
        <nav style="margin-bottom: 1rem;">
          {currentPage > 1 && (
            <a
              href={`/?page=${currentPage - 1}`}
              class="contrast"
              style="margin-right: 1rem;"
            >
              ← Previous
            </a>
          )}
          {currentPage < totalPages && (
            <a href={`/?page=${currentPage + 1}`} class="contrast">
              Next →
            </a>
          )}
        </nav>
        {results.map(({ entry, result }, index) => (
          <details key={entry.link}>
            {/** biome-ignore lint/a11y/useSemanticElements: using summary container */}
            <summary
              role="button"
              class={`outline ${index % 2 === 0 ? "primary" : "secondary"}`}
            >
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

app.get("/the-verge", async (c) => {
  try {
    const page = parseInt(c.req.query("page") || "1");
    const itemsPerPage = 10;

    const bindings: CloudflareBindings = {
      summary_rss_articles: c.env.summary_rss_articles,
      AI: c.env.AI,
    };

    // Create the main Effect program
    const program = Effect.gen(function* () {
      // Step 1: Fetch The Verge feed
      const items = yield* getTheVergeFeedEffect;

      // Step 2: Calculate pagination
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedItems = items?.slice(startIndex, endIndex) || [];
      const totalItems = items?.length || 0;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      // Step 3: Process articles with concurrency control (max 3 concurrent)
      // Use either/catchAll to handle individual failures gracefully
      const results = yield* Effect.forEach(
        paginatedItems,
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
        { concurrency: 3 } // Process up to 3 articles concurrently
      );

      return { results, totalPages, currentPage: page, totalItems };
    }).pipe(
      Effect.withLogSpan("main-route"),
      Effect.tapBoth({
        onFailure: (error) => Effect.logError(`Main route failed: ${error}`),
        onSuccess: (data) =>
          Effect.logInfo(
            `Successfully processed ${data.results.length} articles on page ${data.currentPage}`
          ),
      })
    );

    // Run the Effect program
    const { results, totalPages, currentPage, totalItems } = await runEffect(
      program,
      bindings
    );

    // Render the results
    return c.render(
      <>
        <h1>The Verge Summary</h1>
        <p>
          Page {currentPage} of {totalPages} ({totalItems} total articles)
        </p>
        <nav style="margin-bottom: 1rem;">
          {currentPage > 1 && (
            <a
              href={`/the-verge?page=${currentPage - 1}`}
              class="contrast"
              style="margin-right: 1rem;"
            >
              ← Previous
            </a>
          )}
          {currentPage < totalPages && (
            <a href={`/the-verge?page=${currentPage + 1}`} class="contrast">
              Next →
            </a>
          )}
        </nav>
        {results.map(({ entry, result }, index) => (
          <details key={entry.link}>
            {/** biome-ignore lint/a11y/useSemanticElements: using summary container */}
            <summary
              role="button"
              class={`outline ${index % 2 === 0 ? "primary" : "secondary"}`}
            >
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
  return c.render(
    <>
      <h1>Not found - {c.req.path}</h1>
      <a href="/" class="contrast">
        back to home
      </a>
    </>
  );
});

app.onError((error, c) => {
  console.error("App error:", error);
  c.status(500);
  return c.render(
    <>
      <h1>Error - {error.message}</h1>
      <a href="/" class="contrast">
        back to home
      </a>
    </>
  );
});

export default app;
