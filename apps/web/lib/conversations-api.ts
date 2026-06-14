import {
  conversationMessageListSchema,
  type ConversationMessage
} from "@devhub/contracts";

import { apiRequest } from "./api-client";

export async function listConversationMessages(
  accessToken: string,
  conversationId: string
): Promise<ConversationMessage[]> {
  const response = await apiRequest(
    `/conversations/${conversationId}/messages`,
    conversationMessageListSchema,
    { accessToken }
  );
  return response.data;
}
