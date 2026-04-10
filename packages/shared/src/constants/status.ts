export const CASE_STATUSES = ['Open', 'Active', 'Pending', 'Closed', 'Archived'] as const;
export const CASE_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;
