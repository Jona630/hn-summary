import { Context, Effect, Layer } from "effect";
import { EnvironmentError } from "./errors";

// Define the shape of Cloudflare bindings
export interface CloudflareBindings {
  readonly summary_rss_articles: KVNamespace;
  readonly AI: Ai;
}

// Environment service interface
export interface EnvironmentService {
  readonly getKV: (
    name: keyof Pick<CloudflareBindings, "summary_rss_articles">
  ) => Effect.Effect<KVNamespace, EnvironmentError>;
  readonly getAI: () => Effect.Effect<Ai, EnvironmentError>;
}

// Create the service tag
export class Environment extends Context.Tag("Environment")<
  Environment,
  EnvironmentService
>() {}

// Implementation for Cloudflare Workers
export const makeEnvironmentService = (
  bindings: CloudflareBindings
): EnvironmentService => ({
  getKV: (name) => {
    const kv = bindings[name];
    if (!kv) {
      return Effect.fail(
        new EnvironmentError({
          binding: name,
          message: `KV namespace '${name}' not found in bindings`,
        })
      );
    }
    return Effect.succeed(kv);
  },

  getAI: () => {
    const ai = bindings.AI;
    if (!ai) {
      return Effect.fail(
        new EnvironmentError({
          binding: "AI",
          message: "AI binding not found in environment",
        })
      );
    }
    return Effect.succeed(ai);
  },
});

// Layer for providing the environment service
export const EnvironmentServiceLive = (bindings: CloudflareBindings) =>
  Layer.succeed(Environment, makeEnvironmentService(bindings));
