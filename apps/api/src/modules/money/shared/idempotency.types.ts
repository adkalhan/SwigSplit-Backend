export type StoredIdempotentResponse<T> = {
  statusCode: number;
  body: T | null;
};

export type IdempotencyClaim<T> =
  | { kind: "new"; recordId: string }
  | { kind: "replay"; response: StoredIdempotentResponse<T> };
