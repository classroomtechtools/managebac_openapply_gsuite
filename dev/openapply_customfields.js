function open_apply_customfields() {
  // Construct global variables
  var endpoints = ['students'];
  var api_key = '119fa52af433c6304a44f18e866150e9',
      url = 'https://igbis.openapply.com/api/v1/{endpoint}/{id}',
      custom_fields = ['health_information', 'immunization_record', 'emergency_contact'],
      sheet_prefix = 'openapply_indv_';

  var request = ApiWrapper(url, {auth_token: api_key});
  var sheetApi = sheetsdb.DBSheets();
  var sheets = sheetApi.getSheets();
  var sheetTitles = [];
  sheets.forEach(function (sheet) {
    sheetTitles.push(sheet.properties.title);
  });
  
  // TODO: what if this doesn't already exist?
  var student_internal_ids = sheetApi.getRange('openapply_students!A2:V').getValues().reduce(
    function (enrolled, row) {
      if (row[21] == 'enrolled') {
        enrolled.push(row[0]);
      }
      return enrolled;
    }, []);

  sheetApi.withRequestBuilder(function (rb) {
 
    endpoints.forEach(function (endpoint) {  
      var target_sheet = sheet_prefix + endpoint;
      // Add the sheet to the request queue
      // but only if we don't already have that sheet      
      sheetApi.withRequestBuilder(function (rb2) {
        if (sheetTitles.indexOf(target_sheet) == -1) {
          rb2.addSheetRequest(rb.utils.newTabRequest(target_sheet));
        }
      });
      //
            
      // Clear the contents of each target tab
      sheetApi.clearTab(target_sheet);
      //

      // Ensure the header row exists
      rb.addPropertyRequest(rb.utils.frozenRowsRequest(target_sheet, 1));
      //
      
      var headers = [];
      
      request.setQuery({auth_token: api_key}); 
       
      var rowIndex = 1;
      student_internal_ids.forEach(function (id) {
        var response = request.fetch({endpoint: endpoint, id: id});
        var student = response['student'];  // no need to abstract away hard-coded string this away, right because no parents?
        
        // Ensure the header info is right (if needed)
        if (headers.length == 0) {
          custom_fields.forEach(function (header) {
            for (var key in student['custom_fields'][header][0]) {
              headers.push(header + ':' + key);
            }
          });
        }
        //
        
        rb.addValueRequest(
          rb.utils.valuesRequest([['id']], sheet_prefix + endpoint + '!A1')
        );
        rb.addValueRequest(
          rb.utils.valuesRequest([headers], sheet_prefix + endpoint + '!B1:1')
        );
        
        var rowsValues = [];
        var total = headers.reduce(function (acc, value, i) {
           var split = headers[i].split(':');  // unpack it
           var left_header = split[0];
           return Math.max(acc, student['custom_fields'][left_header].length);
        }, 0);

        var rowsValues = [];
        for (num = 0; num < total; num++) {
          rowsValues.push([id]);
          headers.forEach(function (full_header) {
            var split = full_header.split(':');  // unpack it
            var left_header = split[0];
            var right_header = split[1];
            if (num >= student['custom_fields'][left_header].length) {
              rowsValues[num].push('');
            } else {
              var rawValue = student['custom_fields'][left_header][num][right_header];  // gets a list
              if (typeof rawValue === 'undefined') {
                rowsValues[num].push('');  // otherwise we end up with one-off errors
              }
              else if (Array.isArray(rawValue)) {
                // render lists as a space eliminated string
                rowsValues[num].push(rawValue.join(" "));
              }
              else if (typeof rawValue === 'object') {
                rowsValues[num].push(rawValue)
              }
              else if (typeof rawValue === 'string' && rawValue.indexOf('+') == 0) {
                // make it a text formula b/c + is rendered as a formula
                rowsValues[num].push('=t("'+rawValue+'")');
              } else {
                rowsValues[num].push(rawValue);
              }
            }
         }); 
        }
        rowIndex += num;
                
        // Last operation through each loop is to send the 
        // write request into the queue
        if (rowsValues.length > 0) {
          var rowNotation = sheet_prefix + endpoint + "!" + (rowIndex-rowsValues.length+1).toString() + ':' + (rowIndex).toString();
          Logger.log(rowNotation);
          rb.addValueRequest(
            rb.utils.valuesRequest(rowsValues, rowNotation)
          );
        }
        //
       
      });  // student_internal_ids
      
    });
  
  });
    
}