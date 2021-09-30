#!/usr/bin/env node

/**
 * TRANSFER GROUPS AND ARTIFACTS OF AN ACCOUNT FROM DATABUS V1 to DATABUS V2
 * sourceUri specifies an account on the source Databus
 * targetURI specifies an account on the target Databus
 */
const fs = require('fs');
const path = require('path');
const got = require('got');
const ttl2jsonld = require('@frogcat/ttl2jsonld').parse;

// Parse CLI parameters
var sourceUri = "";
var targetUri = "";
var apiKey = "";

for (var i = 2; i < process.argv.length; i++) {
  if (process.argv[i] == "-a") {
    apiKey = process.argv[i + 1];
  }
  if (process.argv[i] == "-t") {
    targetUri = new URL(process.argv[i + 1]);
  }
  if (process.argv[i] == "-s") {
    sourceUri = new URL(process.argv[i + 1]);
  }
}

console.log(apiKey);
console.log(targetUri);
console.log(sourceUri);

// Start the transfer process
transfer();

async function transfer() {

  // TODO: Configurable?
  var sourceEndpoint = sourceUri.origin + '/repo/sparql';

  // Fetch the list of groups from the specified account of the source Databus.
  var selectGroupsQuery = fs.readFileSync(path.resolve(__dirname, 'select-groups.sparql'), 'utf8');
  selectGroupsQuery = selectGroupsQuery.replace('%SOURCE%', sourceUri.href);
  var groups = [];

  try {
    console.log(`Selecting groups...`);
    var requestUri = sourceEndpoint + `?query=${encodeURIComponent(selectGroupsQuery)}`;
    var res = await got.get(requestUri, { responseType: 'json' });
    for (var entry of res.body.results.bindings) {
      groups.push(entry.s.value);
    }
  } catch (e) {
    console.log(e);
  }

  console.log(`Found ${groups.length} groups.`);

  // Foreach found group query additional data and prepare the groupdata object
  for (var uri of groups) {

    // Initialize groupdata with fixed values
    var groupdata = {
      "@id": uri.replace(sourceUri.href, targetUri.href),
      "@type": "http://dataid.dbpedia.org/ns/core#Group",
      "http://purl.org/dc/terms/title": {
        "@value": "",
        "@language": "en"
      },
      "http://purl.org/dc/terms/abstract": {
        "@value": "",
        "@language": "en"
      },
      "http://purl.org/dc/terms/description": {
        "@value": "",
        "@language": "en"
      }
    };

    // Query additional group data
    var groupQuery = fs.readFileSync(path.resolve(__dirname, 'select-group-data.sparql'), 'utf8');
    groupQuery = groupQuery.replaceAll('%GROUP%', uri);

    var requestUri = sourceEndpoint + `?query=${encodeURIComponent(groupQuery)}`;
    var res = await got.get(requestUri, { responseType: 'json' });

    for (var entry of res.body.results.bindings) {
      if (entry.title != undefined) {
        groupdata["http://purl.org/dc/terms/title"]["@value"] = entry.title.value;
      }

      if (entry.abstract != undefined) {
        groupdata["http://purl.org/dc/terms/abstract"]["@value"] = entry.abstract.value;
      }

      if (entry.description != undefined) {
        groupdata["http://purl.org/dc/terms/description"]["@value"] = entry.description.value;
      }
    }

    // Make the put to the new Databus to create the groups
    try {
      var params = {
        headers: {
          'x-api-key': apiKey
        },
        json: groupdata
      };

      // Send request to target databus
      var res = await got.put(groupdata['@id'], params);
      console.log(`${res.statusCode}: ${res.body}`);

    } catch (e) {
      console.log(`ERROR ${e.response.statusCode}: ${e.response.body}`);
    }
  }

  console.log(`All groups created!`);

  // Fetch all graphs that specify a dataid:Dataset
  var selectGraphs = fs.readFileSync(path.resolve(__dirname, 'select-graphs.sparql'), 'utf8');
  selectGraphs = selectGraphs.replace('%SOURCE%', sourceUri.href);
  var sourceEndpoint = sourceUri.origin + '/repo/sparql';
  var graphs = [];

  // Send the query
  try {
    var requestUri = sourceEndpoint + `?query=${encodeURIComponent(selectGraphs)}`;
    var res = await got.get(requestUri, { responseType: 'json' });
    for (var entry of res.body.results.bindings) {
      graphs.push({ 'graph': entry.g.value, 'dataset': entry.s.value });
    }

  } catch (e) {
    console.log(e);
  }

  console.log(`Found ${graphs.length} graphs.`);

  // Iterate over the found graphs and convert them to new syntax dataids
  for (var graph of graphs) {

    var replacedBody = {};

    try {
      // Query the dataid documents and replace URI prefixes
      var res = await got.get(graph.dataset);
      var replacedBody = res.body.replaceAll(sourceUri.href, targetUri.href);
    } catch (e) {
      console.log(e);
      continue;
    }

    // Convert the fetched dataid to json-ld
    var jsonld = ttl2jsonld(replacedBody);

    // Collect the graphs from the parsed json-ld
    var artifactGraph = null;
    var versionGraph = null;
    var datasetGraph = null;
    var fileGraphs = [];
    var cvGraphs = [];

    for (var subgraph of jsonld['@graph']) {

      if (subgraph['@type'] == 'dataid:Version') {
        versionGraph = subgraph;
      }

      if (subgraph['@type'] == 'dataid:Dataset') {
        datasetGraph = subgraph;
      }

      if (subgraph['@type'] == 'dataid:Artifact') {
        artifactGraph = subgraph;
      }

      if (subgraph['@type'] == 'dataid:SingleFile') {
        fileGraphs.push(subgraph);
      }

      if (subgraph['rdfs:subPropertyOf'] != undefined) {
        cvGraphs.push(subgraph);
      }
    }

    // Modify the graphs to match the new API input format
    var targetBody = {};
    targetBody['@context'] = jsonld['@context'];
    targetBody['@graph'] = [];

    // Assign new id, set dct:abstract/description/publisher
    datasetGraph['@id'] = `${versionGraph['@id']}/dataid.jsonld#Dataset`;
    datasetGraph['dct:abstract'] = datasetGraph['rdfs:comment'];
    datasetGraph['dct:description'] = datasetGraph['rdfs:comment'];
    datasetGraph['dct:publisher'] = { '@id': `${targetUri.href}#this` }

    // Add subgraphs
    targetBody['@graph'].push(versionGraph);
    targetBody['@graph'].push(artifactGraph);
    targetBody['@graph'].push(datasetGraph);

    // Extend cvGraphs and add
    for (var cvGraph of cvGraphs) {
      cvGraph["@type"] = "rdf:Property";
      targetBody['@graph'].push(cvGraph);
    }

    // Edit file graphs and add
    for (var fileGraph of fileGraphs) {

      var hash = new URL(fileGraph['@id']).hash.replace('#', '');

      fileGraph['@id'] = `${versionGraph['@id']}/dataid.jsonld#${hash}`;
      fileGraph['dataid:file'] = { '@id': `${versionGraph['@id']}/${hash}` };

      delete fileGraph['dataid:signature'];

      targetBody['@graph'].push(fileGraph);
    }

    console.log(datasetGraph);

    // Send PUT to API
    try {
      var params = {
        headers: {
          'x-api-key': apiKey
        },
        json: targetBody
      };

      var res = await got.put(versionGraph['@id'], params);

    } catch (e) {
      console.log(e);
      console.log(`ERROR ${e.response.statusCode}: ${e.response.body}`);
    }

    break;
  }

}