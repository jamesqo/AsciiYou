from fastapi import FastAPI
from contextlib import asynccontextmanager
from redis.asyncio import from_url

from deps import get_huddle_repo, get_participant_repo, get_huddle_verse_ws
from persistence.huddle_repository import RedisHuddleRepository
from persistence.participant_repository import RedisParticipantRepository
from service.huddle_verse import HuddleVerse
from settings import settings
from fastapi.middleware.cors import CORSMiddleware
from routes.huddles import router as huddles_router
from routes.ws import router as ws_router
from settings import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize shared resources
    redis = from_url(settings.redis_url, decode_responses=False)
    huddle_repo = RedisHuddleRepository(redis)
    participant_repo = RedisParticipantRepository(redis)
    huddle_verse = HuddleVerse(huddle_repo, participant_repo)

    # Expose via app.state for dependency access
    app.state.redis = redis
    app.state.huddle_repo = huddle_repo
    app.state.participant_repo = participant_repo
    app.state.huddle_verse = huddle_verse

    # Warm up store and start tracking
    await huddle_verse.refresh_huddle_list()
    await huddle_verse.start_tracking()

    try:
        yield # App runs here
    finally:
        # Graceful shutdown
        await huddle_verse.stop_tracking()
        await redis.close()


app = FastAPI(title="AsciiYou Backend",
              version="0.1.0",
              lifespan=lifespan)

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
