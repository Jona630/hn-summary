export type AppEnv = {
  Bindings: Cloudflare.Env;
};

export type ArticleSummary = {
  article: string | null | undefined;
  summary: string | null | undefined;
};

// Feed entry from Hacker News
export type FeedEntry = {
  title: string;
  link: string;
  comments: string;
};

// Result types for article processing
export type ArticleProcessingSuccess = {
  success: true;
  data: ArticleSummary;
};

export type ArticleProcessingError = {
  success: false;
  error: string;
  data: null;
};

export type ArticleProcessingResult =
  | ArticleProcessingSuccess
  | ArticleProcessingError;

// Combined result for rendering
export type ArticleWithEntry = {
  entry: FeedEntry;
  result: ArticleProcessingResult;
};
