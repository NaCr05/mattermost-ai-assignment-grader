FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648

COPY Caddyfile /etc/caddy/Caddyfile

RUN mkdir -p /data /config \
    && chown -R 10001:10001 /data /config /etc/caddy

USER 10001:10001

EXPOSE 8080 8081 8443 8443/udp

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
