from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# timeout=30 → SQLite aguarda até 30 s por uma trava antes de falhar.
# Isso resolve conflitos entre o loop de sync e escritas dos endpoints.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"timeout": 30, "check_same_thread": False},
)


# WAL (Write-Ahead Log) permite leituras simultâneas durante uma escrita.
# Sem WAL, uma escrita do sync bloqueia QUALQUER outro acesso — gerando o
# "database is locked" em /noc/queue quando tentava salvar o snapshot diário.
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def create_tables() -> None:
    async with engine.begin() as conn:
        from app.models.ticket       import SyncMeta, Ticket   # noqa: F401
        from app.models.ticket_event import TicketEvent        # noqa: F401
        from app.models.zammad_user  import ZammadUser         # noqa: F401
        await conn.run_sync(Base.metadata.create_all)

        # Migração leve: create_all não altera tabelas existentes, então
        # adicionamos colunas novas manualmente (ignora se já existir).
        for coldef in ("recipient VARCHAR(512)",):
            try:
                await conn.exec_driver_sql(f"ALTER TABLE tickets ADD COLUMN {coldef}")
            except Exception:
                pass  # coluna já existe
