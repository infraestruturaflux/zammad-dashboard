import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import create_tables
from app.services.sync import run_sync

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


async def _sync_loop() -> None:
    """Sync contínuo com intervalo configurável. Nunca encerra — erros são logados."""
    while True:
        try:
            result = await run_sync()
            logger.info(
                "Sync automático OK — %d tickets em %.2fs.",
                result["tickets_upserted"],
                result["duration_seconds"],
            )
        except Exception as exc:
            logger.error("Sync automático falhou: %s", exc)
        await asyncio.sleep(settings.sync_interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Inicializando banco de dados…")
    await create_tables()
    logger.info("Iniciando loop de sincronização (intervalo: %ds)…", settings.sync_interval_seconds)
    task = asyncio.create_task(_sync_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info("Dashboard encerrado.")


app = FastAPI(
    title="NOC Dashboard — Zammad",
    description="Dashboard em tempo real para o time de NOC. Consome a API REST do Zammad.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.app_env == "development" else ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
from fastapi import Depends                             # noqa: E402

from app.api.auth    import router as auth_router     # noqa: E402
from app.api.health  import router as health_router   # noqa: E402
from app.api.metrics import router as metrics_router  # noqa: E402
from app.api.noc     import router as noc_router      # noqa: E402
from app.api.zammad  import router as zammad_router   # noqa: E402
from app.core.auth   import get_current_user          # noqa: E402

_auth = [Depends(get_current_user)]

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(zammad_router,  dependencies=_auth)
app.include_router(noc_router,     dependencies=_auth)
app.include_router(metrics_router, dependencies=_auth)
