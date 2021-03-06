FROM alpine:3.9@sha256:644fcb1a676b5165371437feaa922943aaf7afcfa8bfee4472f6860aad1ef2a0 as builder

RUN apk add --no-cache bash=4.4.19-r1 git=2.20.1-r0 openssh=7.9_p1-r6 build-base=0.5-r1

WORKDIR /opt
RUN git clone --branch v0.14.0 https://github.com/google/jsonnet.git

WORKDIR /opt/jsonnet
RUN make

RUN mkdir /dashboards
COPY jsonnet /dashboards
WORKDIR /dashboards

ENV PATH="/opt/jsonnet:${PATH}"

RUN ./build.sh

# TODO(uwedeportivo): remove once eric's PR lands
# temporary fix for status_code <-> code label discrepancy in metrics (lsif code base uses status_code, rest uses code)
RUN sed -i -e 's/{code=~/{status_code=~/g' lsif.json

FROM grafana/grafana:6.4.2@sha256:8c2238eea9d3d39aeb6174db2e30b233fd2546128ec1fa1bc64f8058afd51e68 as production

LABEL org.opencontainers.image.url=https://sourcegraph.com/
LABEL org.opencontainers.image.source=https://github.com/sourcegraph/sourcegraph/
LABEL org.opencontainers.image.documentation=https://docs.sourcegraph.com/
LABEL com.sourcegraph.grafana.version=6.4.2

# hadolint ignore=DL3020
ADD --chown=grafana:grafana config /sg_config_grafana

COPY --from=builder /dashboards/*.json /sg_config_grafana/provisioning/dashboards/sourcegraph/

# hadolint ignore=DL3020
ADD --chown=grafana:grafana entry.sh /

USER grafana
ENTRYPOINT ["/entry.sh"]
