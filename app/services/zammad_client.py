import asyncio
import logging
import time

import httpx

from app.core.config import get_settings

logger   = logging.getLogger(__name__)
settings = get_settings()


class TokenBucket:
    def __init__(self, capacity: int, refill_rate: float) -> None:
        self._capacity    = capacity
        self._refill_rate = refill_rate
        self._tokens      = float(capacity)
        self._last_refill = time.monotonic()
        self._lock        = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now     = time.monotonic()
            elapsed = now - self._last_refill
            self._tokens = min(
                self._capacity,
                self._tokens + elapsed * self._refill_rate,
            )
            self._last_refill = now
            if self._tokens < 1:
                wait = (1 - self._tokens) / self._refill_rate
                await asyncio.sleep(wait)
                self._tokens = 0
            else:
                self._tokens -= 1


_bucket = TokenBucket(
    capacity=settings.rate_limit_capacity,
    refill_rate=settings.rate_limit_refill_rate,
)


class ZammadClient:
    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "ZammadClient":
        self._client = httpx.AsyncClient(
            base_url=f"{settings.zammad_url}/api/v1",
            headers={"Authorization": f"Token token={settings.zammad_token}"},
            timeout=30.0,
        )
        return self

    async def __aexit__(self, *_) -> None:
        if self._client:
            await self._client.aclose()

    async def get(self, path: str, **kwargs) -> dict | list:
        await _bucket.acquire()
        resp = await self._client.get(path, **kwargs)
        resp.raise_for_status()
        return resp.json()

    async def ping(self) -> dict:
        return await self.get("/users/me")

    async def search_tickets(
        self,
        query: str,
        page: int = 1,
        per_page: int = 100,
    ) -> list[dict]:
        return await self.get(
            "/tickets/search",
            params={
                "query":    query,
                "page":     page,
                "per_page": per_page,
                "sort_by":  "created_at",
                "order_by": "desc",
                "expand":   "true",
            },
        )

    async def get_ticket_articles(self, ticket_id: int) -> list[dict]:
        result = await self.get(f"/ticket_articles/by_ticket/{ticket_id}")
        if isinstance(result, list):
            return result
        return result.get("ticket_articles", [])

    async def get_users(self, page: int = 1, per_page: int = 100) -> list[dict]:
        """
        Lista usuários (agentes) do Zammad com paginação.
        Endpoint: GET /api/v1/users — retorna id, login, email, firstname,
        lastname, active, etc.
        """
        result = await self.get(
            "/users",
            params={"page": page, "per_page": per_page},
        )
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return result.get("users", []) or list(result.values())
        return []

    async def get_ticket_history(self, ticket_id: int) -> list[dict]:
        """
        Retorna os eventos de histórico de um ticket.
        Endpoint Zammad: GET /api/v1/ticket_history/{id}

        Filtra apenas eventos relevantes para jornada:
          • type = 'created'
          • attribute in ('state', 'owner', 'owner_id')
        """
        result = await self.get(f"/ticket_history/{ticket_id}")
        # A API retorna {"history": [...]} ou diretamente uma lista
        if isinstance(result, dict):
            events = result.get("history", [])
        elif isinstance(result, list):
            events = result
        else:
            events = []

        relevant_fields = {"state", "owner", "owner_id"}
        filtered = []
        for evt in events:
            etype = (evt.get("type") or evt.get("history_type") or "").lower()
            field = (evt.get("attribute") or evt.get("history_attribute") or "").lower()
            if etype == "created" or field in relevant_fields:
                filtered.append(evt)
        return filtered
