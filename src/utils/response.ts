// ─── Standardized API Response Helpers ────────────────────────────────────────

export interface ApiSuccessResponse<T = unknown> {
    success: true;
    data: T;
}

export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
    };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export function successResponse<T>(data: T): ApiSuccessResponse<T> {
    return { success: true, data };
}

export function errorResponse(code: string, message: string): ApiErrorResponse {
    return { success: false, error: { code, message } };
}
