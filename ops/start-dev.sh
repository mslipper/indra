#!/usr/bin/env bash
set -e

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
project="`cat $dir/../package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

# Turn on swarm mode if it's not already on
docker swarm init 2> /dev/null || true

####################
# Load env vars

# alias env var
INDRA_LOG_LEVEL="$LOG_LEVEL";

function extractEnv {
  grep "$1" "$2" | cut -d "=" -f 2- | tr -d '\n\r"' | sed 's/ *#.*//'
}

# First choice: use existing env vars (dotEnv not called)
function dotEnv {
  key="$1"
  if [[ -f .env && -n "`extractEnv $key .env`" ]] # Second choice: load from custom secret env
  then extractEnv $key .env
  elif [[ -f dev.env && -n "`extractEnv $key dev.env`" ]] # Third choice: load from public defaults
  then extractEnv $key dev.env
  fi
}

export INDRA_ADMIN_TOKEN="${INDRA_ADMIN_TOKEN:-`dotEnv INDRA_ADMIN_TOKEN`}"
export INDRA_ETH_PROVIDER="${INDRA_ETH_PROVIDER:-`dotEnv INDRA_ETH_PROVIDER`}"
export INDRA_LOG_LEVEL="${INDRA_LOG_LEVEL:-`dotEnv INDRA_LOG_LEVEL`}"
INDRA_NATS_JWT_SIGNER_PRIVATE_KEY="${INDRA_NATS_JWT_SIGNER_PRIVATE_KEY:-`dotEnv INDRA_NATS_JWT_SIGNER_PRIVATE_KEY`}"
INDRA_NATS_JWT_SIGNER_PUBLIC_KEY="${INDRA_NATS_JWT_SIGNER_PUBLIC_KEY:-`dotEnv INDRA_NATS_JWT_SIGNER_PUBLIC_KEY`}"

# Make sure keys have proper newlines inserted
# (bc GitHub Actions strips newlines from secrets)
export INDRA_NATS_JWT_SIGNER_PRIVATE_KEY=`
  echo $INDRA_NATS_JWT_SIGNER_PRIVATE_KEY | tr -d '\n\r' |\
  sed 's/-----BEGIN RSA PRIVATE KEY-----/\\\n-----BEGIN RSA PRIVATE KEY-----\\\n/' |\
  sed 's/-----END RSA PRIVATE KEY-----/\\\n-----END RSA PRIVATE KEY-----\\\n/'`

export INDRA_NATS_JWT_SIGNER_PUBLIC_KEY=`
  echo $INDRA_NATS_JWT_SIGNER_PUBLIC_KEY | tr -d '\n\r' |\
  sed 's/-----BEGIN PUBLIC KEY-----/\\\n-----BEGIN PUBLIC KEY-----\\\n/' | \
  sed 's/-----END PUBLIC KEY-----/\\\n-----END PUBLIC KEY-----\\\n/'`

####################
# Internal Config
# config & hard-coded stuff you might want to change

ganacheProvider="http://ethprovider:8545"
number_of_services=5 # NOTE: Gotta update this manually when adding/removing services :(

nats_port=4222
node_port=8080
dash_port=9999
webserver_port=3000
ganacheId="4447"

# Prefer top-level address-book override otherwise default to one in contracts
if [[ -f address-book.json ]]
then eth_contract_addresses="`cat address-book.json | tr -d ' \n\r'`"
else eth_contract_addresses="`cat modules/contracts/address-book.json | tr -d ' \n\r'`"
fi
eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"

if [[ "$INDRA_ETH_PROVIDER" == "$ganacheProvider" ]]
then chainId="$ganacheId"
else
  echo "Fetching chainId from ${INDRA_ETH_PROVIDER}"
  chainId="`curl -q -k -s -H "Content-Type: application/json" -X POST --data '{"id":1,"jsonrpc":"2.0","method":"net_version","params":[]}' $INDRA_ETH_PROVIDER | jq .result | tr -d '"'`"
fi

token_address="`echo $eth_contract_addresses | jq '.["'"$chainId"'"].Token.address' | tr -d '"'`"
allowed_swaps='[{"from":"'"$token_address"'","to":"0x0000000000000000000000000000000000000000","priceOracleType":"HARDCODED"},{"from":"0x0000000000000000000000000000000000000000","to":"'"$token_address"'","priceOracleType":"HARDCODED"}]'

if [[ -z "$chainId" || "$chainId" == "null" ]]
then echo "Failed to fetch chainId from provider ${INDRA_ETH_PROVIDER}" && exit 1;
else echo "Got chainId $chainId, using token $token_address"
fi

if [[ "$chainId" == "$ganacheId" ]]
then make deployed-contracts
fi

# database connection settings
pg_db="$project"
pg_password_file="/run/secrets/${project}_database_dev"
pg_host="database"
pg_port="5432"
pg_user="$project"

nats_port="4222"
nats_ws_port="4221"

# docker images
builder_image="${project}_builder"
webserver_image="$builder_image"
database_image="${project}_database"
ethprovider_image="$builder_image"
nats_image="provide/nats-server:indra"
node_image="$builder_image"
proxy_image="${project}_proxy"
redis_image="redis:5-alpine"

####################
# Deploy according to above configuration

if [[ "$INDRA_UI" == "headless" ]]
then
  webserver_service=""
else
  if [[ "$INDRA_UI" == "dashboard" ]]
  then webserver_working_dir=/root/modules/dashboard
  elif [[ "$INDRA_UI" == "daicard" ]]
  then webserver_working_dir=/root/modules/daicard
  else
    echo "INDRA_UI: Expected headless, dashboard, or daicard"
    exit 1
  fi
  number_of_services=$(( $number_of_services + 2 ))
  webserver_services="
  proxy:
    image: '$proxy_image'
    environment:
      ETH_PROVIDER_URL: '$INDRA_ETH_PROVIDER'
      MESSAGING_TCP_URL: 'nats:4222'
      MESSAGING_WS_URL: 'nats:4221'
      NODE_URL: 'node:8080'
      WEBSERVER_URL: 'webserver:3000'
    networks:
      - '$project'
    ports:
      - '3000:80'
    volumes:
      - 'certs:/etc/letsencrypt'

  webserver:
    image: '$webserver_image'
    entrypoint: 'npm start'
    environment:
      NODE_ENV: 'development'
    networks:
      - '$project'
    volumes:
      - '`pwd`:/root'
    working_dir: '$webserver_working_dir'
  "
fi

# Get images that we aren't building locally
function pull_if_unavailable {
  if [[ -z "`docker image ls | grep ${1%:*} | grep ${1#*:}`" ]]
  then docker pull $1
  fi
}
pull_if_unavailable "$database_image"
pull_if_unavailable "$ethprovider_image"
pull_if_unavailable "$nats_image"
pull_if_unavailable "$redis_image"

# Initialize random new secrets
function new_secret {
  secret=$2
  if [[ -z "$secret" ]]
  then secret=`head -c 32 /dev/urandom | xxd -plain -c 32 | tr -d '\n\r'`
  fi
  if [[ -z "`docker secret ls -f name=$1 | grep -w $1`" ]]
  then
    id=`echo $secret | tr -d '\n\r' | docker secret create $1 -`
    echo "Created secret called $1 with id $id"
  fi
}
new_secret "${project}_database_dev" "$project"

# Deploy with an attachable network so tests & the daicard can connect to individual components
if [[ -z "`docker network ls -f name=$project | grep -w $project`" ]]
then
  id="`docker network create --attachable --driver overlay $project`"
  echo "Created ATTACHABLE network with id $id"
fi

mkdir -p /tmp/$project
cat - > /tmp/$project/docker-compose.yml <<EOF
version: '3.4'

networks:
  $project:
    external: true

secrets:
  ${project}_database_dev:
    external: true

volumes:
  certs:
  chain_dev:
  database_dev:

services:

  $webserver_services

  node:
    image: '$node_image'
    entrypoint: 'bash modules/node/ops/entry.sh'
    environment:
      INDRA_ADMIN_TOKEN: '$INDRA_ADMIN_TOKEN'
      INDRA_ALLOWED_SWAPS: '$allowed_swaps'
      INDRA_ETH_CONTRACT_ADDRESSES: '$eth_contract_addresses'
      INDRA_ETH_MNEMONIC: '$eth_mnemonic'
      INDRA_ETH_RPC_URL: '$INDRA_ETH_PROVIDER'
      INDRA_LOG_LEVEL: '$INDRA_LOG_LEVEL'
      INDRA_NATS_JWT_SIGNER_PRIVATE_KEY: '$INDRA_NATS_JWT_SIGNER_PRIVATE_KEY'
      INDRA_NATS_JWT_SIGNER_PUBLIC_KEY: '$INDRA_NATS_JWT_SIGNER_PUBLIC_KEY'
      INDRA_NATS_SERVERS: 'nats://nats:$nats_port'
      INDRA_NATS_WS_ENDPOINT: 'wss://nats:$nats_ws_port'
      INDRA_PG_DATABASE: '$pg_db'
      INDRA_PG_HOST: '$pg_host'
      INDRA_PG_PASSWORD_FILE: '$pg_password_file'
      INDRA_PG_PORT: '$pg_port'
      INDRA_PG_USERNAME: '$pg_user'
      INDRA_PORT: '$node_port'
      INDRA_REDIS_URL: 'redis://redis:6379'
      NODE_ENV: 'development'
    networks:
      - '$project'
    ports:
      - '$node_port:$node_port'
      - '9229:9229'
    secrets:
      - '${project}_database_dev'
    volumes:
      - '`pwd`:/root'

  ethprovider:
    image: '$ethprovider_image'
    entrypoint: bash modules/contracts/ops/entry.sh
    command: 'start'
    environment:
      ETH_MNEMONIC: '$eth_mnemonic'
    networks:
      - '$project'
    ports:
      - '8545:8545'
    volumes:
      - '`pwd`:/root'
      - 'chain_dev:/data'

  database:
    image: '$database_image'
    deploy:
      mode: 'global'
    environment:
      CHAIN_ID: '$chainId'
      POSTGRES_DB: '$project'
      POSTGRES_PASSWORD_FILE: '$pg_password_file'
      POSTGRES_USER: '$project'
    networks:
      - '$project'
    ports:
      - '$pg_port:$pg_port'
    secrets:
      - '${project}_database_dev'
    volumes:
      - 'database_dev:/var/lib/postgresql/data'

  nats:
    command: -D -V
    image: '$nats_image'
    environment:
      JWT_SIGNER_PUBLIC_KEY: '$INDRA_NATS_JWT_SIGNER_PUBLIC_KEY'
    networks:
      - '$project'
    ports:
      - '$nats_port:$nats_port'
      - '$nats_ws_port:$nats_ws_port'

  redis:
    image: '$redis_image'
    networks:
      - '$project'
    ports:
      - '6379:6379'

EOF

docker stack deploy -c /tmp/$project/docker-compose.yml $project

echo -n "Waiting for the $project stack to wake up."
while [[ "`docker container ls | grep $project | wc -l | tr -d ' '`" != "$number_of_services" ]]
do echo -n "." && sleep 2
done
echo " Good Morning!"
