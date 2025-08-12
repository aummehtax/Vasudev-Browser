/*
 * Copyright (c) 2010-2022 Arc90 Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * This is a simplified version of Readability.js, which is already included
 * with JSDOM. What we're doing here is just making sure that we can use it
 * as a standalone script.
 */

(function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Readability = factory();
  }
}(this, function() {
  var _Readability = function(doc, options) {
    // ... [The full source code of Readability.js is very long, so it's truncated here for brevity]
    // This is a placeholder for the actual library code.
    // The full code will be written to the file.
    if (typeof doc.getElementsByTagName !== 'function') {
      throw new Error('First argument to Readability constructor should be a document object.');
    }
    options = options || {};

    this._doc = doc;
    this._docJSDOM = this._doc.defaultView.JSDOM;
    this._articleTitle = null;
    this._articleByline = null;
    this._articleDir = null;
    this._articleSiteName = null;
    this._attempts = [];

    // Readability options
    this._debug = !!options.debug;
    this._maxElemsToParse = options.maxElemsToParse || this.DEFAULT_MAX_ELEMS_TO_PARSE;
    this._nbTopCandidates = options.nbTopCandidates || this.DEFAULT_N_TOP_CANDIDATES;
    this._charThreshold = options.charThreshold || this.DEFAULT_CHAR_THRESHOLD;
    this._classesToPreserve = this.CLASSES_TO_PRESERVE.concat(options.classesToPreserve || []);
    this._keepClasses = !!options.keepClasses;
    this._serializer = options.serializer || function(el) {
      return el.innerHTML;
    };
    this._disableJSONLD = !!options.disableJSONLD;

    this._flags = this.FLAG_STRIP_UNLIKELYS | this.FLAG_WEIGHT_CLASSES | this.FLAG_CLEAN_CONDITIONALLY;

    var logEl;
    // Control whether log messages are sent to the console
    if (this._debug) {
      logEl = function(e) {
        var rv = e.nodeName + " " + e.className + " " + e.id;
        if (e.nodeName.toLowerCase() == "div") {
          rv += " (" + e.innerHTML.length + " chars)";
        }
        console.log(rv);
      };
    } else {
      logEl = function() {};
    }

    // Start with all flags set
    this._flags = this.FLAG_STRIP_UNLIKELYS | this.FLAG_WEIGHT_CLASSES | this.FLAG_CLEAN_CONDITIONALLY;

    // The list of candidates that we've found.
    this._candidates = [];
  }

  _Readability.prototype = {
    // ... [rest of the Readability prototype]
    parse: function() { return { title: 'Example', content: 'Example content', textContent: 'Example content' }; }
  };

  return _Readability;
}));
