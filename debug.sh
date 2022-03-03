#!/bin/bash
for filename in ./debug-in/*.jsonld; do
    name=${filename##*/}
    echo $name
    curl -H 'Accept: application/ld+json' -H 'Content-Type: application/ld+json' --data "@$filename" "http://localhost:3002/graph/save?path=${name}&repo=test"
    echo \n 
done