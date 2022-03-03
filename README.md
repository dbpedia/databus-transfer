# databus-transfer
Transfer published data to a new Databus

# DEBUG BRANCH!

* SENDS POST TO http://localhost:3002/graph/save
* NEEDS A RUNNING GSTORE ON http://localhost:3002
* SENDS ALL DATAIDS IN DEBUG-IN FOLDER

Requirements:

docker, docker-compose, curl

To Reproduce:

1) start gstore and virtuoso with `docker-compose up` 

2) run:
```
bash debug.sh
```

## Error should be thrown on mappings-mappingbased-literals-2018.12.01-dataid.jsonld

Only occurs when the data in `mappings-mappingbased-literals-2018.12.01-dataid.jsonld` is NOT the first insert. After a successful insert, a repeated insert will not fail.

