import { Data } from "effect";

// Base error types for each service
export class HttpError extends Data.TaggedError("HttpError")<{
	readonly status?: number;
	readonly url?: string;
	readonly message: string;
}> {}

export class KVError extends Data.TaggedError("KVError")<{
	readonly operation: "get" | "put" | "delete";
	readonly key: string;
	readonly message: string;
}> {}

export class AIError extends Data.TaggedError("AIError")<{
	readonly operation: string;
	readonly message: string;
}> {}

export class EnvironmentError extends Data.TaggedError("EnvironmentError")<{
	readonly binding: string;
	readonly message: string;
}> {}

// Domain-specific error types
export class FeedError extends Data.TaggedError("FeedError")<{
	readonly message: string;
	readonly cause?: HttpError;
}> {}

export class ArticleError extends Data.TaggedError("ArticleError")<{
	readonly url: string;
	readonly step: "fetch" | "parse" | "clean" | "summarize" | "cache";
	readonly message: string;
	readonly cause?: HttpError | KVError | AIError;
}> {}
