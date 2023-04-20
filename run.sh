while getopts s:t:a:o:g: flag
do
    case "${flag}" in
        s) source=${OPTARG};;
        t) target=${OPTARG};;
        a) apiKey=${OPTARG};;
        o) offset=${OPTARG};;
        g) groups=${OPTARG};;
    esac
done

echo "Source: $source";
echo "Target: $target";
echo "API Key: $apiKey";
echo "Offset: $offset";
echo "Publish Groups: $groups";

chmod +x ./transfer.js
npm install got
npm install @frogcat/ttl2jsonld
npm install rdf-parse
node transfer.js -s $source -t $target -a $apiKey -o $offset 