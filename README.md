# Real-time Chat App

A small chat room: register, log in, and chat live with everyone who is online.
Backend is FastAPI + SQLite, frontend is React + TypeScript (Vite).

- Live messages over a WebSocket, saved to SQLite
- The last 20 messages load when you join
- Online users list, with "joined" / "left" notices
- The same user can have several tabs open
- Admin can delete any message; it disappears on every screen
- Reconnects automatically if the connection drops (for example, a server restart)

## Quick start with Docker (one command)

Needs only Docker Desktop. From this folder:

```powershell
docker compose up --build
```

Then open http://localhost:5173. The first build takes a few minutes; later starts are quick.

- Stop it with Ctrl+C, or `docker compose down` in another terminal.
- To pick the admin, run `$env:ADMIN_USERNAME = "alice"` before `docker compose up`. The default is `admin`.
- Ports 8000 and 5173 must be free, so stop a locally running uvicorn or `npm run dev` first.
- The database lives in a Docker volume, so users and messages survive `docker compose down`.
  `docker compose down -v` deletes it and starts fresh.
- After changing code, run `docker compose up --build` again.

## Run it without Docker

### Requirements

- Python 3.10+
- Node.js 20.19+ or 22.12+ (needed by Vite)

### Setup (once)

Commands are for Windows PowerShell (the default VS Code terminal).

**Backend.** From the `backend` folder:

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PowerShell says running scripts is disabled, run this once, then activate again:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

**Frontend.** From the `frontend` folder:

```powershell
npm install
```

### Run

You need two terminals.

**Terminal 1: backend.** From the `backend` folder:

```powershell
venv\Scripts\Activate.ps1
$env:ADMIN_USERNAME = "admin"
uvicorn app.main:app --reload
```

- API: http://localhost:8000 (interactive docs at http://localhost:8000/docs)
- `chat.db` is created in `backend/` on first start
- `ADMIN_USERNAME` is optional. Whoever registers or logs in with that name is the admin.
  It only lasts for this terminal session, so set it again after reopening the terminal.

**Terminal 2: frontend.** From the `frontend` folder:

```powershell
npm run dev
```

Open http://localhost:5173.

To test live chat, open a second browser (or an incognito window) and log in as a different user.

## Manual test checklist

1. Register `alice` in one browser and `bob` in another. Each sees the other in the online list.
2. Send a message from one. It appears in both instantly.
3. Refresh the page. You stay logged in and see the last 20 messages.
4. Open a second tab as `alice`, then close it. Bob gets no join/leave notice. Closing Alice's last tab shows "alice left".
5. Admin: register `admin` (with `ADMIN_USERNAME=admin` set). A Delete button shows on messages.
   Clicking it removes the message in every browser.
6. Reconnect: while chatting, stop uvicorn (Ctrl+C). The dot turns amber ("Connecting...").
   Start uvicorn again. Within a few seconds the dot turns green and the chat is back, with no refresh.
7. Security: in `/docs`, call `POST /login` as Bob and copy the `token`. Click Authorize, paste it,
   then call `DELETE /messages/{id}`. You get 403. Without a token you get 401. As the admin,
   an unknown id gives 404.

## Project structure

```
docker-compose.yml        runs both containers: docker compose up --build
backend/
  Dockerfile              builds the backend image (python + uvicorn)
  requirements.txt
  app/
    main.py               routes: /register, /login, /me, DELETE /messages/{id}, /ws/chat
    auth.py               bcrypt hashing, session tokens, get_current_user
    models.py             SQLAlchemy tables: users, sessions, messages
    database.py           SQLite engine and get_db
    schemas.py            Pydantic request/response shapes
    connection_manager.py who is connected; broadcast to all sockets
frontend/
  Dockerfile              builds the frontend image (node + vite dev server)
frontend/src/
  api.ts                  fetch calls + token in localStorage
  ws.ts                   WebSocket connection, frame types, auto-reconnect
  App.tsx                 checks the saved token with /me, shows Login or ChatRoom
  components/             Login, ChatRoom, MessageList, OnlineUsers
```

## Design choices

- **Session tokens, not JWT.** Login creates a random token (`secrets.token_urlsafe`) and saves it
  in the `sessions` table. Every request looks the token up. That makes it easy to revoke
  (delete the row) and there is no signing key to manage.
- **bcrypt directly** (not passlib) for password hashing. `/register` and `/login` are plain `def`
  functions, so FastAPI runs them in a thread pool and slow hashing doesn't freeze the WebSockets.
- **HTTPBearer** for `get_current_user`, so `/docs` has an Authorize button.
- **WebSocket auth via query string** (`/ws/chat?token=...`), because browsers can't set headers on
  a WebSocket. A bad token closes the socket with code `4001`, and the frontend returns to login.
- **ConnectionManager** maps `user_id -> set of sockets`, so multiple tabs work. `user_joined` is sent
  only for a user's first tab and `user_left` only when their last tab closes.
- **Register first, then send history.** On connect, the socket is added to the manager *before*
  history is loaded, so a message sent in between can't be missed. The frontend dedupes by `id`
  in case it arrives twice.
- **Safe broadcast.** It loops over a copy of the sockets, wraps each send in try/except, and drops
  sockets that fail.
- **JSON frames with a `type`**: `history`, `message`, `online_users`, `user_joined`, `user_left`,
  `message_deleted`, `error`. Messages must be non-empty and at most 1000 characters (checked on the server).
- **History replaces** the message list instead of appending, so a reconnect can't show duplicates.
- **Auto-reconnect with backoff** (`ws.ts`): if the socket drops, the client retries after 1s, 2s, 4s,
  8s, 16s, then every 30s at most. The delay resets after a successful connection. There's no retry on
  close code `4001` (bad token → back to login) or on Log out.
- **One database setting, two ways to run.** `database.py` reads `DATABASE_URL` from the environment
  and falls back to `sqlite:///./chat.db`. Docker points it at a file on a volume, so nothing changes
  for a local run.
- **Admin delete is checked on the server.** `DELETE /messages/{id}` returns 401 without a valid token,
  403 if the user isn't admin, and 404 if the message doesn't exist. Hiding the button in the UI
  is only cosmetic.

## Known limits

- **Run one Uvicorn process only.** Connected sockets live in memory, so several workers would each
  see only part of the users. Scaling out would need something shared, like Redis pub/sub.
- **SQLite** is a single file. It's fine for one machine, but it's not built for many concurrent
  writers. Postgres would be the next step.
- **Tokens never expire.** Log out only removes the token from the browser; the session row stays
  in the database.
- **The token is in the WebSocket URL**, so it can show up in server logs.
- **Messages sent while the connection is down are not queued.** Send is disabled until it reconnects.
- **Admin status is checked on register and login.** After changing `ADMIN_USERNAME`, the admin
  must log in again.
- One room only, and only the last 20 messages load (no scrolling back further).
- Deleting a message removes the row permanently.
