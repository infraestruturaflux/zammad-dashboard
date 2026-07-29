from fastapi import APIRouter

router = APIRouter(tags=["infra"])


@router.get("/health", summary="Liveness check")
async def health():
    return {"status": "ok", "version": "1.0.0"}
