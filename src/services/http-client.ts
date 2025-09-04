import { Context, Effect, Layer } from "effect";
import { HttpError } from "./errors";

// HTTP Client service interface
export interface HttpClientService {
  readonly get: (
    url: string,
    options?: {
      cache?: any;
      cacheTtl?: number;
      cacheEverything?: boolean;
    }
  ) => Effect.Effect<string, HttpError>;

  readonly fetch: (
    url: string,
    init?: RequestInit & {
      cf?: IncomingRequestCfProperties;
    }
  ) => Effect.Effect<Response, HttpError>;
}

// Create the service tag
export class HttpClient extends Context.Tag("HttpClient")<
  HttpClient,
  HttpClientService
>() {}

// Implementation using native fetch with Cloudflare features
const makeHttpClientService = (): HttpClientService => ({
  get: (url: string, options = {}) =>
    Effect.gen(function* () {
      const cfOptions: Partial<IncomingRequestCfProperties> = {};

      if (options.cacheTtl) {
        cfOptions.cacheTtl = options.cacheTtl;
      }

      if (options.cacheEverything) {
        cfOptions.cacheEverything = options.cacheEverything;
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            cf: cfOptions,
            cache: options.cache,
          }),
        catch: (error) =>
          new HttpError({
            url,
            message: `Failed to fetch '${url}': ${error}`,
          }),
      });

      if (!response.ok) {
        return yield* Effect.fail(
          new HttpError({
            status: response.status,
            url,
            message: `HTTP ${response.status}: ${response.statusText}`,
          })
        );
      }

      return yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) =>
          new HttpError({
            url,
            message: `Failed to read response text from '${url}': ${error}`,
          }),
      });
    }),

  fetch: (url: string, init = {}) =>
    Effect.tryPromise({
      try: () => fetch(url, init),
      catch: (error) =>
        new HttpError({
          url,
          message: `Failed to fetch '${url}': ${error}`,
        }),
    }).pipe(
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
    ),
});

// Layer for providing the HTTP client service
export const HttpClientServiceLive = Layer.succeed(
  HttpClient,
  makeHttpClientService()
);
