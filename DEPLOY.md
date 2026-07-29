# Deploy — NOC Dashboard (200.159.177.242:8090)

## Pré-requisitos no servidor
- Docker + Docker Compose instalados
- Porta 8090 liberada no firewall

---

## 1. Build do frontend (faça na sua máquina antes de enviar)

```bash
cd noc-web
npm install
npm run build
cd ..
```

O build gera `noc-web/dist/` que o nginx vai servir.

---

## 2. Copiar arquivos para o servidor

```bash
# Na sua máquina — ajuste o usuário SSH conforme necessário
scp -r . usuario@200.159.177.242:/opt/noc-dashboard/
```

**Arquivos obrigatórios no servidor:**
- `app/` (código backend)
- `noc-web/dist/` (frontend compilado)
- `Dockerfile`
- `docker-compose.yml`
- `nginx.conf`
- `requirements.txt`
- `.env` (crie manualmente no servidor — veja passo 3)

---

## 3. Criar o `.env` no servidor

No servidor, crie `/opt/noc-dashboard/.env`:

```env
ZAMMAD_URL=https://suporte.fluxtelecom.com.br
ZAMMAD_TOKEN=x734cLL8RPj7yh2Fd3mB5J731iqPEDgZbk_MBXirIeEt3v8ptdRGiRVpxQw725r6

RATE_LIMIT_CAPACITY=20
RATE_LIMIT_REFILL_RATE=2.0

DATABASE_URL=sqlite+aiosqlite:////data/zammad_noc.db
SYNC_INTERVAL_SECONDS=60
SLA_ALERT_MINUTES=15

APP_ENV=production
LOG_LEVEL=INFO

JWT_SECRET=af22d28c45d9a3ba7c0638d5d63fcf0d29d2e447a7dbcd0d93ef0b12e9c8879e
JWT_ALGORITHM=HS256
JWT_EXPIRE_HOURS=8

NOC_USERNAME=noc@flux
NOC_PASSWORD_HASH=$2b$12$h1gc7ZMEluUaF1l20ROhH.zqTyG28Fqe7ZYtysVTR1dceT3PHnnCa
```

> ⚠️ Nunca commite o `.env` no git. O banco de dados fica persistido no volume Docker `noc_data`.

---

## 4. Subir os containers

```bash
cd /opt/noc-dashboard

# Primeira vez (ou após atualizar o código backend):
docker compose up -d --build

# Para ver os logs:
docker compose logs -f

# Para parar:
docker compose down
```

---

## 5. Acessar

Abra: **http://200.159.177.242:8090**

Login: `noc@flux` / `!=Flux-qw31`

---

## Atualizar após mudanças

```bash
# Na sua máquina:
cd noc-web && npm run build && cd ..
scp -r noc-web/dist app Dockerfile requirements.txt usuario@200.159.177.242:/opt/noc-dashboard/

# No servidor:
cd /opt/noc-dashboard
docker compose up -d --build
```
