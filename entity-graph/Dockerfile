FROM golang:1.26 AS builder

WORKDIR /app
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o /entity-graph .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /entity-graph /entity-graph
ENTRYPOINT ["/entity-graph"]
