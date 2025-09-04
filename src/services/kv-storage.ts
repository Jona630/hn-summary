import { Context, Effect, Layer } from "effect";
import type { ArticleSummary } from "../types";
import { Environment } from "./environment";
import { EnvironmentError, KVError } from "./errors";

// KV Storage service interface
export interface KVStorageService {
  readonly get: <T = string>(
    key: string,
    type?: "text" | "json"
  ) => Effect.Effect<T | null, KVError>;
  readonly put: (
    key: string,
    value: string | object
  ) => Effect.Effect<void, KVError>;
  readonly delete: (key: string) => Effect.Effect<void, KVError>;

  // Specific methods for our domain
  readonly getArticleSummary: (
    url: string
  ) => Effect.Effect<ArticleSummary | null, KVError>;
  readonly putArticleSummary: (
    url: string,
    summary: ArticleSummary
  ) => Effect.Effect<void, KVError>;
}

// Create the service tag
export class KVStorage extends Context.Tag("KVStorage")<
  KVStorage,
  KVStorageService
>() {}

// Implementation
const makeKVStorageService = (kv: KVNamespace): KVStorageService => ({
  get: <T = string>(key: string, type: "text" | "json" = "text") =>
    Effect.tryPromise({
      try: () => kv.get(key, type as any) as Promise<T | null>,
      catch: (error) =>
        new KVError({
          operation: "get",
          key,
          message: `Failed to get key '${key}': ${error}`,
        }),
    }),

  put: (key: string, value: string | object) =>
    Effect.tryPromise({
      try: () =>
        kv.put(key, typeof value === "string" ? value : JSON.stringify(value)),
      catch: (error) =>
        new KVError({
          operation: "put",
          key,
          message: `Failed to put key '${key}': ${error}`,
        }),
    }),

  delete: (key: string) =>
    Effect.tryPromise({
      try: () => kv.delete(key),
      catch: (error) =>
        new KVError({
          operation: "delete",
          key,
          message: `Failed to delete key '${key}': ${error}`,
        }),
    }),

  getArticleSummary: (url: string) =>
    Effect.tryPromise({
      try: () => kv.get<ArticleSummary>(url, "json"),
      catch: (error) =>
        new KVError({
          operation: "get",
          key: url,
          message: `Failed to get article summary for '${url}': ${error}`,
        }),
    }),

  putArticleSummary: (url: string, summary: ArticleSummary) =>
    Effect.tryPromise({
      try: () => kv.put(url, JSON.stringify(summary)),
      catch: (error) =>
        new KVError({
          operation: "put",
          key: url,
          message: `Failed to put article summary for '${url}': ${error}`,
        }),
    }),
});

// Layer for providing the KV storage service
export const KVStorageServiceLive = Layer.effect(
  KVStorage,
  Effect.gen(function* () {
    const env = yield* Environment;
    const kv = yield* env.getKV("summary_rss_articles");
    return makeKVStorageService(kv);
  })
);
