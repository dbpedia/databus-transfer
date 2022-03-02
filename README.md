# databus-transfer
Transfer published data to a new Databus

Example Usage:

start Gstore with `docker-compose up` and the following config

```
version: "3.0"
services:
  gstore:
    image: dbpedia/gstore
    container_name: devenv_gstore
    environment: 
      VIRT_USER: "dba"
      VIRT_PASS: "everyoneknows"
      VIRT_URI: "http://virtuoso:8890"
      GIT_ROOT: "/root/git"
    ports:
      - "127.0.0.1:3002:8080"
    volumes:
      - ./data/repo:/root/git
  virtuoso:
    image: "openlink/virtuoso-opensource-7"
    container_name: devenv_virtuoso
    environment:
      DBA_PASSWORD: "everyoneknows"
      SPARQL_UPDATE: "true"
      DEFAULT_GRAPH: "http://localhost:3000"
    ports:
      - "127.0.0.1:3003:8890"
    volumes: 
      - ./data/virtuoso:/data
```

bash run.sh -s https://databus.dbpedia.org/dbpedia -t http://localhost:3000/jan -a 45c08e6b-6f0c-4922-91ca-8ad1d93075c2 -o 0 -g true
```

Parameters:
* s: source account on DBpedia Databus (v.1)
* t: target account on target Databus (v.2)
* a: API key of target account
* o: Offset. Skips a number of DataIds
* g: Boolean. If false, group publishing is skipped.


Transfer will exit on error, latest dataid can be found in `current.jsonld`.
