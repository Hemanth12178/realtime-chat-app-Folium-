import { useEffect, useRef, useState } from "react";
import { deleteMessage, type User } from "../api";
import {
  connectChat,
  type ChatConnection,
  type ChatMessage,
  type ConnectionStatus,
  type OnlineUser,
  type ServerFrame,
} from "../ws";
import MessageList from "./MessageList";
import OnlineUsers from "./OnlineUsers";

type Props = {
  token: string;
  user: User;
  onLogout: () => void;
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting...",
  open: "Connected",
  closed: "Disconnected",
};

function ChatRoom({ token, user, onLogout }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // useRef keeps the connection between renders without causing re-renders
  const connectionRef = useRef<ChatConnection | null>(null);

  useEffect(() => {
    function handleFrame(frame: ServerFrame) {
      switch (frame.type) {
        case "history":
          // History REPLACES the list (important after a reconnect)
          setMessages(frame.messages);
          break;
        case "message":
          // Dedupe by id: ignore a message we already have
          setMessages((prev) =>
            prev.some((m) => m.id === frame.message.id) ? prev : [...prev, frame.message]
          );
          break;
        case "online_users":
          setOnlineUsers(frame.users);
          break;
        case "user_joined":
          setOnlineUsers((prev) =>
            prev.some((u) => u.id === frame.user.id) ? prev : [...prev, frame.user]
          );
          setNotice(`${frame.user.username} joined`);
          break;
        case "user_left":
          setOnlineUsers((prev) => prev.filter((u) => u.id !== frame.user.id));
          setNotice(`${frame.user.username} left`);
          break;
        case "message_deleted":
          // An admin deleted a message: remove it on every screen
          setMessages((prev) => prev.filter((m) => m.id !== frame.message_id));
          break;
        case "error":
          setError(frame.detail);
          break;
      }
    }

    const connection = connectChat(token, {
      onFrame: handleFrame,
      onStatus: (newStatus, closeCode) => {
        setStatus(newStatus);
        if (closeCode === 4001) {
          onLogout(); // server rejected the token: back to the login screen
        }
      },
    });
    connectionRef.current = connection;

    // Cleanup: runs when ChatRoom disappears (e.g. on logout)
    return () => connection.close();
  }, [token]);

  function sendMessage() {
    const content = draft.trim();
    if (!content) {
      return; // the server also rejects empty messages; this just saves a round trip
    }
    const sent = connectionRef.current?.send(content);
    if (sent) {
      setDraft("");
      setError("");
    } else {
      setError("Not connected, message not sent");
    }
  }

  async function handleDelete(messageId: number) {
    try {
      await deleteMessage(token, messageId);
      // No setMessages here: the server broadcasts message_deleted to every tab,
      // including this one, so all screens update the same way
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete message");
    }
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <h1>Chat</h1>
        <span className="status">
          <span className={`dot ${status}`} />
          {STATUS_LABELS[status]}
        </span>
        <span>
          <strong>{user.username}</strong>
          {user.is_admin && " (admin)"}
        </span>
        <button className="logout" onClick={onLogout}>
          Log out
        </button>
      </header>

      <div className="chat-body">
        <OnlineUsers users={onlineUsers} currentUserId={user.id} />

        <main className="chat-main">
          <MessageList
            messages={messages}
            currentUserId={user.id}
            isAdmin={user.is_admin}
            onDelete={handleDelete}
          />

          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error">{error}</p>}

          <form
            className="send-form"
            onSubmit={(e) => {
              e.preventDefault(); // stop the page from reloading
              sendMessage();
            }}
          >
            <input
              placeholder="Type a message..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              autoFocus
            />
            <button type="submit" disabled={status !== "open"}>
              Send
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default ChatRoom;