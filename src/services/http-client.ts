import { Context, Effect, Layer } from "effect";
import { HttpError } from "./errors";

// Add timeout utility
const withTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number
): Effect.Effect<A, E | HttpError, R> =>
  effect.pipe(
    Effect.timeout(`${timeoutMs} millis`),
    Effect.mapError((error) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "_tag" in error &&
        error._tag === "TimeoutException"
      ) {
        return new HttpError({
          message: `Request timed out after ${timeoutMs}ms`,
        });
      }
      return error as E;
    })
  ) as Effect.Effect<A, E | HttpError, R>;

// HTTP Client service interface
export interface HttpClientService {
  readonly get: (
    url: string,
    options?: {
      cache?: any;
      cacheTtl?: number;
      cacheEverything?: boolean;
      timeout?: number;
    }
  ) => Effect.Effect<string, HttpError>;

  readonly fetch: (
    url: string,
    init?: RequestInit & {
      cf?: IncomingRequestCfProperties;
      timeout?: number;
    }
  ) => Effect.Effect<Response, HttpError>;
}

// Create the service tag
export class HttpClient extends Context.Tag("HttpClient")<
  HttpClient,
  HttpClientService
>() {}

// Implementation using native fetch with Cloudflare features and timeouts
const makeHttpClientService = (): HttpClientService => ({
  get: (url: string, options = {}) =>
    Effect.gen(function* () {
      const timeout = options.timeout || 30000; // Default 30s timeout
      const cfOptions: Partial<IncomingRequestCfProperties> = {};

      if (options.cacheTtl) {
        cfOptions.cacheTtl = options.cacheTtl;
      }

      if (options.cacheEverything) {
        cfOptions.cacheEverything = options.cacheEverything;
      }

      const fetchEffect = Effect.tryPromise({
        try: () =>
          fetch(url, {
            cf: cfOptions,
            cache: options.cache,
            signal: AbortSignal.timeout(timeout),
          }),
        catch: (error) =>
          new HttpError({
            url,
            message: `Failed to fetch '${url}': ${error}`,
          }),
      });

      const response = yield* withTimeout(fetchEffect, timeout);

      if (!response.ok) {
        return yield* Effect.fail(
          new HttpError({
            status: response.status,
            url,
            message: `HTTP ${response.status}: ${response.statusText}`,
          })
        );
      }

      const textEffect = Effect.tryPromise({
        try: () => response.text(),
        catch: (error) =>
          new HttpError({
            url,
            message: `Failed to read response text from '${url}': ${error}`,
          }),
      });

      return yield* withTimeout(textEffect, 10000); // 10s timeout for reading response
    }),

  fetch: (url: string, init = {}) => {
    const timeout = init.timeout || 30000; // Default 30s timeout
    const fetchEffect = Effect.tryPromise({
      try: () =>
        fetch(url, {
          ...init,
          signal: AbortSignal.timeout(timeout),
        }),
      catch: (error) =>
        new HttpError({
          url,
          message: `Failed to fetch '${url}': ${error}`,
        }),
    });

    return withTimeout(fetchEffect, timeout).pipe(
      Effect.flatMap((response) => {
        if (!response.ok) {
          return Effect.fail(
            new HttpError({
              status: response.status,
              url,
              message: `HTTP ${response.status}: ${response.statusText}`,
            })
          );
        }
        return Effect.succeed(response);
      })
    );
  },
});

// Layer for providing the HTTP client service
export const HttpClientServiceLive = Layer.succeed(
  HttpClient,
  makeHttpClientService()
);
