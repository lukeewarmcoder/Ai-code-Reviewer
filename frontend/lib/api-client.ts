const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface FetchOptions extends Omit<RequestInit, "body"> {
    body?: unknown;
}

/**
 * Fetch wrapper for frontend → Express backend communication.
 * Automatically sets Content-Type and handles JSON parsing.
 */
export async function apiClient<T = unknown>(
    endpoint: string,
    options: FetchOptions = {}
): Promise<T> {
    const { body, headers: customHeaders, ...rest } = options;

    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
            "Content-Type": "application/json",
            ...customHeaders,
        },
        body: body ? JSON.stringify(body) : undefined,
        ...rest,
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(error?.error?.message || `API error: ${res.status}`);
    }

    return res.json() as Promise<T>;
}
