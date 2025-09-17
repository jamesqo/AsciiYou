# AsciiYou Backend (FastAPI)

## Quick start

```bash
# from repo root
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 3000
```

- CORS allows `http://localhost:8000` (Vite dev server).
- Endpoints:
  - `POST /huddles` → create huddle (role: host)
  - `POST /huddles/{huddle_id}/join` → join huddle (role: guest)
  - `GET /health` → healthcheck

The JSON shape matches the frontend schema:
```json
{
  "ok": true,
  "huddleId": "h_xxx",
  "participantId": "p_xxx",
  "role": "host|guest",
  "huddleExpiry": "2025-01-01T00:00:00Z",
  "signalingWs": "ws://localhost:8765/ws"
}
```

