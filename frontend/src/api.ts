// All HTTP calls to the FastAPI backend live in this file.

const API_URL = "http://localhost:8000";
const TOKEN_KEY = "chat_token";

export type User = {
  id: number;
  username: string;
  is_admin: boolean;
};

type LoginResponse = {
  token: string;
  user: User;
};

// ---- Token storage (localStorage keeps it after a page refresh) ----

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---- Shared fetch helper ----

async function request(path: string, method: string, body?: object, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(API_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(errorMessage(data, response.status));
  }
  return data;
}

// FastAPI errors look like {"detail": "text"} or, for 422, {"detail": [{"msg": "..."}]}
function errorMessage(data: any, status: number): string {
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  return `Request failed (${status})`;
}

// ---- API functions ----

export async function register(username: string, password: string): Promise<User> {
  return request("/register", "POST", { username, password });
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return request("/login", "POST", { username, password });
}

export async function getMe(token: string): Promise<User> {
  return request("/me", "GET", undefined, token);
}

// Admin only. The server checks is_admin itself (403 otherwise); success is a
// 204 with no body. Everyone's screen updates through the message_deleted frame.
export async function deleteMessage(token: string, messageId: number): Promise<void> {
  await request(`/messages/${messageId}`, "DELETE", undefined, token);
}