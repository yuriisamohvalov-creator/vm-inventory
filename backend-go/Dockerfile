FROM golang:1.22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -mod=mod -o /out/server ./cmd/server

FROM alpine:3.20
WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata ttf-dejavu

COPY --from=builder /out/server /app/server
COPY --from=builder /app/db/migrations /app/db/migrations
RUN mkdir -p /app/fonts && cp /usr/share/fonts/dejavu/DejaVuSans.ttf /app/fonts/DejaVuSans.ttf

EXPOSE 8000

CMD ["/app/server"]
