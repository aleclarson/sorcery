const { isAbsolute, relative } = require("path");
const { encode } = require("sourcemap-codec");
const SourceMap = require("./SourceMap.js");
const blend = require("./blend.js");
const Node = require("./Node.js");

function sorcery(chain, opts = {}) {
  if (!Array.isArray(chain)) {
    chain = [chain];
  }

  const file = opts.generatedFile || "";
  if (isAbsolute(file)) {
    throw new Error("`generatedFile` cannot be absolute");
  }

  const nodes = loadChain(chain, opts);
  if (!nodes) return null;

  const main = nodes[0];
  trace(main);

  let sourceRoot = "";
  if (main.sources[0] || main.sources.length > 1) {
    sourceRoot = slash(opts.sourceRoot || "");
    if (isAbsolute(sourceRoot)) {
      throw new Error("`sourceRoot` cannot be absolute");
    }
  }

  return new SourceMap({
    file,
    sources: main.sources.map(source =>
      source && source.file ? relative(sourceRoot, slash(source.file)) : null),
    sourceRoot,
    sourcesContent: opts.includeContent !== false
      ? main.sources.map(source =>
        source && (source.content || opts.readFile(source.file)) || null)
      : new Array(main.sources.length).fill(null),
    names: main.names,
    mappings: encode(main.mappings),
  });
}

// Create a function that can trace a (line, column) pair to
// its original source. Returns null if no sourcemap exists.
sorcery.portal = function(chain, opts = {}) {
  if (!Array.isArray(chain)) {
    chain = [chain];
  }

  let main;
  const nodes = loadChain(chain, opts);
  if (nodes) {
    main = nodes[0];
  } else {
    main = loadNode(chain[0], opts);
    if (main.map) {
      main.loadSources(opts);
    } else return null;
  }

  trace(main);
  main.final = !main.sources.some(source => source !== null);

  return function trace(line, column) {
    const segments = main.mappings[line];
    let i = -1; while (++i < segments.length) {
      if (segments[i][0] > column) break;
    }
    if (--i !== -1) {
      const segment = segments[i];
      const source = main.sources[segment[1]];
      if (!source && !main.final) {
        return null;
      }
      const sourceLine = segment[2];
      const sourceColumn = segment[3] + column - segment[0];
      if (segment[3] !== sourceColumn) {
        const content = source && (source.content || opts.readFile(source));
        const line = (content || "").split("\n")[sourceLine];
        if (!line || sourceColumn >= line.length) {
          return null;
        }
      }
      return {
        source: source ? source.file : null,
        line: sourceLine,
        column: sourceColumn,
        name: segment[4] || null,
      };
    }
    return null;
  };
};

module.exports = sorcery;

// Load the mappings and sources of every node in the chain.
function loadChain(chain, opts) {
  if (!opts.readFile) opts.readFile = noop;
  if (!opts.getMap) opts.getMap = noop;

  const nodes = [];
  let i = 0; while (true) {
    const node = loadNode(chain[i], opts);
    nodes[i] = node;

    if (i !== 0) {
      nodes[i - 1].sources = [node];
    }

    if (!node.map) {
      return i > 1 ? nodes : null;
    }

    if (++i === chain.length) {
      node.loadSources(opts);
      return (i > 1 || !node.final) ? nodes : null;
    }
  }
}

function loadNode(source, opts) {
  const node = typeof source === "string"
    ? new Node(null, source)
    : new Node(source.file, source.content);

  node.map = source.map || null;
  node.loadMappings(opts);
  return node;
}

// Recursively trace mappings to their oldest sources.
function trace(node) {
  if (node && node.map) {
    let skip = true;
    node.sources.forEach(source => {
      if (trace(source)) skip = false;
    });
    if (skip) {
      node.names = node.map.names;
    } else blend(node);
    return node;
  }
  return null;
}

function slash(path) {
  return path.replace(/\\/g, "/");
}

function noop() {
  return null;
}
