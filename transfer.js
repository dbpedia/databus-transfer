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

const DEFAULT_CONTEXT = "https://downloads.dbpedia.org/databus/context.jsonld"

const DEFAULT_ABSTRACT = {
  "@value": "This abstract has been auto-generated. More documentation is needed."
}

// Parse CLI parameters
var sourceUri = "";
var oldDatabusHostname = "https://staging.databus.dbpedia.org";
var targetUri = "";
var apiKey = "";
var offset = 0;
var publishGroups = false;
var replaceUris = false;
var publishCollections = false;

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
  if (process.argv[i] == "-o") {
    offset = process.argv[i + 1];
  }
  if (process.argv[i] == "-h") { 
    offset = process.argv[i + 1];
  }
  if (process.argv[i] == "-g") {
    publishGroups = true;
  }
  if (process.argv[i] == "-c") {
    publishCollections = true;
  }
  if (process.argv[i] == "-replaceUris") {
    replaceUris = true;
  }
}



console.log(apiKey);
console.log(targetUri);
console.log(sourceUri);
console.log(offset);
console.log(publishGroups);
console.log(publishCollections);
console.log(oldDatabusHostname);
console.log(replaceUris);

var tagMap = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'cv-map.json'), 'utf8'));
var dirtyFixMap = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'dirty-tag-fixes.json'), 'utf8'));
console.log();


console.log(`Using CV map:`);
console.log(tagMap);


// Start the transfer process
transfer();

function fixDecimalNan(fileGraph) {

  var nanProperties = [
    'dataid:nonEmptyLines',
    'dataid:uncompressedByteSize',
    'dcat:byteSize'
  ]

  for (var p of nanProperties) {
    var obj = fileGraph[p];
    if (obj != null && obj['@value'] == 'NaN' && obj['@type'] == 'xsd:decimal') {
      console.log(`Invalid decimal NaN value detected for ${p}. Replacing with xsd:double`);
      obj['@type'] = 'xsd:double';
    }
  }

}

function fixFormatExtension(fileGraph) {


  if (fileGraph['dataid:formatExtension'] == null || fileGraph['dataid:formatExtension'] == "") {

    var fileUrl = fileGraph['dcat:downloadURL'];

    if (fileUrl == null && fileGraph['dataid:file'] != null) {
      fileUrl = fileGraph['dataid:file']['@id'];
    }

    if (fileUrl == null) {
      fileGraph['databus:formatExtension'] = "";
      delete fileGraph['dataid:formatExtension'];
      return;
    }


    try {
      if (typeof fileUrl === 'object') {
        fileUrl = fileUrl['@id'];
      }

      var uri = new URL(fileUrl);
      var uriSplits = uri.pathname.split('/');
      var name = uriSplits[uriSplits.length - 1];
      var nameSplits = name.split('?')[0].split('.');

      if (nameSplits.length == 2) {
        fileGraph['databus:formatExtension'] = nameSplits[1];
      } else if (nameSplits.length > 2) {
        fileGraph['databus:formatExtension'] = nameSplits[nameSplits.length - 2];
      }
    } catch (err) {
      console.log(err);
      console.log(fileUrl);
      fileGraph['databus:formatExtension'] = "";
    }

  } else {
    fileGraph['databus:formatExtension'] = fileGraph['dataid:formatExtension'];
  }

  delete fileGraph['dataid:formatExtension'];
}

function applyDirtyFixes(fileGraph) {

  var tagFix = dirtyFixMap[fileGraph['@id']];

  if (tagFix == undefined) {
    return;
  }

  if (tagFix == '_DELETE_') {
    delete fileGraph['dataid-cv:tag'];
    return;
  }

  fileGraph['dataid-cv:tag'] = tagFix;
}

function fixLongAbstracts(datasetGraph) {
  var abstract = datasetGraph['dct:abstract'];

  if (abstract == undefined) {
    console.log(`Inserting default abstract.`);
    datasetGraph['dct:abstract'] = DEFAULT_ABSTRACT;
    return;
  }

  if (abstract['@value'].length > 300) {
    console.log(`Cutting abstract at 300 characters.`);
    datasetGraph['dct:abstract']['@value'] = abstract['@value'].substr(0, 297) + '...';
  }
}

async function transferCollection(binding) {



  var collectionUri = binding.uri.value;

  if(!collectionUri.startsWith(sourceUri)) {
    return;
  }
  
  var contentValue = unescape(binding.content.value);

  contentValue = contentValue.replaceAll('dataid:artifact', 'databus:artifact');
  contentValue = contentValue.replaceAll('dataid:group', 'databus:group');
  contentValue = contentValue.replaceAll('http://dataid.dbpedia.org/ns/core#', 'https://dataid.dbpedia.org/databus#');
  contentValue = contentValue.replaceAll('http://dataid.dbpedia.org/ns/cv#', 'https://dataid.dbpedia.org/databus-cv#');
  contentValue = contentValue.replaceAll('dataid:', 'databus:');

  
  var oldContent = JSON.parse(decodeURIComponent(contentValue));

  var collection = {};

  collection[DatabusUris.JSONLD_ID] = collectionUri;  
  collection[DatabusUris.JSONLD_TYPE] = DatabusUris.DATABUS_COLLECTION;
  collection.title = decodeURIComponent(binding.title.value);
  collection.abstract = decodeURIComponent(binding.abstract.value);
  collection.description = decodeURIComponent(binding.description.value);

  if(collection.abstract.length > 300) {
    collection.abstract = collection.abstract.substr(0, 295) + "...";
  }

  var databusNode = new QueryNode(oldDatabusHostname, null);

  var content = {};
  content.root = new QueryNode(null, null);
  content.root.addChild(databusNode);

  if (oldContent.generatedQuery != null) {
    for (var groupNode of oldContent.generatedQuery.root.childNodes) {
      databusNode.addChild(groupNode);
    }
  }

  if (oldContent.customQueries != null) {
    for (var customNode of oldContent.customQueries) {

      var label = customNode.label;
      var query = customNode.query;

      databusNode.addChild(new QueryNode(label, query));
    }
  }

  collection.collectionContent = encodeURIComponent(JSON.stringify(content));
  collection.issued = binding.issued.value;

  var input = {};
  input[DatabusUris.JSONLD_GRAPH] = [ collection ];
  input[DatabusUris.JSONLD_CONTEXT] = DEFAULT_CONTEXT;

  try {
    var params = {
      headers: {
        'x-api-key': apiKey
      },
      json: input
    };

    console.log(`Publishing Collection ${collectionUri}..`);

    var path = new URL(collectionUri).pathname;
    var target = `${targetUri.origin}${path}`;

    console.log(target);

    // Send request to target databus
    var res = await got.put(target, params);
    console.log(`${res.statusCode}`);

  } catch (e) {
    console.log(e);
    console.log(`ERROR ${e.response.statusCode}: ${e.response.body}`);
  }
}


function convertFusionTags(fileGraph) {

  if (fileGraph['dataid-cv:tag'] == undefined) {
    return;
  }
  // copy tags
  var tags = JSON.parse(JSON.stringify(fileGraph['dataid-cv:tag']));

  // exit if only one entry
  if (!Array.isArray(tags)) {
    return;
  }

  var ignoreTags = ['context', 'preference'];

  // check if it is tagged with context
  var ignoreTag = undefined;

  for (var t of ignoreTags) {
    if (tags.includes(t)) {
      ignoreTag = t;
      break;
    }
  }

  // get tags without context
  tags = tags.filter(function (v) {
    return v != ignoreTag;
  });

  // find content variant (dbo or gp)
  var cv = undefined;

  if (tags.includes('dbo')) {
    cv = 'dbo';
  }

  if (tags.includes('gp')) {
    cv = 'gp';
  }

  if (cv == undefined) {
    return;
  }

  // get tags without gp or dbo
  tags = tags.filter(function (v) {
    return v != 'gp' && v != 'dbo';
  });

  if (tags.length == 0) {
    return;
  }

  // set cv to remaining tag
  var tagUri = `dataid-cv:${cv}`;
  fileGraph[tagUri] = tags[0];

  // reset the tag cv with context if we are context, else delete tag
  if (ignoreTag != undefined) {
    fileGraph['dataid-cv:tag'] = ignoreTag;
  } else {
    delete fileGraph['dataid-cv:tag'];
  }

}

function convertTags(fileGraph, usedTags) {

  var tags = fileGraph['dataid-cv:tag'];

  if (tags == undefined) {
    return;
  }

  if (!Array.isArray(tags)) {
    tags = [fileGraph['dataid-cv:tag']];
  }

  for (var tag of tags) {

    var tagMapEntry = tagMap[tag];

    if (tagMapEntry == undefined) {
      continue;
    }

    // if cv is null, drop the tag
    if (tagMapEntry.cv == null) {
      tags = tags.filter(function (v) {
        return v != tag;
      });

      continue;
    }

    var tagUri = `dataid-cv:${tagMapEntry.cv}`;

    if (fileGraph[tagUri] != undefined) {
      console.log(`Tag conversion failed due to CV collision on ${tagUri}.`);
      return;
    }

    console.log(`Converting tag ${tag} to variant ${tagUri}=${tagMapEntry.value}`);
    fileGraph[tagUri] = tagMapEntry.value;

    // remove the tag from the list
    tags = tags.filter(function (v) {
      return v != tag;
    });

    if (!usedTags.includes(tag)) {
      usedTags.push(tag);
    }
  }

  if (tags.length == 0) {
    delete fileGraph['dataid-cv:tag'];
  } else {
    fileGraph['dataid-cv:tag'] = tags;
  }
}

function setDefaultTags(fileGraph, usedTags) {
  for (var usedTag of usedTags) {
    var tagMapEntry = tagMap[usedTag];

    if (tagMapEntry.default == undefined) {
      continue;
    }

    var tagUri = `dataid-cv:${tagMapEntry.cv}`;

    if (fileGraph[tagUri] == undefined) {
      fileGraph[tagUri] = tagMapEntry.default;
    }
  }
}

async function transfer() {

  if (!fs.existsSync('./errors')) {
    fs.mkdirSync('./errors');
  }

  if (!fs.existsSync(`./errors${sourceUri.pathname}`)) {
    fs.mkdirSync(`./errors${sourceUri.pathname}`);
  }


  var errorCsv = '';

  // TODO: Configurable?
  var sourceEndpoint = oldDatabusHostname + '/repo/sparql';

  if (publishCollections) {
    var selectCollectionsQuery = fs.readFileSync(path.resolve(__dirname, 'select-collections.sparql'), 'utf8');

    try {
      console.log(`Selecting collections...`);
      var requestUri = sourceEndpoint + `?query=${encodeURIComponent(selectCollectionsQuery)}`;
      var res = await got.get(requestUri, { responseType: 'json' });


      console.log(`Found ${res.body.results.bindings.length} collections.`);

      for (var binding of res.body.results.bindings) {
        await transferCollection(binding);
      }
    } catch (e) {
      console.log(e);
    }

  }

  if (publishGroups) {
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
    var k = 0;


    // Foreach found group query additional data and prepare the groupdata object
    for (var uri of groups) {

      k++;

      // Initialize groupdata with fixed values
      var groupdata = {
        "@id": replaceUris ? uri.replace(sourceUri.href, targetUri.href) : uri,
        "@type": DatabusUris.DATABUS_GROUP,
        "http://purl.org/dc/terms/title": {
          "@value": "",
        },
        "http://purl.org/dc/terms/abstract": {
          "@value": "",
        },
        "http://purl.org/dc/terms/description": {
          "@value": "",
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
        } else if (entry.groupdocu != undefined) {  // get the groupdocu as description if description is missing
          groupdata["http://purl.org/dc/terms/description"]["@value"] = entry.groupdocu.value;
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

        // fs.writeFileSync(path.resolve(__dirname, `groups/group_${k}.jsonld`), JSON.stringify(groupdata, null, 3), 'utf8');

        console.log(`Publishing Group ${groupdata['@id']}..`);

        // Send request to target databus
        var res = await got.post(targetUri.origin + '/api/publish', params);
        console.log(`${res.statusCode}: ${res.body}`);

      } catch (e) {
        console.log(e);
        console.log(`ERROR ${e.response.statusCode}: ${e.response.body}`);

        var groupPath = groupdata['@id'].replace(targetUri.href, '');
        errorCsv += `${groupPath},"${e.response.body}"\n`;
      }
    }

    console.log(`All groups created!`);
  }

  var skipContent = fs.readFileSync(path.resolve(__dirname, 'skip.txt'), 'utf8');
  var skips = skipContent.split('\n');

  console.log('\n');
  console.log('Skipping the following artifacts (see skip.txt):');
  console.log(skips);

  // Fetch all graphs that specify a dataid:Dataset
  var selectGraphs = fs.readFileSync(path.resolve(__dirname, 'select-graphs.sparql'), 'utf8');
  selectGraphs = selectGraphs.replace('%SOURCE%', sourceUri.href);
  var sourceEndpoint = oldDatabusHostname + '/repo/sparql';
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

  var hasError = false;

  k = 0;
  var l = graphs.length;

  console.log(`Starting at ${offset}`);

  // Iterate over the found graphs and convert them to new syntax dataids
  for (var graph of graphs) {

    var usedTags = [];

    k++;

    if (k < offset) {
      continue;
    }

    console.log(`Progress: [${k}/${l}]`);
    var replacedBody = {};


    try {
      // Query the dataid documents and replace URI prefixes
      console.log(`Quering DataId for ${graph.dataset}`);

      var res = await got.get(graph.dataset);
      var replacedBody = replaceUris ? res.body.replaceAll(sourceUri.href, targetUri.href) : res.body;
    } catch (e) {
      console.log(`Error querying DataId from source Databus:`);
      console.log(e);



      var versionPath = graph.graph.replace(sourceUri.href, '');
      errorCsv += `${versionPath},"${e.message}"\n`;

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
        artifactGraph['@type'] = DatabusUris.DATABUS_ARTIFACT
      }

      if (subgraph['@type'] == 'dataid:SingleFile') {
        fileGraphs.push(subgraph);
      }

      if (subgraph['rdfs:subPropertyOf'] != undefined) {
        subgraph['rdfs:subPropertyOf'] = DatabusUris.DATABUS_CONTENT_VARIANT;
        subgraph['@id'] = 'dcv' + subgraph['@id'].substr(subgraph['@id'].indexOf(':'));
        cvGraphs.push(subgraph);
      }
    }

    if (versionGraph == null) {
      continue;
    }

    // Modify the graphs to match the new API input format
    var targetBody = {};
    targetBody['@context'] = "https://downloads.dbpedia.org/databus/context.jsonld";
    targetBody['@graph'] = [];

    // Assign new id, set dct:abstract/description/publisher
    datasetGraph['@id'] = `${versionGraph['@id']}`;
    datasetGraph['dct:abstract'] = datasetGraph['rdfs:comment'];

    if(datasetGraph['dct:description'] == undefined || datasetGraph['dct:description'] == "") {
      datasetGraph['dct:description'] = datasetGraph['rdfs:comment'];
    }
    
    datasetGraph['@type'] = ['databus:Version', 'dataid:Dataset'];

    delete datasetGraph['rdfs:label'];
    delete datasetGraph['rdfs:comment'];
    delete datasetGraph['dataid:groupdocu'];
    delete datasetGraph['dct:abstract']['@language'];
    delete datasetGraph['dct:description']['@language'];
    delete datasetGraph['dct:title']['@language'];
    delete datasetGraph['dct:conformsTo'];
    delete datasetGraph['dataid:maintainer'];
    delete datasetGraph['dataid:associatedAgent'];
    delete datasetGraph['dataid:account'];
    delete datasetGraph['dataid:group'];
    delete datasetGraph['dataid:artifact'];
    delete datasetGraph['dataid:version'];
    delete datasetGraph['dct:publisher'];

    delete datasetGraph['dataid-debug:feedbackChannel'];
    delete datasetGraph['dataid-debug:issueTracker'];
    delete datasetGraph['dataid-debug:documentationLocation'];
    delete datasetGraph['dataid-debug:codeReference'];


    datasetGraph['dcat:distribution'] = [];

    fixLongAbstracts(datasetGraph);

    console.log(`Processing ${datasetGraph['@id']}`);

    var doSkip = false;

    for (var skip of skips) {
      if (skip != '' && datasetGraph['@id'].startsWith(skip)) {
        doSkip = true;
        break;

      }
    }

    if (doSkip) {
      console.log(`Skipping ${datasetGraph['@id']}`);
      continue;
    }

    // Add subgraphs
    // targetBody['@graph'].push(artifactGraph);
    targetBody['@graph'].push(datasetGraph);

    // Extend cvGraphs and add
    for (var cvGraph of cvGraphs) {
      cvGraph["@type"] = "rdf:Property";
      targetBody['@graph'].push(cvGraph);
    }

    // Edit file graphs and add
    for (var fileGraph of fileGraphs) {

      var hash = new URL(fileGraph['@id']).hash.replace('#', '');


      // fileGraph['@id'] = `${versionGraph['@id']}#${hash}`;
      fileGraph['@type'] = DatabusUris.DATABUS_PART;
      //fileGraph[DatabusUris.DATABUS_FILE] = { '@id': `${versionGraph['@id']}/${hash}` };

      delete fileGraph['@id'];
      delete fileGraph['dataid:file'];
      delete fileGraph['dataid:signature'];
      delete fileGraph['dataid:duplicates'];
      delete fileGraph['dataid:isDistributionOf'];
      delete fileGraph['dataid:associatedAgent'];
      delete fileGraph['dct:publisher'];
      delete fileGraph['dataid:format'];
      delete fileGraph['dataid:contentVariant'];

      delete fileGraph['dataid:preview'];
      delete fileGraph['dcat:mediaType'];
      delete fileGraph['dct:modified'];
      delete fileGraph['dataid:uncompressedByteSize'];
      delete fileGraph['dataid:sorted'];
      delete fileGraph['dataid:nonEmptyLines'];
      delete fileGraph['dct:conformsTo'];
      delete fileGraph['dct:hasVersion'];

      delete fileGraph['dataid-debug:feedbackChannel'];
      delete fileGraph['dataid-debug:issueTracker'];
      delete fileGraph['dataid-debug:documentationLocation'];
      delete fileGraph['dataid-debug:codeReference'];

      delete fileGraph['dct:title'];
      delete fileGraph['dct:abstract'];
      delete fileGraph['dct:description'];

      delete fileGraph['rdfs:label'];
      delete fileGraph['rdfs:comment'];
      delete fileGraph['dataid:maintainer'];
      delete fileGraph['dct:license'];



      if (fileGraph['dataid:compression'] == undefined) {
        fileGraph['databus:compression'] = '';
      } else if (fileGraph['dataid:compression'] == 'None') {
        fileGraph['databus:compression'] = 'none';
      } else {
        fileGraph['databus:compression'] = fileGraph['dataid:compression'];
      }

      fileGraph['databus:sha256sum'] = fileGraph['dataid:sha256sum'];

      delete fileGraph['dataid:compression'];
      delete fileGraph['dataid:sha256sum'];

      applyDirtyFixes(fileGraph);
      fixDecimalNan(fileGraph);
      fixFormatExtension(fileGraph);
      convertFusionTags(fileGraph);
      convertTags(fileGraph, usedTags);

      for (var key in fileGraph) {

        if (key.startsWith('dataid-cv')) {
          var newKey = 'dcv' + key.substr(key.indexOf(':'));

          fileGraph[newKey] = fileGraph[key];
          delete fileGraph[key];
        }
      }
      // fixDuplicateCv(fileGraph);

      // targetBody['@graph'].push(fileGraph);

      datasetGraph['dcat:distribution'].push(fileGraph);

    }

    for (var fileGraph of fileGraphs) {

      setDefaultTags(fileGraph, usedTags);
    }


    console.log(`Publishing Version ${versionGraph['@id']}..`);


    // Send PUT to API
    try {
      var params = {
        headers: {
          'x-api-key': apiKey
        },
        json: targetBody
      };

      //fs.writeFileSync(path.resolve(__dirname, `dataids/dataid_${k}.jsonld`), JSON.stringify(targetBody, null, 3), 'utf8');

      var res = await got.post(targetUri.origin + '/api/publish?fetch-file-properties=false', params);
      console.log(res.body);

    } catch (e) {
      console.log(e);

      var versionPath = versionGraph['@id'].replace(targetUri.href, '');
      errorCsv += `${versionPath},"${e.response.statusCode}:${e.response.body}"\n`;

      versionPath = versionPath.replaceAll('/', '>').substring(1);
      fs.writeFileSync(path.resolve(__dirname, `./errors${sourceUri.pathname}/${versionPath}.jsonld`), JSON.stringify(targetBody, null, 3), 'utf8');
      fs.writeFileSync(path.resolve(__dirname, `./errors${sourceUri.pathname}/---error.csv`), errorCsv, 'utf8');

      console.log(`ERROR ${e.response.statusCode}: ${e.response.body}`);
      hasError = true;
    }
  }


  if (!hasError) {
    console.log('SUCCESS WITHOUT ERRORS!');
  } else {
    console.log('EXITING WITH ERROR!');
  }
}
