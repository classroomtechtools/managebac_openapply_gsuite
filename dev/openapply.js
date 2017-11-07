function open_apply() {
  // Construct global variables
  var api_key = '119fa52af433c6304a44f18e866150e9',
      url = 'https://igbis.openapply.com/api/v1/{endpoint}',
      count = 100,
      sinceId = 0,
      accumulatedCount = 0;

  var request = ApiWrapper(url, {auth_token: api_key});
  var sheetApi = sheetsdb.DBSheets();
  var sheets = sheetApi.getSheets();
  var sheetTitles = [];
  sheets.forEach(function (sheet) {
    sheetTitles.push(sheet.properties.title);
  });

  var areaNames = ['students', 'parents'];

  sheetApi.withRequestBuilder(function (rb2) {
    areaNames.forEach(function (areaName) {
      var targetSheet = 'openapply_' + areaName;
      if (sheetTitles.indexOf(targetSheet) == -1) {
        rb2.addSheetRequest(rb.utils.newTabRequest(targetSheet));
      }
    });
  });

  sheetApi.withRequestBuilder(function (rb) {
    rb.tabsAutoClear();
    //rb.tabsAutoCreate();   TODO: Would mean being able to delete block above
    
    do {
      request.setQuery({auth_token: api_key, count: count, since_id: sinceId});
      var response = request.fetchJson({endpoint: 'students'});
      Logger.log(response);
      var areas = [response['students'], response['linked'] ? response['linked']['parents'] : [] ];
      Logger.log(areas);
      areas.forEach(function (rows, areaIndex) {
        var areaName = areaNames[areaIndex];
        var target_sheet = 'openapply_' + areaName;
       
        // Ensure the header row exists
        rb.addPropertyRequest(rb.utils.frozenRowsRequest(target_sheet, 1));
        //
  
        var visibleHeaders = [],
            customFieldHeaders = [],
            headers = [];
  
        for (var key in rows[0]) {
          if (key == 'custom_fields') {
            for (var k in rows[0][key]) {
              customFieldHeaders.push(k);
            }
          } else {
            visibleHeaders.push(key);
          }
          headers.push(key);
        }
        visibleHeaders.splice.apply(visibleHeaders, [visibleHeaders.length, 0].concat(customFieldHeaders));
        rb.addValueRequest(
          rb.utils.valuesRequest([visibleHeaders], target_sheet + '!1:1')
        );
        
        // Go through each row returned in result
        // and update the sheet dynamically
        rows.forEach(function (rowObj, rowIndex) {        
          var rowKeys = [];
          var rowValues = [];
          headers.forEach(function (header) {
            var rawValue = rowObj[header];
            
            if (typeof rawValue === 'undefined') {
              rowValues.push('');  // otherwise we end up with one-off errors
            }
            else if (Array.isArray(rawValue)) {
              // render lists as a space eliminated string
              rowValues.push(rawValue.join(" "));
            }
            else if (typeof rawValue === 'object') {
              if (header == 'custom_fields') {
                customFieldHeaders.forEach(function (field) {
                  if (rawValue && rawValue[field] && rawValue[field].indexOf('+') == 0) {
                    rowValues.push('=t("'+rawValue[field]+'")');
                  } else {
                    rowValues.push(rawValue[field]);
                  }
                });
              } else {
                rowValues.push(rawValue);
              }
            }
            else if (typeof rawValue === 'string' && rawValue.indexOf('+') == 0) {
              // make it a text formula b/c + is rendered as a formula
              rowValues.push('=t("'+rawValue+'")');
            } else {
              if (header == 'enrolled_at') {  // TODO: wish there was a better way to do this
                // rowValues.push( new Date(rawValue) );
                rowValues.push('=DATEVALUE(LEFT("' + rawValue + '", SEARCH("T", "' + rawValue + '")-1))');
              } else {
                rowValues.push(rawValue);
              }
            }
          });
          
          // Last operation through each loop is to send the 
          // write request into the queue        
          var rowNotation = target_sheet + "!" + (accumulatedCount + rowIndex+2).toString() + ':' + (accumulatedCount + rowIndex+2).toString();
          rb.addValueRequest(
            rb.utils.valuesRequest([rowValues], rowNotation)
          );
          //
        });
        //
      });  // areas.forEach
        
      accumulatedCount += response['students'].length;
      sinceId = response['students'][response['students'].length-1].id;
      Logger.log(response['meta']);
      
    } while (response['meta'].pages > 1);
   
  
  });
    
}