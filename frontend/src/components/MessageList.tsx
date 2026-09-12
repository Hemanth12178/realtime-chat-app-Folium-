import { useEffect, useRef } from "react";
import type { ChatMessage } from "../ws";

type Props = {
  messages: ChatMessage[];
  currentUserId: number;
  isAdmin: boolean;
  onDelete: (messageId: number) => void;
};

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageList({ messages, currentUserId, isAdmin, onDelete }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to the newest message whenever the list changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="messages">
      {messages.map((message) => (
        <div
          key={message.id}
          className={message.user_id === currentUserId ? "message mine" : "message"}
        >
          <div className="message-meta">
            <strong>{message.username}</strong> · {formatTime(message.created_at)}
            {/* Hiding the button is only for looks: the server does the real admin check */}
            {isAdmin && (
              <button
                className="delete"
                title="Delete message"
                onClick={() => onDelete(message.id)}
              >
                Delete
              </button>
            )}
          </div>
          <div className="message-content">{message.content}</div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
