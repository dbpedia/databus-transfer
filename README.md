# databus-transfer
Transfer published data to a new Databus

# DEBUG BRANCH!

* NO API KEY NEEDED
* SENDS POST TO http://localhost:3002/graph/save
* NEEDS A RUNNING GSTORE ON http://localhost:3002


Example Usage:
```
bash run.sh -s https://databus.dbpedia.org/dbpedia -t http://localhost:3000/jan -o 0 -g false
```

Parameters:
* s: source account on DBpedia Databus (v.1)
* t: target account on target Databus (v.2)
* a: API key of target account
* o: Offset. Skips a number of DataIds
* g: Boolean. If false, group publishing is skipped.


Transfer will exit on error, latest dataid can be found in `current.jsonld`.
