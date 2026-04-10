export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  statusCode?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
