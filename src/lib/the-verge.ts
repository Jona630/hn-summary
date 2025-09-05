import { extract, type FeedEntry } from "@extractus/feed-extractor";
import { Effect } from "effect";
import { FeedError } from "../services/errors";

export type FeedEntryWithComments = FeedEntry & { comments: string };

// New Effect-based implementation
export const getTheVergeFeedEffect = Effect.gen(function* () {
	const data = yield* Effect.tryPromise({
		try: () =>
			extract("https://www.theverge.com/rss/index.xml", {
				getExtraEntryFields(entryData) {
					return {
						comments: (entryData as FeedEntryWithComments).comments,
					};
				},
			}),
		catch: (error) =>
			new FeedError({
				message: `Failed to extract The Verge RSS feed: ${error}`,
			}),
	});

	if (!data.entries) {
		return yield* Effect.fail(
			new FeedError({
				message: "No entries found in The Verge RSS feed",
			}),
		);
	}

	return data.entries as FeedEntryWithComments[];
}).pipe(
	Effect.withLogSpan("getFeed"),
	Effect.tapBoth({
		onFailure: (error) =>
			Effect.logError(`Failed to fetch The Verge feed: ${error.message}`),
		onSuccess: (entries) =>
			Effect.logInfo(`Successfully fetched ${entries.length} HN entries`),
	}),
);
