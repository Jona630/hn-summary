import { Context, Effect, Layer } from "effect";
import { Environment } from "./environment";
import type { AIError } from "./errors";

// AI Service interface
export interface AIService {
  readonly summarize: (
    content: string,
    url?: string
  ) => Effect.Effect<string, AIError>;
  readonly isAvailable: () => Effect.Effect<boolean, never>;
}

// Create the service tag
export class AI extends Context.Tag("AI")<AI, AIService>() {}

// Implementation using Cloudflare AI
const makeAIService = (ai: Ai): AIService => ({
  summarize: (content: string, url?: string) =>
    Effect.gen(function* () {
      // For now, return a placeholder since AI summarization is commented out in the original code
      // This can be implemented later when the AI binding is properly configured
      yield* Effect.logInfo(
        `AI summarization requested for ${url || "content"}`
      );

      // Placeholder implementation - replace with actual AI call when ready
      return "Summary unavailable.";

      // Future implementation might look like:
      // const result = yield* Effect.tryPromise({
      //   try: () => ai.run('@cf/facebook/bart-large-cnn', {
      //     input_text: content,
      //     max_length: 150
      //   }),
      //   catch: (error) => new AIError({
      //     operation: 'summarize',
      //     message: `Failed to summarize content: ${error}`
      //   })
      // })
      // return result.summary
    }),

  isAvailable: () => Effect.succeed(true), // Always available in CF Workers context
});

// Mock implementation for testing/development
const makeMockAIService = (): AIService => ({
  summarize: (content: string, url?: string) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(`Mock AI summarization for ${url || "content"}`);
      return "Summary unavailable.";
    }),

  isAvailable: () => Effect.succeed(false),
});

// Layer for providing the AI service
export const AIServiceLive = Layer.effect(
  AI,
  Effect.gen(function* () {
    const env = yield* Environment;
    const ai = yield* env.getAI().pipe(
      Effect.catchAll(() => Effect.succeed(null as any)) // Graceful fallback if AI not available
    );

    if (!ai) {
      yield* Effect.logWarning(
        "AI binding not available, using mock implementation"
      );
      return makeMockAIService();
    }

    return makeAIService(ai);
  })
);

// Mock layer for testing
export const AIServiceMock = Layer.succeed(AI, makeMockAIService());
