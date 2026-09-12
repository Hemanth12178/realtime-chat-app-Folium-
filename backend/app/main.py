import json
from datetime import timezone

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import models, schemas
from .auth import (
    create_session,
    get_current_user,
    get_user_by_token,
    hash_password,
    is_admin_username,
    verify_password,
)
from .connection_manager import manager
from .database import Base, SessionLocal, engine, get_db

# Create any missing tables at startup (does nothing if they already exist)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Chat App")

# Allow the Vite dev server (React) to call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    return {"status": "ok"}


# Plain "def" (not async): FastAPI runs these in a thread pool,
# so slow bcrypt hashing doesn't block the event loop / WebSockets.
@app.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(data: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == data.username).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")

    user = models.User(
        username=data.username,
        password_hash=hash_password(data.password),
        is_admin=is_admin_username(data.username),
    )
    db.add(user)
    db.commit()
    db.refresh(user)  # reload so user.id is filled in
    return user


@app.post("/login", response_model=schemas.TokenOut)
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == data.username).first()

    # Same message for "no such user" and "wrong password" so we don't reveal which usernames exist
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")

    # Keep is_admin in sync with ADMIN_USERNAME (saved by the commit in create_session)
    user.is_admin = is_admin_username(user.username)
    token = create_session(db, user)
    return schemas.TokenOut(token=token, user=user)


@app.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),  # no/bad token -> 401
    db: Session = Depends(get_db),
):
    # The real security check: hiding the button in the UI is not enough
    if not current_user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")

    message = db.get(models.Message, message_id)
    if message is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

    db.delete(message)
    db.commit()

    # Tell every open tab to remove it
    await manager.broadcast({"type": "message_deleted", "message_id": message_id})

# ---------- WebSocket chat ----------

MAX_MESSAGE_LENGTH = 1000
HISTORY_LIMIT = 20


def message_to_dict(message: models.Message) -> dict:
    return {
        "id": message.id,
        "user_id": message.user_id,
        "username": message.user.username,
        "content": message.content,
        # SQLite forgets the timezone; we saved UTC, so add it back for the browser
        "created_at": message.created_at.replace(tzinfo=timezone.utc).isoformat(),
    }


def get_history(db: Session) -> list[dict]:
    # Take the newest 20, then reverse so the oldest is shown first
    messages = (
        db.query(models.Message)
        .order_by(models.Message.id.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    return [message_to_dict(m) for m in reversed(messages)]


def validate_content(data) -> tuple[str, str]:
    """Returns (content, error). Exactly one of them is non-empty."""
    if not isinstance(data, dict) or data.get("type") != "message":
        return "", "Unknown frame type"
    content = data.get("content")
    if not isinstance(content, str) or not content.strip():
        return "", "Message cannot be empty"
    content = content.strip()
    if len(content) > MAX_MESSAGE_LENGTH:
        return "", f"Message is too long (max {MAX_MESSAGE_LENGTH} characters)"
    return content, ""


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, token: str = ""):
    # Accept first: closing before accept would reach the browser as a failed
    # handshake (code 1006), not our 4001
    await websocket.accept()

    # Check the token (short-lived DB session; quick SQLite queries are fine here)
    with SessionLocal() as db:
        user = get_user_by_token(db, token)
        if user is None:
            await websocket.close(code=4001, reason="Invalid token")
            return
        user_id = user.id
        username = user.username

    # 1. Register the socket FIRST so no broadcast is missed while we load history
    is_first_tab = manager.connect(user_id, username, websocket)

    try:
        # 2. Send history and the online list to this socket only
        with SessionLocal() as db:
            history = get_history(db)
        await websocket.send_json({"type": "history", "messages": history})
        await websocket.send_json({"type": "online_users", "users": manager.online_users()})

        # 3. Announce the user only when this is their first open tab
        if is_first_tab:
            await manager.broadcast(
                {"type": "user_joined", "user": {"id": user_id, "username": username}}
            )

        # 4. Wait for messages from this socket until it closes
        while True:
            text = await websocket.receive_text()

            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                continue

            content, error = validate_content(data)
            if error:
                await websocket.send_json({"type": "error", "detail": error})
                continue

            # Save, then send the saved message (with its real id) to everyone
            with SessionLocal() as db:
                message = models.Message(user_id=user_id, content=content)
                db.add(message)
                db.commit()
                db.refresh(message)
                payload = message_to_dict(message)

            await manager.broadcast({"type": "message", "message": payload})

    except WebSocketDisconnect:
        pass  # tab closed or network dropped: normal
    finally:
        # Runs however the loop ended; sends user_left if this was the last tab
        await manager.disconnect(user_id, websocket)