# databus-transfer
Transfer published data to a new Databus

Example Usage:
```
bash run.sh -s https://databus.dbpedia.org/dbpedia -t http://localhost:3000/janni -a 45c08e6b-6f0c-4922-91ca-8ad1d93075c2 -o 0 -g true
```

Parameters:
* s: source account on DBpedia Databus (v.1)
* t: target account on target Databus (v.2)
* a: API key of target account
* o: Offset. Skips a number of DataIds
* g: Boolean. If false, group publishing is skipped.


Transfer will exit on error, latest dataid can be found in `current.jsonld`.
