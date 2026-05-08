FROM python:3.12-slim

WORKDIR /app

# Dépendances système légères
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
 && rm -rf /var/lib/apt/lists/*

# Dépendances Python
COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt

# Code source
COPY src/ src/

# Données générées et modèles montés en volume (voir docker-compose.yml)
# Les répertoires doivent exister pour que les volumes se montrent correctement
RUN mkdir -p models data/generated reports

EXPOSE 8000

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
