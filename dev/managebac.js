/*
  Using version 2 of ManageBac's API
  Download student data, including class enrollment information
  and output to a sheet
*/

function columnToLetter_(column)
{
  var temp, letter = '';
  while (column > 0)
  {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}


function managebac() {
  // Construct global variables
  var endpoints = ['teachers', 'students', 'parents', 'ib-groups', 'classes'];
  var api_key = 'c4c1da59826606bc813f5f8da0bbe9e853778ff90dae1a0a616938b238a1e533',
      url = 'https://api.managebac.com/v2/{endpoint}',
      per_page = 200,
      headers = {"auth-token": api_key};

  // Loop through each endpoint available to us
  var page = 1;

  var request = ApiWrapper(url, {headers: headers});
  var sheetApi = sheetsdb.DBSheets();
  var sheets = sheetApi.getSheets();
  var sheetTitles = [];
  sheets.forEach(function (sheet) {
    sheetTitles.push(sheet.properties.title);
  });

  sheetApi.withRequestBuilder(function (rb) {
    rb.tabsAutoClear();
    
    endpoints.forEach(function (endpoint) {  
      // ensures that all data is sorted by ID
      // FIXME: but what if ID is not the first one?

      // Add the sheet to the request queue
      // but only if we don't already have that sheet
      if (sheetTitles.indexOf(endpoint) == -1) {
        rb.addSheetRequest(rb.utils.newTabRequest(endpoint));
      }
      //
      
      // Copy the headers before clearing.
      // we'll use this later to rebuild what the user may have reorganized
      var headers = [];
      //
      
      // Ensure the header row exists
      rb.addPropertyRequest(rb.utils.frozenRowsRequest(endpoint, 1));
      //
      
      var page = 1;
      var total_pages = 1;
      var rowKeys = [];
      var rowValues = []
      
      while (total_pages >= page) {
          request.setQuery({page: page, per_page: per_page});
          var response = request.fetchJson({endpoint: endpoint});
          var rows = response[endpoint.replace('-', '_')];  // bug bear

          // On the first page, ensure the header info is right (if needed)
          // and we initialize our endpoint_ids
          if (page == 1) {
              if (rows.length > 0 && headers.length == 0) {
                  for (var key in rows[0]) {
                      headers.push(key);
                  }
              }
          }
          //
          
          // Go through each row returned in result
          // and update the sheet dynamically
          rows.forEach(function (rowObj, rowIndex) {          
              rowKeys = [];
              rowValues = [];
              headers.forEach(function (header) {
                  var rawValue = rowObj[header];
                  if (typeof rawValue === 'undefined') {
                      rowValues.push('');  // otherwise we end up with one-off errors
                  }
                  else if (Array.isArray(rawValue)) {
                      // render lists as a space eliminated string
                      if (header == "teachers") {  // yuck, but necessary
                          var values = [];
                          rawValue.forEach(function (item) {
                              if (item.show_on_reports) {
                                  values.push(item.teacher_id);
                              }
                          });
                          rowValues.push(values.join(" "));
                      } else {
                          rowValues.push(rawValue.join(" "));
                      }
                  }
                  else if (typeof rawValue === 'object') {
                      rowValues.push(rawValue)
                  }
                  else if (typeof rawValue === 'string' && rawValue.indexOf('+') == 0) {
                      // make it a text formula b/c + is rendered as a formula
                      rowValues.push('=t("'+rawValue+'")');
                  } else {
                      rowValues.push(rawValue);
                  }
              });

              // Last operation through each loop is to send the 
              // write request into the queue
              var rowNotation = (rowIndex+2 + ((page-1) * per_page)).toString();
              rowNotation = endpoint + "!" + rowNotation + ':' + rowNotation;
              rb.addValueRequest(
                rb.utils.valuesRequest([rowValues], rowNotation)
              );
              //
          });
          //
          
          page += 1;
          total_pages = response.meta.total_pages;
      }
      
      // We queue this at the end to give us more flexibility
      // with defining the headers
      rb.addValueRequest(
          rb.utils.valuesRequest([headers], endpoint + '!1:1')
      );

      rb.addSortRangeRequest(
        rb.utils.sortRequest(endpoint + '!A2:' + columnToLetter_(headers.length))
      );
      //
    });
  });
    
}

