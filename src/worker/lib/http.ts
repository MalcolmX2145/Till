/** An error with an HTTP status, thrown by routes and rendered by errorHandler. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (m: string, details?: unknown) =>
  new HttpError(400, m, "bad_request", details);
export const unauthorized = (m = "Not signed in") =>
  new HttpError(401, m, "unauthorized");
export const forbidden = (m = "Not allowed") => new HttpError(403, m, "forbidden");
export const notFound = (m = "Not found") => new HttpError(404, m, "not_found");
export const conflict = (m: string) => new HttpError(409, m, "conflict");
