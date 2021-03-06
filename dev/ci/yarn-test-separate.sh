#!/usr/bin/env bash

set -e

echo "--- yarn in root"
yarn --frozen-lockfile --network-timeout 60000

cd $1
echo "--- yarn"
yarn --frozen-lockfile --network-timeout 60000

echo "--- test"

# Limit the number of workers to prevent the default of 1 worker per core from
# causing OOM on the buildkite nodes that have 96 CPUs. 4 matches the CPU limits
# in infrastructure/kubernetes/ci/buildkite/buildkite-agent/buildkite-agent.Deployment.yaml
yarn -s run test --maxWorkers 4 --verbose
