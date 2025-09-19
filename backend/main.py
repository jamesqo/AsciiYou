from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes.huddles import router as huddles_router
from backend.routes.sdp import router as sdp_router
from backend.settings import settings


app = FastAPI(title="AsciiYou Backend", version="0.1.0")

# Allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(huddles_router)
app.include_router(sdp_router)
