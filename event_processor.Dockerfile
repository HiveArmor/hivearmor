ARG BASE_IMAGE

FROM ${BASE_IMAGE}

COPY ./geolocation/ /workdir/geolocation/
COPY ./plugins/alerts/com.hivearmor.alerts.plugin /workdir/plugins/utmstack/
COPY ./plugins/aws/com.hivearmor.aws.plugin /workdir/plugins/utmstack/
COPY ./plugins/azure/com.hivearmor.azure.plugin /workdir/plugins/utmstack/
COPY ./plugins/bitdefender/com.hivearmor.bitdefender.plugin /workdir/plugins/utmstack/
COPY ./plugins/config/com.hivearmor.config.plugin /workdir/plugins/utmstack/
COPY ./plugins/events/com.hivearmor.events.plugin /workdir/plugins/utmstack/
COPY ./plugins/gcp/com.hivearmor.gcp.plugin /workdir/plugins/utmstack/
COPY ./plugins/geolocation/com.hivearmor.geolocation.plugin /workdir/plugins/utmstack/
COPY ./plugins/inputs/com.hivearmor.inputs.plugin /workdir/plugins/utmstack/
COPY ./plugins/o365/com.hivearmor.o365.plugin /workdir/plugins/utmstack/
COPY ./plugins/sophos/com.hivearmor.sophos.plugin /workdir/plugins/utmstack/
COPY ./plugins/stats/com.hivearmor.stats.plugin /workdir/plugins/utmstack/
COPY ./plugins/soc-ai/com.hivearmor.soc-ai.plugin /workdir/plugins/utmstack/
COPY ./plugins/modules-config/com.hivearmor.modules-config.plugin /workdir/plugins/utmstack/
COPY ./plugins/crowdstrike/com.hivearmor.crowdstrike.plugin /workdir/plugins/utmstack/
COPY ./plugins/feeds/com.hivearmor.feeds.plugin /workdir/plugins/utmstack/
