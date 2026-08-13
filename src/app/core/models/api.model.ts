/** Mirror of the backend ApiResponse<T> envelope. */
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  timestamp: string;
}

/** Mirror of the backend PageResponse<T> envelope. */
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}

/** Mirror of the backend ErrorResponse envelope. */
export interface ApiError {
  success: false;
  status: number;
  error: string;
  message: string;
  path: string;
  fieldErrors?: { field: string; message: string }[];
  timestamp: string;
}

/** Common query parameters for server-side paged/sorted/filtered lists. */
export interface PageQuery {
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
  search?: string;
}
