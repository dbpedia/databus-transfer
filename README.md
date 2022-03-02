# databus-transfer
Transfer published data to a new Databus

# DEBUG BRANCH!

* NO API KEY NEEDED
* SENDS POST TO http://localhost:3002/graph/save
* NEEDS A RUNNING GSTORE ON http://localhost:3002

Example Usage:

start Gstore with `docker-compose up` and the following config

```
version: "3.0"
services:
  gstore:
    image: dbpedia/gstore
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
    environment:
      DBA_PASSWORD: "everyoneknows"
      SPARQL_UPDATE: "true"
      DEFAULT_GRAPH: "http://localhost:3000"
    ports:
      - "127.0.0.1:3003:8890"
    volumes: 
      - ./data/virtuoso:/data
```

Then:
```
bash run.sh -s https://databus.dbpedia.org/dbpedia -t http://localhost:3000/debug -o 0 -g false
```

## ERROR WILL OCCUR AT [179/1092]

Transfer will exit on error, latest dataid can be found in `current.jsonld`.
