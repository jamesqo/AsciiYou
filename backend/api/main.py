from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.huddles import router as huddles_router
from routes.ws import router as ws_router
from settings import settings


app = FastAPI(title="AsciiYou Backend", version="0.1.0")

# Allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=getattr(settings, "cors_origin_regex", None),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(huddles_router)
app.include_router(ws_router)
