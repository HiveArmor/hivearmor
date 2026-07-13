FROM postgres:16-alpine

ENV POSTGRES_DB=hivearmor
ENV POSTGRES_USER=postgres

COPY init.sql /docker-entrypoint-initdb.d/init.sql
