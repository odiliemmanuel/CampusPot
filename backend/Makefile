.PHONY: run build tidy fmt vet test seed docker-up docker-down

run:
	go run ./cmd/api

build:
	go build -o bin/campuspot ./cmd/api

seed:
	go run ./cmd/seed

tidy:
	go mod tidy

fmt:
	go fmt ./...

vet:
	go vet ./...

test:
	go test ./... -v

docker-up:
	docker compose up -d db

docker-down:
	docker compose down
