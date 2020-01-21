#!/bin/bash

if [ -n "$ROUTER_URL" ]; then
  SERVICE_ROUTER_URL=${SERVICE_NAME}-${ROUTER_URL}
else
  SERVICE_ROUTER_URL=""
fi

TEMPLATE_ADDITIONAL_PARAMETERS=()

if [[ $(oc process --local -f ${OPENSHIFT_TEMPLATE} --parameters | grep ENVIRONMENT_TYPE) ]]; then
  TEMPLATE_ADDITIONAL_PARAMETERS+=(-p "ENVIRONMENT_TYPE=${ENVIRONMENT_TYPE}")
fi

oc process  --local -o yaml --insecure-skip-tls-verify \
  -n ${OPENSHIFT_PROJECT} \
  -f ${OPENSHIFT_TEMPLATE} \
  -p SERVICE_NAME="${SERVICE_NAME}" \
  -p SAFE_BRANCH="${SAFE_BRANCH}" \
  -p SAFE_PROJECT="${SAFE_PROJECT}" \
  -p BRANCH="${BRANCH}" \
  -p PROJECT="${PROJECT}" \
  -p LAGOON_GIT_SHA="${LAGOON_GIT_SHA}" \
  -p SERVICE_ROUTER_URL="${SERVICE_ROUTER_URL}" \
  -p REGISTRY="${OPENSHIFT_REGISTRY}" \
  -p OPENSHIFT_PROJECT=${OPENSHIFT_PROJECT} \
  "${TEMPLATE_PARAMETERS[@]}" \
  "${TEMPLATE_ADDITIONAL_PARAMETERS[@]}" \
  | outputToYaml
