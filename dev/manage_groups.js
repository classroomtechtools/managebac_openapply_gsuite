function listAllGroups_() {
  var pageToken, page, allGroups = [];
  do {
    page = AdminDirectory.Groups.list({
      domain: 'igbis.edu.my',
      maxResults: 100,
      pageToken: pageToken
    });
    var groups = page.groups;
    if (groups) {
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        allGroups.push(group.email);
      }
    } else {
      Logger.log('No groups found.');
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  
  return allGroups;
}

function listMembers_(groupEmail) {
  var pageToken, page, allMembers = [];
  var totalNum = 0;
  do {
    page = AdminDirectory.Members.list({
      maxResults: 200,
    }, {groupKey: groupEmail, pageToken: pageToken});
    var members = page.members;
    totalNum += members.length;
    if (members) {
      for (var i = 0; i < members.length; i++) {
        var member = members[i].email.toLowerCase();
        allMembers.push(member);
      }
    } else {
      Logger.log('No groups found.');
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return allMembers;
}

function manage_groups() {

  var REMOVEON = false;
  
  var sheetApi = sheetsdb.DBSheets();
  var all_groups = listAllGroups_();
  
  var findGroups = function (emails, row) {
      var data = row[0].split(':');
      var group_email = data[0].toLowerCase();
      if (!group_email) {
        return emails;
      }
      if (emails.indexOf(group_email) == -1) {
        if (all_groups.indexOf(group_email) == -1) {
          Logger.log("Need to create group " + group_email);
        } else {
          emails.push(group_email);
        }
      }
      return emails;
    }

  var columns = ['R'];  // ['Q', 'N', 'O', 'P', 'R'];
  
  columns.forEach(function (column) {

    var group_emails = sheetApi.getRange('gam parent1_homeroom_grade!' + column + '2:' + column).getValues().reduce(findGroups, []);
    
    group_emails.forEach(function (group_email) {    
      var currentMembers = listMembers_(group_email);
      
      var findMembers = function (members, row) {
          var data = row[0].split(':');
          if (data.length == 1) {
            return members;
          }
          var ge = data[0].toLowerCase();
          var memberEmail = data[1].trim().toLowerCase();
          if (!memberEmail) {
            return members;
          }
          if (ge == group_email) {
            members.push(memberEmail);
          }
          return members;
        };
      
      var listedMembersA = sheetApi.getRange('gam parent1_homeroom_grade!' + column + '2:' + column).getValues().reduce(findMembers, []);
      var listedMembersB = sheetApi.getRange('gam parent2_homeroom_grade!' + column + '2:' + column).getValues().reduce(findMembers, []);
      var listedMembers = listedMembersA.concat(listedMembersB).filter(function (value, index, self) {
        return self.indexOf(value) === index;   // filter out to get uniques
      });
        
      listedMembers.forEach(function (lm) {
        if (currentMembers.indexOf(lm) == -1) {
          // check to see if any aliases are in there instead
          // remove those, and add .. i.e. substitute
          try {
            var aliases = AdminDirectory.Users.Aliases.list(lm);
          } catch (e) {
            Logger.log(e.toString());  // Common problem "fake email address"
            return;
          }
          if ('aliases' in aliases) {
            aliases['aliases'].forEach(function (aliasRes) {
              if (aliasRes.alias) {
                if (listedMembers.indexOf(aliasRes.alias)) {
                  Logger.log("Making way for " + lm + " by removing " + aliasRes.alias + " from group " + group_email);
                  try {
                    AdminDirectory.Members.remove(group_email, aliasRes.alias);
                  } catch (e) {
                    Logger.log(aliasRes.alias + ' is not present, which is fine: ' + e.toString());
                  }
                  // TODO: catch no member key, which can happen if out of sync  
                }
              }
            });
          }
          AdminDirectory.Members.insert({
            email: lm,
            role: 'MEMBER'
          }, group_email);
          Logger.log("Added " + lm + " to group " + group_email);        
        }
      });

      if (REMOVEON) {

        currentMembers.forEach(function (cm) {
          if (listedMembers.indexOf(cm) == -1) {
            Logger.log("Remove " + cm + " from group " + group_email);
            AdminDirectory.Members.remove(group_email, cm);
          }
        });
        
      }
    });
  });
}
