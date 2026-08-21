FROM eclipse-temurin:17

ARG CACHE_BUST=1
RUN echo "Cache bust: $CACHE_BUST"
# The local-dev compose build context is the repository root. Maven writes the
# deployable WAR under backend/target, so reference that path explicitly rather
# than accidentally packaging a stale repository-root target artifact.
ADD backend/target/hivearmor.war ./hivearmor.war
COPY filters /hivearmor/filters
COPY rules /hivearmor/rules
COPY backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV SPRING_PROFILES_ACTIVE=dev

HEALTHCHECK --start-period=60s --interval=60s --timeout=60s --retries=3 \
  CMD curl -f http://localhost:8080/api/healthcheck || exit 1

EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
