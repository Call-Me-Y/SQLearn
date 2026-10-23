
# SQLearn Lab — Setup & Usage Guide

## 1. Import Database Image

```bash
docker import sqlearn.tar sqlearn
```

## 2. Start SQL Server Container

```bash
docker run -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=StrongPassword" \
  -p 1400:1433 \
  --name sqlearn \
  --hostname sqlhost \
  -d \
  sqlearn:latest \
  /opt/mssql/bin/sqlservr
```

> **Note:** SQL Server requires at least **2 GB RAM**. Wait 10–30 seconds for full initialization.

Verify it's running:

```bash
docker ps
docker logs sqlearn --tail 20
```

Look for: `SQL Server is now ready for client connections`

## 3. Change SA Password

```bash
docker exec -it sqlearn /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P StrongPassword -C
```

Once inside the `1>` prompt:

```sql
ALTER LOGIN sa WITH PASSWORD = 'StrongPassword@123';
GO
EXIT
```

Reconnect with the new password:

```bash
docker exec -it sqlearn /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P 'StrongPassword@123' -C
```

## 4. Backend Environment Setup

### Option A: Python Virtual Environment (Recommended)

```bash
python3 -m venv sqlearnEnv
source sqlearnEnv/bin/activate
```

### Option B: Conda

```bash
conda create -n sqlearnEnv python=3.10 -y
conda activate sqlearnEnv
```

> **Important:** Python 3.12+ is not supported by `pyodbc` / `pymssql`. Use **Python 3.10 or 3.11**.

## 5. Install Dependencies

```bash
pip install --upgrade pip
sudo apt-get install -y unixodbc-dev gcc g++
pip install -r requirements.txt
```

If `requirements.txt` includes `pyodbc` or `pymssql`, ensure system libraries are present:

| Package | Required System Library |
|---------|----------------------|
| `pyodbc` | `unixodbc-dev` |
| `pymssql` | `freetds-dev` |

## 6. Launch the Application

```bash
python3 app.py
```

## 7. Quick Connection Test (Python)

```python
import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost,1400;"
    "UID=sa;"
    "PWD=StrongPassword@123;"
    "TrustServerCertificate=yes;"
)
cursor = conn.cursor()
cursor.execute("SELECT @@VERSION")
print(cursor.fetchone())
```

## 8. Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `sqlcmd: SSL certificate verify failed` | ODBC Driver 18 enforces encryption | Add `-C` flag |
| `pyodbc build failed` | Python ≥ 3.12 | Downgrade to Python 3.10 |
| `sqlcmd: no such file or directory` | Wrong tools path | Try `/opt/mssql-tools18/bin/sqlcmd` |
| Container exits immediately | Insufficient memory | Allocate ≥ 2 GB RAM |
| Login failed | Wrong password | Reset via single-user mode or recreate container |

## 9. Reset Everything (Clean Slate)

```bash
docker rm -f sqlearn
docker run -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=StrongPassword@123" \
  -p 1400:1433 \
  --name sqlearn \
  -d \
  sqlearn:latest
```
