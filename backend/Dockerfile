FROM eclipse-temurin:17

ARG CACHE_BUST=1
RUN echo "Cache bust: $CACHE_BUST"
ADD target/hivearmor.war ./hivearmor.war
COPY filters /hivearmor/filters
COPY rules /hivearmor/rules

ENV SPRING_PROFILES_ACTIVE=dev

HEALTHCHECK --start-period=60s --interval=60s --timeout=60s --retries=3 \
  CMD curl -f http://localhost:8080/api/healthcheck || exit 1

EXPOSE 8080
ENTRYPOINT ["java", \
  "-Djakarta.json.provider=org.eclipse.parsson.JsonProviderImpl", \
  "-Dorg.eclipse.parsson.JsonProviderImpl=true", \
  "-jar", "hivearmor.war"]
