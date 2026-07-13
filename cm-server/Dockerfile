FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o cm-server .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /app/cm-server /usr/local/bin/cm-server
EXPOSE 8080
ENTRYPOINT ["cm-server"]
