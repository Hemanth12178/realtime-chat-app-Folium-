from fastapi import WebSocket


class ConnectionManager:
    """Tracks who is connected. Lives in memory, so run ONE uvicorn process."""

    def __init__(self):
        # user_id -> set of that user's open sockets (one per browser tab)
        self.connections: dict[int, set[WebSocket]] = {}
        # user_id -> username, so we can list who is online
        self.usernames: dict[int, str] = {}

    def connect(self, user_id: int, username: str, websocket: WebSocket) -> bool:
        """Register a socket. Returns True if this is the user's first tab."""
        is_first_tab = user_id not in self.connections
        if is_first_tab:
            self.connections[user_id] = set()
            self.usernames[user_id] = username
        self.connections[user_id].add(websocket)
        return is_first_tab

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        """Remove a socket. If it was the user's last tab, tell everyone they left."""
        sockets = self.connections.get(user_id)
        if sockets is None or websocket not in sockets:
            return  # already removed (for example by broadcast)

        sockets.remove(websocket)
        if not sockets:
            del self.connections[user_id]
            username = self.usernames.pop(user_id)
            await self.broadcast(
                {"type": "user_left", "user": {"id": user_id, "username": username}}
            )

    def online_users(self) -> list[dict]:
        return [{"id": uid, "username": name} for uid, name in self.usernames.items()]

    async def broadcast(self, data: dict) -> None:
        """Send data to every open socket. Sockets that fail are dropped."""
        dead = []
        # Loop over copies: the dict and sets can change while we await a send
        for user_id, sockets in list(self.connections.items()):
            for websocket in list(sockets):
                try:
                    await websocket.send_json(data)
                except Exception:
                    dead.append((user_id, websocket))

        for user_id, websocket in dead:
            await self.disconnect(user_id, websocket)


# One shared manager for the whole app
manager = ConnectionManager()