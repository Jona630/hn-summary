import { extract, type FeedEntry } from "@extractus/feed-extractor";
import { Effect } from "effect";
import { FeedError } from "../services/errors";

export type FeedEntryWithComments = FeedEntry & { comments: string };

// Original async function (kept for reference/migration)
export async function getFeed() {
	const data = await extract("https://news.ycombinator.com/rss", {
		getExtraEntryFields(entryData) {
			return {
				comments: (entryData as FeedEntryWithComments).comments,
			};
		},
	});
	return data.entries as FeedEntryWithComments[];
}

// New Effect-based implementation
export const getFeedEffect = Effect.gen(function* () {
	const data = yield* Effect.tryPromise({
		try: () =>
			extract("https://news.ycombinator.com/rss", {
				getExtraEntryFields(entryData) {
					return {
						comments: (entryData as FeedEntryWithComments).comments,
					};
				},
			}),
		catch: (error) =>
			new FeedError({
				message: `Failed to extract Hacker News RSS feed: ${error}`,
			}),
	});

	if (!data.entries) {
		return yield* Effect.fail(
			new FeedError({
				message: "No entries found in Hacker News RSS feed",
			}),
		);
	}

	return data.entries as FeedEntryWithComments[];
}).pipe(
	Effect.withLogSpan("getFeed"),
	Effect.tapBoth({
		onFailure: (error) =>
			Effect.logError(`Failed to fetch HN feed: ${error.message}`),
		onSuccess: (entries) =>
			Effect.logInfo(`Successfully fetched ${entries.length} HN entries`),
	}),
);
