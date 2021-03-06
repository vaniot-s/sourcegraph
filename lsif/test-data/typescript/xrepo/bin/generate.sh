#!/bin/bash

LSIF_TSC=${LSIF_TSC:-`which lsif-tsc`}
LSIF_NPM=${LSIF_NPM:-`which lsif-npm`}

trap '{ rm -r ./repos; }' EXIT

# Generate math-util
DIR=./repos REPO=a ./bin/generate-a.sh

for i in `seq 1 3`; do
    # Generate dependencies
    DIR=./repos REPO="b${i}" DEP=`pwd`/repos/a ./bin/generate-b.sh
    DIR=./repos REPO="c${i}" DEP=`pwd`/repos/a ./bin/generate-c.sh
done

mkdir -p data

for repo in `ls repos`; do
    cd "./repos/${repo}"
    ${LSIF_TSC} -p tsconfig.json --noContents --stdout | ${LSIF_NPM} --stdin --out "../../data/${repo}.lsif"
    cd - > /dev/null
done

gzip ./data/*.lsif
