# Djuu API: PocketBase from the official release, checksum verified, running as an unprivileged user.
FROM alpine:3.20
ARG PB_VERSION=0.40.6
RUN apk add --no-cache ca-certificates unzip wget \
 && cd /tmp \
 && wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
 && wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/checksums.txt \
 && grep "pocketbase_${PB_VERSION}_linux_amd64.zip$" checksums.txt | sha256sum -c - \
 && mkdir -p /pb && unzip -q pocketbase_${PB_VERSION}_linux_amd64.zip pocketbase -d /pb \
 && rm -f /tmp/*.zip /tmp/checksums.txt
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks
RUN adduser -D -H pb && mkdir -p /pb/pb_data && chown -R pb /pb
USER pb
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--origins=https://dschulien91.github.io,https://djuu.de,https://www.djuu.de,http://localhost:8765"]
