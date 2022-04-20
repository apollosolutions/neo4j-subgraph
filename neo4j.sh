CURRENT_DIR=$(pwd)
set -x;
docker run -d --name neo4j -p 7474:7474 -p 7473:7473 -p 7687:7687 \
    -v "$CURRENT_DIR/neo4j-data:/data" -e NEO4J_AUTH=neo4j/test neo4j:latest