import { type Effect, Layer, ManagedRuntime } from "effect";
import { EnvironmentServiceLive } from "./services/environment";
import { HttpClientServiceLive } from "./services/http-client";
import { KVStorageServiceLive } from "./services/kv-storage";
import { AIServiceLive } from "./services/ai";
import type { CloudflareBindings } from "./services/environment";

// Create the main layer that provides all services
export const makeMainLayer = (bindings: CloudflareBindings) => {
  const envLayer = EnvironmentServiceLive(bindings);
  const dependentServices = Layer.mergeAll(KVStorageServiceLive, AIServiceLive);

  return Layer.mergeAll(HttpClientServiceLive).pipe(
    Layer.provideMerge(dependentServices.pipe(Layer.provide(envLayer)))
  );
};

// Create a managed runtime for Cloudflare Workers
export const makeManagedRuntime = (bindings: CloudflareBindings) => {
  const layer = makeMainLayer(bindings);
  return ManagedRuntime.make(layer);
};

// Helper function to run Effect programs in Cloudflare Workers context
export const runEffect = <A>(
  effect: Effect.Effect<A, any, any>,
  bindings: CloudflareBindings
): Promise<A> => {
  const runtime = makeManagedRuntime(bindings);
  return runtime.runPromise(effect);
};
