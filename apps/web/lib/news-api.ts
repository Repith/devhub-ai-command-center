import {
  createNewsFeedSchema,
  newsFeedListSchema,
  newsFeedRefreshResponseSchema,
  newsFeedSchema,
  type CreateNewsFeed,
  type NewsFeed,
  type NewsFeedRefreshResponse,
  type UpdateNewsFeed
} from "@devhub/contracts";

import { apiRequest, apiRequestEmpty } from "./api-client";

export async function listNewsFeeds(accessToken: string): Promise<NewsFeed[]> {
  const response = await apiRequest("/news/feeds", newsFeedListSchema, {
    accessToken
  });
  return response.data;
}

export function refreshNewsFeeds(
  accessToken: string
): Promise<NewsFeedRefreshResponse> {
  return apiRequest("/news/feeds/refresh", newsFeedRefreshResponseSchema, {
    method: "POST",
    accessToken
  });
}

export function createNewsFeed(
  accessToken: string,
  input: CreateNewsFeed
): Promise<NewsFeed> {
  return apiRequest("/news/feeds", newsFeedSchema, {
    method: "POST",
    accessToken,
    body: createNewsFeedSchema.parse(input)
  });
}

export function updateNewsFeed(
  accessToken: string,
  feedId: string,
  input: UpdateNewsFeed
): Promise<NewsFeed> {
  return apiRequest(`/news/feeds/${feedId}`, newsFeedSchema, {
    method: "PATCH",
    accessToken,
    body: input
  });
}

export function deleteNewsFeed(
  accessToken: string,
  feedId: string
): Promise<void> {
  return apiRequestEmpty(`/news/feeds/${feedId}`, {
    method: "DELETE",
    accessToken
  });
}
