# Djuu nightly event refresh: the provider importers and the export, nothing else. Runs as an unprivileged user.
FROM python:3.12-slim
RUN pip install --no-cache-dir requests==2.32.3 pdfplumber==0.11.4 && useradd -m -u 1000 djuu
WORKDIR /work
USER djuu
CMD ["python", "tools/refresh.py", "--no-push"]
