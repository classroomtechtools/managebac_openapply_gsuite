/*
  Wrapper for advanced sheets api that provides us common database operations
*/

'use strict';

/*
  Build upon the globalContext (passed as this below) to define all our variables in the "app" variable
  We'll have all the virtualized stuff there in the local stack (thus, name conflicts are still possible)
*/
(function(globalContext) {

  /*
    Tranpose an array, if element isn't present, it'll be undefined
    https://stackoverflow.com/questions/4492678/swap-rows-with-columns-transposition-of-a-matrix-in-javascript
  */
  function transpose(a) {
      return Object.keys(a[0]).map(function(c) {
          return a.map(function(r) { return r[c]; });
      });
  }

  /*
    Convert column number (0-indexed) into spreadsheets
  */
  function zeroIndexedToColumnName(n) {
    var ordA = 'A'.charCodeAt(0);
    var ordZ = 'Z'.charCodeAt(0);
    var len = ordZ - ordA + 1;
    
    var s = "";
    while(n >= 0) {
      s = String.fromCharCode(n % len + ordA) + s;
      n = Math.floor(n / len) - 1;
    }
    return s;
  }

  
  /*
    Define a block of code that executes code on entry to that block, and on exit
    Even if there is an error (although that behavior can be overwritten)
  */
  var contextManager = function () {
    
    function _parseOptions(opt) {
      var ret = {};
      ret.enter = opt.enter || function () { return null; };
      ret.exit = opt.exit || function (arg) {};
      ret.params = opt.params || [];
      if (!Array.isArray(ret.params)) throw new TypeError("options.params must be an array");
      ret.onError = opt.onError || function () {};
      return ret;
    }
    
    if (arguments.length == 1) {
      
      var options = _parseOptions(arguments[0]);
      
      return function (body) {
        var ret = options.enter.apply(null, options.params);
        
        try {
          ret = body(ret) || ret;
        } catch (err) {
          if (options.onError(err, ret) !== null)
            if (typeof err === 'string')
              throw new Error(err);
            else
              throw new err.constructor(err.message + ' --> ' + (err.stack ? err.stack.toString(): ''));
        } finally {
          options.exit(ret);
        }
        
        return ret;
      };
      
    } else if (arguments.length == 2) {
      
      var bodies = arguments[0],
          options = _parseOptions(arguments[1]);
      options = _parseOptions(options);
      
      if (!Array.isArray(bodies))
        bodies = [bodies];
      
      for (var i = 0; i < bodies.length; i++) {
        var body = bodies[i];
        var ret = options.enter.apply(null, options.params);
        try {
          ret = body(ret) || ret;
        } catch (err) {
          if (options.onError(err, ret) !== null)
            throw new err.constructor(err.message + ' --> ' + err.stack.toString());
        } finally {
          options.exit(ret);
        }
      }
    } else {
      throw new Error("Pass either one or two arguments");
    }
    
    return ret;
  };


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
  

  /*
    The private, main constructor
  */
  var DBSheets_ = function (_ss) {
    // Module pattern, returns an object with methods
    // We use _methods to indicate private stuff
  
    // defaults
    _dimension = 'ROWS';
    _keyHeaderRow = 0;
    _destInfo = [];
    _cachedSS = null;
  
    /*
     * Methods for simple interactions 
     *
     */
     function _getCachedSS () {
         //return Sheets.Spreadsheets.get(_getId());
         if (!_cachedSS) {
             _cachedSS = Sheets.Spreadsheets.get(_getId());
         }
         return _cachedSS;
     }

    /*
     * _getId
     * @return {String}   The spreadsheet ID    
     */
    function _getId () {
      return _ss.spreadsheetId;
    }

    /* 
      @param {Object}     request     Request object
      @return {Object}                Response object
    */
    function _valuesBatchUpdate (request) {
      return Sheets.Spreadsheets.Values.batchUpdate(request, _getId());
    }
    
    /* 
      
      @return effective values, otherwise empty [[]]
    */
    function _getValues (range) {
      var response = Sheets.Spreadsheets.Values.get(_getId(), range, {
        majorDimension: _dimension,
        valueRenderOption: "UNFORMATTED_VALUE"
      });
      return response.values || [[]];
    }
    
    /* 
      Clears to all values in the range
      @return   null
    */
    function _clearRange (range) {
      Logger.log('Clearing ' + range);
      Sheets.Spreadsheets.Values.clear({}, _getId(), range);
    }
    
    /*
      Clears the entire tab
    */
    function _clearTab (tabTitle) {
      var sheets = _getSheets();
      var targetTab = null;
      sheets.forEach(function (sheet) {
        if (sheet.properties.title == tabTitle) {
          targetTab = sheet;
        }
      });
      if (targetTab) {
        _clearRange(tabTitle + '!1:' + targetTab.properties.gridProperties.rowCount.toString());
      }
    }
    
    /*
      
    */
    String.prototype.to10 = function(base) {
      var lvl = this.length - 1;
      var val = (base || 0) + Math.pow(26, lvl) * (this[0].toUpperCase().charCodeAt() - 64 - (lvl ? 0 : 1));
      return (this.length > 1) ? (this.substr(1, this.length - 1)).to10(val) : val;
    }
    
    function _a1notation2gridrange(a1notation) {
      var data = a1notation.match(/(^.+)!(.+):(.+$)/);
      if (data == null) {
        // For cases when only the sheet name is returned
        return {
          sheetId: _getSheet(a1notation).properties.sheetId
        }
      }
      var co1 = data[2].match(/(\D+)(\d+)/);
      var co2 = data[3].match(/(\D+)(\d+)/);
      var gridRange = {
        sheetId: _getSheet(data[1]).properties.sheetId,
        startRowIndex: co1 ? parseInt(co1[2], 10) - 1 : null,
        endRowIndex: co2 ? parseInt(co2[2], 10) : null,
        startColumnIndex: co1 ? co1[1].to10() : data[2].to10(),
        endColumnIndex: co2 ? co2[1].to10(1) : data[3].to10(1),
      };
      if (gridRange.startRowIndex == null) delete gridRange.startRowIndex;
      if (gridRange.endRowIndex == null) delete gridRange.endRowIndex;
      return gridRange;
    }        
    /* 
      @param  {Number,String}  sheet    if number, returns the sheet at index
                                        if name, return the sheet that has that name
      @throws {Error}                   if sheet is not a number or not a string
      @return {Object}                  returns the target sheet object
      
      @TODO: Use network call to update
    */
    function _getSheet(sheet) {
      var ss = _getCachedSS();
      if (typeof sheet == "number") return ss.sheets[sheet] || null;
      if (typeof sheet == "string") {
          var sheetName = sheet.split("!")[0];  // take out the
          for (var i = 0; i < ss.sheets.length; i++) {
            if (ss.sheets[i].properties.title == sheetName) return ss.sheets[i];
          }
          return null;
      }
      throw new Error("Passed in " + typeof sheet + " into _getSheet");
    }
    
    function _getSheets() {
      return Sheets.Spreadsheets.get(_getId()).sheets;
    }

    /* 
      _toRange: Convenience function to convert variables into a A1Notation string
      @return {String}     Legal A1Notation
    */
    function _toRange(title, left, right) {
      if (title.indexOf(' ') !== -1)
        title = "'" + title + "'";
      if (typeof right === 'undefined')
        return title + '!' + left.toString() + ':' + left.toString();
      else
        return title + '!' + left.toString() + ':' + right.toString();
    }

    /*
      Makes frozen rows, add headers
    */
    function _defineHeaders (sheet, headers) {
        var sht = _getSheet(sheet);
    
        var response = Sheets.Spreadsheets.batchUpdate({
          requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: sht.properties.id,
                gridProperties: {
                  frozenRowCount: headers.length,
                }
              },
              fields: 'gridProperties.frozenRowCount',
            }
          },
          ]
        }, _getId());
        

        this.inputValues(_toRange(sht.properties.title, 1, headers.length), headers);
        this.setKeyHeadingRow(0);
    }
    
    function _getHeaders (sheet) {
      var sht = _getSheet(sheet);
      if (!sht) // may be either undefined or null
        return [[]];
      var numHeaders = sht.properties.gridProperties.frozenRowCount || 0;
      if (numHeaders == 0) 
        return [[]];
      
      return _getValues(_toRange(sht.properties.title, 1, numHeaders));
    }
    
    function _getRange ( ) {
      var ss = SpreadsheetApp.openById(_getId());
      return ss.getRange.apply(ss, arguments);
    }
    
    /*
      Uses the sheet's headers and range values and converts them into the properties
      
      @param {string} rangeA1Notation    The range string 
      @returns {List[Object]}
    */
    function _toObjects(rangeA1Notation) {
      var headers = _getHeaders(rangeA1Notation);
      var numHeaders = headers.length;
      var headings = headers[_keyHeaderRow];
      headers = transpose(headers);  // transpose so we can refehence by column below
      var values = _getValues(rangeA1Notation);
      var range = _getRange(rangeA1Notation);  // TODO: Shortcut method, could we do this manually?
      var rowOffset = (range.getRow() - numHeaders - 1);  // getRow returns the row number after the 
      var columnOffset = (range.getColumn() - 1);
      var ret = [];
      var co, header, obj;
      
      // Loop through the values
      // We need to use headings.length in nested loop to ensure that
      // every column
      for (var r = 0; r < values.length; r++) {
        ro = r + rowOffset;
        obj = {};
        for (var c = 0; c < headings.length; c++) {
          co = c + columnOffset;
          heading = headings[co];
          obj[heading] = {
            value: values[r][c],
            a1Notation: range.getSheet().getName() + '!' + range.offset(ro, co).getA1Notation(),
            headers: headers[co],
            column: co,
            row: range.getRow() + r,
            columnAsName: zeroIndexedToColumnName(co),
            rowAsName: range.getRow().toString(),
          };
        }
        obj.columns = {};
        var i = 0;
        for (key in obj) {
          if (key === 'columns')
            continue;
          obj.columns[key] = zeroIndexedToColumnName(i) + (range.getRow() + r).toString();
          i++;
        }
        ret.push(obj);
      }
      return ret;
    }

    _plugins = [];
    _oncePlugins = [];

    /*
      Returned object
    */
    
    return {
      getId: _getId,
      
      clearRange: _clearRange,
      clearTab: _clearTab,
      
      setDimensionAsColumns: function () {
        _dimension = 'COLUMNS';
      },
      
      setDimensionAsRows: function () {
        _dimension = 'ROWS';
      },

      /* 
        This determines which header row
      */
      setKeyHeadingRow: function (value) {
        _keyHeaderRow = value;
      },
      
      getHeaders: function (sheet) {
        return _getHeaders(sheet);
      },
      
      /*
        Light wrapper to spreadsheet app getRange function
      */
      getRange: function () {
        return _getRange.apply(null, arguments);
      },
      
      a1notation2gridrange: function (a1Notation) {
        return _a1notation2gridrange(a1Notation);
      },
      
      registerPlugin: function (description, func) {
        _plugins.push({description: description, func: func});
      },

      registerOncePlugin: function (description, func) {
        _oncePlugins.push({description: description, func: func});
      },

      /*
        Inserts a row depending on range specification
      */
      insertRow: function (range, row) {
        return Sheets.Spreadsheets.Values.append({
          majorDimension: _dimension,
          values: [row]
        }, _getId(), range, {
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
        });
      
      },
      
      getPluginsOverwriteBuildRequests: function (rangeA1Notation) {
        objs = _toObjects(rangeA1Notation);  // convert to A1
        var requests = [];
        var utils = {
          zeroIndexedToColumnName: zeroIndexedToColumnName,
          objects: objs
        };
        
        // cycle through the plugins and build results array
        _plugins.forEach(function (plugin) {
          objs.forEach(function (obj) {
            for (prop in obj) {
              if (prop == 'columns')
                continue;
              var objValue = obj[prop];
              if (plugin.description.entryPoint && 
                  objValue.headers[plugin.description.entryPoint.header - 1] == plugin.description.name) {
                var newValue = plugin.func(objValue, utils);
                if (typeof newValue === 'string') {
                  newValue = newValue.format(objValue);  // overwrites
                  newValue = newValue.format(obj.columns);
                }
                requests.push({values: [[newValue]], a1Notation: objValue.a1Notation});
              }
            }
          });
        });
        
        return requests;
      },
      
      overwriteWithPlugins: function (rangeA1Notation) {
        var requests = this.getPluginsOverwriteBuildRequests(rangeA1Notation);
        
        // Add value requests from results and allow the sheet to update
        this.withRequestBuilder(function (rb) {
          requests.forEach(function (item) {
            rb.addValueRequest(rb.utils.valuesRequest(item.values, item.a1Notation));
          });
        });
      },

      /*  
        Calls batchUpdate with "USER_ENTERED"
        
        @return response
      */
      inputValues: function (rangeNotation, values) {
        var request = {
           valueInputOption: 'USER_ENTERED',
           data: [
             {
               range: rangeNotation,
               majorDimension: _dimension,
               values: values
             }
           ]
        };
        return _valuesBatchUpdate(request);
      },
      
      getEffectiveValues: function (range) {
        return _getValues(range);
      },
      
      getColumnValues: function (range, column) {
          saved = _dimension;
          this.setDimensionAsColumns();
          var values = _getValues(range);
          _dimension = saved;
          return values[column].slice();
      },
      
      addSheets: function (sheets) {
        //Logger.log(_ss.sheets);
      },
      
      getSheets: function () {
        return _getSheets();
      },
      
      defineHeaders: _defineHeaders,
      
      getDestinationInfo: function () { return _destInfo; },
      
      setDestinationForForm: function (formCreationFunc) {
        var before = [];
        
        // 
        var ctx = contextManager({
          enter: function (form) {
            _getSheets().forEach(function (b) {
              var id = b.properties.sheetId;
              before.push(id);
            });
            return form;
          },
          exit: function (form) {
            if (typeof form === 'undefined') {
              _destInfo.push({id: null, sheetId: null, error: "Did not pas form into exit"});
              return;
            }
            form.setDestination(FormApp.DestinationType.SPREADSHEET, _getId());
            var after = null;
            _getSheets().forEach(function (a) {
              if (before.indexOf(a.properties.sheetId) === -1) {
                after = a;
              }
            });
            if (after == null) {
              _destInfo.push({id: null, sheetId:null, error: "Could not detect after creation."});
            } else {
              _destInfo.push({id: _getId(), sheet: after, sheetId: after.properties.sheetId, index: after.properties.index, error: false});
            }
          },
        });
        
        ctx(formCreationFunc);
        
        return _destInfo;
      },
   
      /*
        Chainable convenience methods that builds request objects for execution upon completion
      */
      withRequestBuilder: contextManager({
        enter: function (obj) {
          obj.preSSRequests = [];
          obj.sRequests = [];
          obj.postSSRequests = [];
          return obj;
        },
        exit: function (obj) {
          if (obj.preSSRequests.length > 0) {
            Sheets.Spreadsheets.batchUpdate({requests:obj.preSSRequests}, _getId());  // TODO: What about "empty response" error
          }
          if (obj.sRequests.length > 0) {
            if (obj._tabsAutoClear) {
              var allSheets = obj.sRequests.reduce(function (acc, item) {
                acc.push(item.range.match(/(.*)!/)[1]);
                return acc;
              }, []);
              allSheets.filter(function (i, p, a) {
                return a.indexOf(i) == p;
              }).forEach(function (sheetName) {
                _clearTab(sheetName);  // use the 
              });
            }
            Logger.log('Update values: ' + obj.sRequests.range + ' -> ' + obj.sRequests.values);
            Sheets.Spreadsheets.Values.batchUpdate({
              valueInputOption: "USER_ENTERED",
              data: obj.sRequests
            }, _getId());
          }
          if (obj.postSSRequests.length > 0) {
            Sheets.Spreadsheets.batchUpdate({requests:obj.postSSRequests}, _getId());  // TODO: What about "empty response" error
          }        
        },
        params: [{
          _valuesSortBy: null,
          preSSRequests: [],
          sRequests: [],
          postSSRequests: [],
          _tabsAutoClear: false,
          tabsAutoClear: function () {
            this._tabsAutoClear = true;
            Logger.log(this._tabsAutoClear);
          },
          setValuesSortByIndex: function (sortBy) {
            this._valuesSortBy = sortBy;
          },
          addValueRequest: function (request) {
            Logger.log(request.range + ' -> ' + request.values);
            this.sRequests.push(request);
            return this;
          },
          addPropertyRequest: function (request) {
            this.preSSRequests.push(request);
            return this;
          },
          addSheetPropertyRequest: function (request) {
            this.preSSRequests.push(request);
            return this;
          },
          addSheetRequest: function (request) {
            this.preSSRequests.push(request);
            return this;
          },
          addSortRangeRequest: function (request) {
            this.postSSRequests.push(request);
            return this;
          },
          utils: {
            toRange: function (title, left, right) {
              if (title.indexOf(' ') !== -1)
                title = "'" + title + "'";
              if (typeof right === 'undefined')
                return title + '!' + left.toString() + ':' + left.toString();
              else
                return title + '!' + left.toString() + ':' + right.toString();
            },
            valuesRequestFromRange: function (values, title, left, right) {
              return {
                majorDimension: _dimension,
                range: this.toRange(title, left, right),
                values: values
              }
            },
            valuesRequest: function (values, rangeA1Notation, _dim) {
              return {
                majorDimension: _dim || _dimension,
                range: rangeA1Notation,
                values: values
              }
            },
            columnCountRequest: function (id, numCols) {
              return {
                updateSheetProperties: {
                  properties: {
                    sheetId: id,
                    gridProperties: {
                      columnCount: numCols,
                    }
                  },
                  fields: 'gridProperties.columnCount',
                }
              };
            },
            hideGridlinesRequest: function (id, bool) {
              return {
                updateSheetProperties: {
                  properties: {
                    sheetId: id,
                    gridProperties: {
                      hideGridlines: bool,
                    }
                  },
                  fields: 'gridProperties.hideGridlines',
                }
              };
            },
            rowCountRequest: function (id, numRows) {
              return {
                updateSheetProperties: {
                  properties: {
                    sheetId: id,
                    gridProperties: {
                      rowCount: numRows,
                    }
                  },
                  fields: 'gridProperties.rowCount',
                }
              };
            },
            frozenRowsRequest: function (id, numRows) {
              var sheet = _getSheet(id);
              return {
                updateSheetProperties: {
                  properties: {
                    sheetId: sheet.properties.sheetId,
                    gridProperties: {
                      frozenRowCount: numRows,
                    }
                  },
                  fields: 'gridProperties.frozenRowCount',
                }
              };
            },
            frozenColumnsRequest: function (id, numCols) {
              return {
                updateSheetProperties: {
                  properties: {
                    sheetId: id,
                    gridProperties: {
                      frozenColumnCount: numCols,
                    }
                  },
                  fields: 'gridProperties.frozenColumnCount',
                }
              };
            },
            tabColorRequest: function (id, red, green, blue, alpha) {
              if (typeof alpha === 'undefined')
                alpha = 1;
              return {
                updateSheetProperties: {
                  properties: {
                    sheetId: id,
                    tabColor: {
                      red: red,
                      green: green,
                      blue: blue,
                      alpha: alpha
                    }
                  },
                  fields: 'tabColor',
                }
              };
            },
            
            newTabRequest: function (title) {
              return {
                addSheet: {
                  properties: {
                    title: title
                  }
                },
              }
            },
            
            tabTitleRequest: function (id, title) {
              return {
                updateSheetProperties: {
                  properties: {
                    sheetId: id,
                    title: title
                  },
                  fields: 'title',
                },
              }
            },
            
            sortRequest: function (range, dimensionIndex, sortOrder) {
              return {
                sortRange: {
                  range: _a1notation2gridrange(range),
                  sortSpecs: {
                    dimensionIndex: dimensionIndex || 0,
                    sortOrder: sortOrder || 'ASCENDING',
                  }
                }
              
              }
            },
          },
        }],
      })
    }; // return
  };  // DBSheets()


  // ENTRY POINT
  
  globalContext.DBSheets = function (_spreadsheetID) {

    _spreadsheetID = _spreadsheetID || SpreadsheetApp.getActiveSpreadsheet().getId();
    return DBSheets.fromId(_spreadsheetID);

  };

  // CONSTRUCTORS: 
  DBSheets.fromId = function (id) {
    return DBSheets_(Sheets.Spreadsheets.get(id));
  };
  DBSheets.fromRange = function (range) {
    var ss = range.getSheet().getParent();
    return DBSheets.fromId(ss.getId());
  };
  DBSheets.createWithTitle = function (title) {
    var resource = {properties: {title: title}};
    return DBSheets_(Sheets.Spreadsheets.create(resource));
  };
  DBSheets.createWithProperties = function (resource) {
      return DBSheets_(Sheets.Spreadsheets.create(resource));
  };

})(this);