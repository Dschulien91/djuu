# Djuu API: PocketBase from the official release, checksum verified, running as an unprivileged user.
# The SHA-256 is pinned here (from the release's checksums.txt), so a changed download fails the build.
FROM alpine:3.20
ARG PB_VERSION=0.40.6
ARG PB_SHA256=0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f
RUN apk add --no-cache ca-certificates unzip wget \
 && cd /tmp \
 && wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
 && echo "${PB_SHA256}  pocketbase_${PB_VERSION}_linux_amd64.zip" | sha256sum -c - \
 && mkdir -p /pb && unzip -q pocketbase_${PB_VERSION}_linux_amd64.zip pocketbase -d /pb \
 && rm -f /tmp/*.zip
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks
RUN adduser -D -H pb && mkdir -p /pb/pb_data && chown -R pb /pb
USER pb
EXPOSE 8090
# only the app's own origins; local tests run their own PocketBase
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--origins=https://dschulien91.github.io,https://djuu.de,https://www.djuu.de"]
