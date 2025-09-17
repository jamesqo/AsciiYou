import os


JWT_SECRET = os.getenv("SDP_JWT_SECRET", "dev-secret-change-me")
JWT_TTL_SECONDS = int(os.getenv("SDP_JWT_TTL", "300"))  # 5 min default


