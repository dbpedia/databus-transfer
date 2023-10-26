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
const DatabusUris = require('./databus-uris');
const QueryNode = require('./query-node');
const csvParse = require('csv-parse/sync').parse;
const jsonld = require('jsonld');
const JsonldUtils = require('./jsonld-utils');


const CONTEXT_URL = "https://databus.openenergyplatform.org/res/context.jsonld";
const targetUri = new URL("https://databus.openenergyplatform.org");

function* walkSync(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.name.startsWith(".")) {
      continue;
    }
    if (file.isDirectory()) {
      yield* walkSync(path.join(dir, file.name));
    } else {
      yield path.join(dir, file.name);
    }
  }
}


async function publish(apiKey, data) {
  try {
    var params = {
      headers: {
        'x-api-key': apiKey
      },
      json: data
    };

    console.log(params);

    // Send request to target databus
    var res = await got.post(targetUri.origin + '/api/publish', params);
    console.log(`${res.statusCode}: ${res.body}`);

  } catch (e) {
    console.log(e);
  }
}

async function transfer() {
  var input = fs.readFileSync('./accounts.csv');
  const records = csvParse(input, {
    columns: false,
    skip_empty_lines: true
  });

  // Parse accounts csv, get user entries as nice object
  var accounts = [];

  for (var record of records) {



    accounts.push({
      sub: record[2],
      accountName: record[1],
      apiKey: record[0]
    });
  }

  for (var account of accounts) {
    // Go to folder in ./repo

    if (account.apiKey == null) {
      continue;
    }


    console.log(account);

    var dir = `./repo/${account.accountName}/`;

    var groupPaths = [];
    var collectionPaths = [];
    var versionPaths = [];

    for (const filePath of walkSync(dir)) {

      if (filePath.endsWith("group.jsonld")) {
        groupPaths.push(filePath);
      }

      if (filePath.endsWith("collection.jsonld")) {
        collectionPaths.push(filePath);
      }

      if (filePath.endsWith("dataid.jsonld")) {
        versionPaths.push(filePath);
      }
    }

    console.log(groupPaths);
    console.log(versionPaths);


    /*
    if (groupPaths.length > 0) {
      console.log(`Publishing Groups of ${account.accountName}`);
      // Get all files called "group.jsonld"
      // Migrate groups
      for (var groupPath of groupPaths) {
        // Load
        var groupContent = JSON.parse(fs.readFileSync(groupPath));


        var groupString = JSON.stringify(groupContent).replaceAll("https://energy.databus.dbpedia.org/",
          targetUri.origin + '/');

        groupString = groupString.replaceAll(
          "http://dataid.dbpedia.org/ns/core#",
          "https://dataid.dbpedia.org/databus#");

        groupContent = JSON.parse(groupString);
        groupContent = await jsonld.flatten(groupContent);

        // Rewrite Model:
        groupContent[DatabusUris.JSONLD_TYPE] = [DatabusUris.DATABUS_GROUP];

        // Publish
        // TODO uncomment-> await publish(account.apiKey, groupContent);

        console.log(groupContent);

        var input = {};
        input[DatabusUris.JSONLD_GRAPH] = [groupContent];
        input[DatabusUris.JSONLD_CONTEXT] = CONTEXT_URL;


        await publish(account.apiKey, input);
      }
    }


    if (versionPaths.length > 0) {
      console.log(`Publishing Versions of ${account.accountName}`);
      // Get all files called "dataid.jsonld"
      // Migrate versions
      for (var versionPath of versionPaths) {
        // Load
        var versionContent = JSON.parse(fs.readFileSync(versionPath));

        var versionString = JSON.stringify(versionContent).replaceAll("https://energy.databus.dbpedia.org/",
          targetUri.origin + '/');

        versionContent = JSON.parse(versionString);

        versionContent = await jsonld.flatten(versionContent);

        // Rewrite Model:
        var partGraphs = [];

        for (var graph of JsonldUtils.getTypedGraphs(versionContent,
          "http://dataid.dbpedia.org/ns/core#Part")) {
          partGraphs.push(graph);
        }

        for (var graph of JsonldUtils.getTypedGraphs(versionContent,
          "https://dataid.dbpedia.org/databus#Part")) {
          partGraphs.push(graph);
        }

        var versionGraph = JsonldUtils.getTypedGraph(versionContent, DatabusUris.DATAID_DATASET);


        if (versionGraph == null) {
          versionGraph = JsonldUtils.getTypedGraph(versionContent,
            "https://dataid.dbpedia.org/databus#Dataset");
        }

        if (versionGraph == null) {
          versionGraph = JsonldUtils.getTypedGraph(versionContent,
            DatabusUris.DATABUS_VERSION);
        }

        if (versionGraph == null) {
          console.log(versionContent);
          return;
        }


        var versionGraphString = JSON.stringify(versionGraph);

        versionGraphString = versionGraphString.replaceAll(
          "http://dataid.dbpedia.org/ns/core#",
          "https://dataid.dbpedia.org/databus#");

        versionGraph = JSON.parse(versionGraphString);

        delete versionGraph[DatabusUris.SEC_PROOF];
        delete versionGraph[DatabusUris.DATABUS_VERSION_PROPERTY];



        var versionId = new URL(versionGraph[DatabusUris.JSONLD_ID]);
        versionId.hash = "";

        versionGraph[DatabusUris.JSONLD_ID] = `${versionId}`;

        versionGraph[DatabusUris.JSONLD_TYPE] = [
          DatabusUris.DATABUS_VERSION
        ];

        var graphs = [];

        graphs.push(versionGraph);

        for (var partGraph of partGraphs) {

          var partGraphString = JSON.stringify(partGraph);

          // Adjust namespaces
          partGraphString = partGraphString.replaceAll(
            "http://dataid.dbpedia.org/ns/core#",
            "https://dataid.dbpedia.org/databus#");

          partGraphString = partGraphString.replaceAll(
            "http://dataid.dbpedia.org/ns/cv#",
            DatabusUris.DATABUS_CONTENT_VARIANT_PREFIX
          );

          partGraph = JSON.parse(partGraphString);


          graphs.push(partGraph);
        }

        var input = {};
        input[DatabusUris.JSONLD_GRAPH] = graphs;
        input[DatabusUris.JSONLD_CONTEXT] = CONTEXT_URL;

        console.log(JSON.stringify(input));
        // Publish
        // TODO: uncomment-> 
        await publish(account.apiKey, input);
      }
    }*/

    if (collectionPaths.length > 0) {
      console.log(`Publishing Collections of ${account.accountName}`);
      // Get all files called "collection.jsonld"
      // Migrate collections
      for (var collectionPath of collectionPaths) {

        var collectionContent = JSON.parse(fs.readFileSync(collectionPath));
        collectionContent = await jsonld.flatten(collectionContent);

        var collectionString = JSON.stringify(collectionContent[0]);

        collectionString = collectionString.replaceAll("https://energy.databus.dbpedia.org/",
          targetUri.origin + '/');

        collectionString = collectionString.replaceAll(
          "dataid:",
          "databus:");

        collectionString = collectionString.replaceAll(
          "dataid:",
          "databus:");

        collectionString = collectionString.replaceAll(
          "http://dataid.dbpedia.org/ns/core#",
          "https://dataid.dbpedia.org/databus#");

        collectionString = collectionString.replaceAll(
          "https://dataid.dbpedia.org/databus#content",
          "https://dataid.dbpedia.org/databus#collectionContent");

        collectionContent = JSON.parse(collectionString);

        delete collectionContent[DatabusUris.DCT_PUBLISHER];

        // Rewrite Model:

        collectionContent[DatabusUris.JSONLD_TYPE] = [DatabusUris.DATABUS_COLLECTION];

        var collectionContentString = collectionContent[DatabusUris.DATABUS_COLLECTION_CONTENT][0][DatabusUris.JSONLD_VALUE];
        collectionContentString = decodeURIComponent(collectionContentString);

        collectionContentString = collectionContentString.replaceAll("https://energy.databus.dbpedia.org",
          targetUri.origin);

        collectionContentString = collectionContentString.replaceAll(
          "dataid:",
          "databus:");

        collectionContentString = collectionContentString.replaceAll(
          "http://dataid.dbpedia.org/ns/core#",
          "https://dataid.dbpedia.org/databus#");


        console.log(collectionContentString);

        collectionContent[DatabusUris.DATABUS_COLLECTION_CONTENT] = [
          {
            "@value": encodeURIComponent(collectionContentString)
          }
        ];


        var input = {};
        input[DatabusUris.JSONLD_GRAPH] = [collectionContent];
        input[DatabusUris.JSONLD_CONTEXT] = CONTEXT_URL;

        console.log(JSON.stringify(input, null, 3));

        try {
          var params = {
            headers: {
              'x-api-key': account.apiKey
            },
            json: input
          };
      
          // Send request to target databus
          var res = await got.put(collectionContent[DatabusUris.JSONLD_ID], params);
          console.log(`${res.statusCode}: ${res.body}`);
      
        } catch (e) {
          console.log(e);
        }

      }
    }
  }
}


transfer();