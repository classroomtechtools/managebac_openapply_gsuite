/*
  ApiWrapper: Available in the global scope:
  var request = ApiWrapper(url, headerInfo)
  var response = resquest.fetchJson();

  Interfaces with external source and assumes it is a json
*/

(function (globalContext) {

  /*
    Formatter
    https://gist.github.com/brainysmurf/b4394974047428edccef27b2abcc4fb3
  */

  //  ValueError :: String -> Error
  var ValueError = function(message) {
    var err = new Error(message);
    err.name = 'ValueError';
    return err;
  };

  //  defaultTo :: a,a? -> a
  var defaultTo = function(x, y) {
    return y == null ? x : y;
  };

  //  create :: Object -> String,*... -> String
  var create = function(transformers) {
    return function(template) {
      var args = Array.prototype.slice.call(arguments, 1);
      var idx = 0;
      var state = 'UNDEFINED';

      return template.replace(
        /([{}])\1|[{](.*?)(?:!(.+?))?[}]/g,
        function(match, literal, key, xf) {
          if (literal != null) {
            return literal;
          }
          if (key.length > 0) {
            if (state === 'IMPLICIT') {
              throw ValueError('cannot switch from ' +
                               'implicit to explicit numbering');
            }
            state = 'EXPLICIT';
          } else {
            if (state === 'EXPLICIT') {
              throw ValueError('cannot switch from ' +
                               'explicit to implicit numbering');
            }
            state = 'IMPLICIT';
            key = String(idx);
            idx += 1;
          }
          var value = defaultTo('', lookup(args, key.split('.')));

          if (xf == null) {
            return value;
          } else if (Object.prototype.hasOwnProperty.call(transformers, xf)) {
            return transformers[xf](value);
          } else {
            throw ValueError('no transformer named "' + xf + '"');
          }
        }
      );
    };
  };

  var lookup = function(obj, path) {
    if (!/^\d+$/.test(path[0])) {
      path = ['0'].concat(path);
    }
    for (var idx = 0; idx < path.length; idx += 1) {
      var key = path[idx];
      obj = typeof obj[key] === 'function' ? obj[key]() : obj[key];
    }
    return obj;
  };

  //  format :: String,*... -> String
  var format = create({});

  //  format.create :: Object -> String,*... -> String
  format.create = create;

  //  format.extend :: Object,Object -> ()
  format.extend = function(prototype, transformers) {
    var $format = create(transformers);
    prototype.format = function() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(this);
      return $format.apply(globalContext, args);
    };
  };

  // Do not pollute the global namespace, seems like a bad idea
  //global.format = format;
  
  // ...instead we will polyfill the String.protype, but you may want to modify this
  // for the use of transformers, see documentation for that
  format.extend(String.prototype);

  // END FORMATTER

  globalContext.ApiWrapper = function (_baseurl, _params) {
    if (typeof _baseurl == 'undefined') {
      throw Error("requires url");
    }
    _urlQuery = null;
    if (typeof _params === 'undefined') {
      _params = {};
    }

    return {
      setHeader: function (key, value) {
        _params.header[key] = value;
        return this;
      },
      
      setParam: function (key, value) {
        _params[key] = value;
        return this;
      },

      getParam: function () {
        return _params;
      },
      
      formatUrl: function (obj) {
        return _baseurl.format(obj);
      },
      
      setQuery: function (obj) {
        _urlQuery = _baseurl + "?" + Object.keys(obj).reduce(
          function(a,k) {
            a.push(k+'='+encodeURIComponent(obj[k]));
            return a
           },
        []).join('&');
        return this;
      },

      getQuery: function () {
        return _urlQuery;
      },
      
      fetch: function(formatObj) {
        this.setParam('muteHttpExceptions', true);
        var response = UrlFetchApp.fetch((_urlQuery || _baseurl).format(formatObj), _params);
        if (response.getResponseCode() == 429) {
          // rate limit hit, sleep until ready and then re-try
          var headers = response.getAllHeaders();
          var header_reset_at = headers['x-ratelimit-reset'];
          header_reset_at = header_reset_at.replace(" UTC", "+0000").replace(" ", "T");
          var reset_at = new Date(header_reset_at).getTime();
          var utf_now = new Date().getTime();
          var milliseconds = reset_at - utf_now + 10;
          Utilities.sleep(milliseconds);
          
          // TODO: should have some mechanism here to fail gracefully
          response = UrlFetchApp.fetch((_urlQuery || _baseurl).format(formatObj), _params);
          //
        }
        if (response.getResponseCode() != 200) {
          throw Error("API responded with error code " + response.getResponseCode() + " see log for details");
        }
        return response;
      },
      
      fetchJson: function(formatObj) {
        var response = this.fetch(formatObj);
        return JSON.parse(response.getContentText());
      },
      
      fetchBlob: function(formatObj) {
        var response = this.fetch(formatObj);
        return response.getBlob();
      }
    };
  
  }

})(this);
