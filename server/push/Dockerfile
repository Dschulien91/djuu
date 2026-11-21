# Djuu push sender: fetches due messages from the API inside djuu_net and sends them as Web Push (VAPID).
# Runs as an unprivileged user. The VAPID private key and the shared secret live on the server (/opt/djuu/push/),
# never in the image or the repo.
FROM python:3.12-slim
RUN pip install --no-cache-dir pywebpush==2.5.0 requests==2.32.3 && useradd -m -u 1001 push
COPY sender.py gen_vapid.py /app/
WORKDIR /app
USER push
CMD ["python", "-u", "sender.py"]
