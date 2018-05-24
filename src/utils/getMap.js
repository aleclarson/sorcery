const { Promise } = require("sander");
const getMapFromUrl = require("./getMapFromUrl.js");
const getSourceMappingUrl = require("./getSourceMappingUrl.js");

module.exports = function getMap(node, sourceMapByPath, sync) {
  if (node.map) {
    return sync ? node.map : Promise.resolve(node.map);
  } else if (node.file in sourceMapByPath) {
    const map = sourceMapByPath[node.file];
    return sync ? map : Promise.resolve(map);
  } else {
    const url = getSourceMappingUrl(node.content);

    if (!url) {
      node.isOriginalSource = true;
      return sync ? null : Promise.resolve(null);
    }

    return getMapFromUrl(url, node.file, sync);
  }
};
