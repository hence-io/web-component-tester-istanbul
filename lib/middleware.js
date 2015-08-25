var _ = require('lodash');
var minimatch = require('minimatch');
var fs = require('fs');
var path = require('path');
var istanbul = require('istanbul');

// istanbul
var instrumenter = new istanbul.Instrumenter({
  coverageVariable: "WCT.share.__coverage__",
  //noAutoWrap: true,
  debug: true
});

// helpers
var cache = {};

function instrumentAsset(root, asset, emitter) {
  var code;

  if (!cache[asset]) {
    var assetPath = path.join(root, asset);

    try {
      code = fs.readFileSync(assetPath, 'utf8');

      // NOTE: the instrumenter must get a file system path not a wct-webserver path.
      // If given a webserver path it will still generate coverage, but some reporters
      // will error, siting that files were not found
      // (thedeeno)
      cache[asset] = instrumenter.instrumentSync(code, assetPath);

      //console.log('instrumentAsset', assetPath, asset, cache[asset].substr(0, 500));
    } catch (e) {
      emitter.emit('log:debug', 'coverage', 'error', 'Failed to instrument file path: ', assetPath, e);
    }
  }

  return cache[asset];
}

/**
 * Middleware that serves an instrumented asset based on user
 * configuration of coverage
 */
function coverageMiddleware(root, options, emitter) {
  return function (req, res, next) {
    var process;
    var asset = req.url;

    // always ignore platform files in addition to user's blacklist
    var blacklist = ['**/web-component-tester/*', 'web-component-tester/*'].concat(options.exclude || []);
    var whitelist = options.include;

    // cache the webserver root for user supplied instrumenter
    this.root = root;

    // check asset against rules
    try {
      process = match(asset, whitelist) && !match(asset, blacklist);
    } catch (e) {
      emitter.emit('log:debug', 'coverage', 'error', 'Failed to match file patterns: ', whitelist, e);
    }

    // instrument unfiltered assets
    if (process) {
      // Refine the file url path to ensure it's removing any working folders, and give you a relative file system path
      asset = req.url.replace(options.workingDir || '', '');

      emitter.emit('log:debug', 'coverage', 'instrument', asset);
      return res.send(instrumentAsset(this.root, asset, emitter));
    } else {
      emitter.emit('log:debug', 'coverage', 'skip      ', asset);
      return next();
    }
  };
}

/**
 * Returns true if the supplied string mini-matches any of the supplied patterns
 */
function match(str, rules) {
  return _.any(rules, minimatch.bind(null, str));
}

module.exports = coverageMiddleware;
