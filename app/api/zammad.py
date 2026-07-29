from fastapi import APIRouter, HTTPException

from app.services.zammad_client import ZammadClient

router = APIRouter(prefix="/zammad", tags=["zammad"])


@router.get("/ping", summary="Testa conectividade com o Zammad")
async def ping_zammad():
    try:
        async with ZammadClient() as client:
            me = await client.ping()
        return {
            "status":       "connected",
            "zammad_user":  me.get("login"),
            "zammad_email": me.get("email"),
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Zammad inacessível: {exc}")
