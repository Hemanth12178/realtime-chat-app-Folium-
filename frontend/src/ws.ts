// The chat WebSocket: open it, turn incoming JSON into typed frames, send messages,
// and reconnect automatically (with a growing delay) if the connection drops.

const WS_URL = "ws://localhost:8000/ws/chat";

// Reconnect timing: wait 1s, then 2s, 4s, 8s, 16s, then 30s between tries
const FIRST_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

export type ChatMessage = {
  id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: string; // ISO date string from the server (UTC)
};

export type OnlineUser = {
  id: number;
  username: string;
};

// Every frame the server can send us (each one has a "type")
export type ServerFrame =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "online_users"; users: OnlineUser[] }
  | { type: "user_joined"; user: OnlineUser }
  | { type: "user_left"; user: OnlineUser }
  | { type: "message_deleted"; message_id: number }
  | { type: "error"; detail: string };

export type ConnectionStatus = "connecting" | "open" | "closed";

export type ChatConnection = {
  send: (content: string) => boolean;
  close: () => void;
};

type Handlers = {
  onFrame: (frame: ServerFrame) => void;
  onStatus: (status: ConnectionStatus, closeCode?: number) => void;
};

export function connectChat(token: string, handlers: Handlers): ChatConnection {
  let socket: WebSocket;
  let retryDelay = FIRST_RETRY_DELAY_MS;
  let retryTimer: number | undefined;

  function open() {
    // Browsers can't set headers on a WebSocket, so the token goes in the URL
    socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    handlers.onStatus("connecting");

    socket.onopen = () => {
      retryDelay = FIRST_RETRY_DELAY_MS; // connected again: the next drop starts from 1s
      handlers.onStatus("open");
    };

    socket.onmessage = (event) => {
      const frame = JSON.parse(event.data) as ServerFrame;
      handlers.onFrame(frame);
    };

    socket.onclose = (event) => {
      // 4001 = the server rejected our token. Retrying can't fix that, so stop here.
      if (event.code === 4001) {
        handlers.onStatus("closed", event.code);
        return;
      }

      // Any other drop (server restart, network blip): try again after a delay,
      // and double the delay for next time, up to 30 seconds
      handlers.onStatus("connecting");
      retryTimer = window.setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
    };
  }

  open();

  return {
    send(content: string) {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify({ type: "message", content }));
      return true;
    },
    close() {
      // We are closing on purpose (logout): cancel any waiting retry, and stop
      // listening first so this socket can't update the screen or reconnect
      window.clearTimeout(retryTimer);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
    },
  };
}
