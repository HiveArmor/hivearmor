# Stage 1: Build
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY pom.xml settings.xml ./
COPY src ./src
RUN mvn -B -s settings.xml -DskipTests package

# Stage 2: Runtime (Selenium + Chrome for PDF generation)
# selenium/standalone-chrome is x86_64 only; force amd64 for Rosetta on Apple Silicon
FROM --platform=linux/amd64 selenium/standalone-chrome:latest
USER root
COPY --from=builder /build/target/web-pdf-1.0.0.jar ./

EXPOSE 8080

CMD /opt/bin/entry_point.sh & java -jar web-pdf-1.0.0.jar
