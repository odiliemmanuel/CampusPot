# --- build stage: compile a static Linux binary -----------------------------
FROM golang:1.23-alpine AS build
WORKDIR /src

# Cache dependencies first so code changes don't re-download modules.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/campuspot ./cmd/api

# --- runtime stage: tiny image with CA certs -------------------------------
FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
    && adduser -D -u 10001 appuser

COPY --from=build /out/campuspot /usr/local/bin/campuspot

USER appuser
# Render injects PORT; the app reads it and defaults to 8080.
EXPOSE 8080
ENTRYPOINT ["campuspot"]
