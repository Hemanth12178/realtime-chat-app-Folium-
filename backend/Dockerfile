# Recipe for the backend image: Python + FastAPI + uvicorn
FROM python:3.12-slim

WORKDIR /app

# Copy requirements first and install them. Docker caches this layer, so it only
# reinstalls when requirements.txt changes, not every time the code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

# --host 0.0.0.0 = listen on every interface. Without it the server is only
# reachable inside the container. One process, because ConnectionManager is in memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
