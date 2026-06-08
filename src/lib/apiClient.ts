import type { ApiResponse } from "@shared/types";
import { useRoleStore } from "@/store/roleStore";

async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const getHeaders = useRoleStore.getState().getHeaders;
    const headers = {
      "Content-Type": "application/json",
      ...getHeaders(),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = (await response.json()) as ApiResponse<T>;
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "请求失败",
    };
  }
}

export const apiClient = {
  get<T>(url: string): Promise<ApiResponse<T>> {
    return request<T>(url, { method: "GET" });
  },
  post<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>(url, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  put<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>(url, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  delete<T>(url: string): Promise<ApiResponse<T>> {
    return request<T>(url, { method: "DELETE" });
  },
};
