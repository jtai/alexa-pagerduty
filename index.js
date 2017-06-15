var alexa = require('alexa-app');
var https = require('https');
var moment = require('moment-timezone');
var humanizeList = require('humanize-list');
var Q = require('q');
var package_json = require('./package.json');

// Allow this module to be reloaded by hotswap when changed
module.change_code = 1;

var getSchedules = function() {
  var deferred = Q.defer();

  getCalendarFeed().then(function(data) {
    var timezone = parseCalendarFeedTimezone(data);
    var events = parseCalendarFeedEvents(data);
    var now = moment();
    var activeSchedules = getActiveSchedules(events, now);
    var nextSchedules = getNextSchedules(events, now);

    deferred.resolve({
      timezone: timezone,
      now: now,
      activeSchedules: activeSchedules,
      nextSchedules: nextSchedules
    });
  }, deferred.reject);

  return deferred.promise;
};

var getCalendarFeed = function() {
  var deferred = Q.defer();

  https.get(package_json.pagerduty.url, function(response) {
    if (response.statusCode == 200) {
      var body = '';
      response.on('data', function(data) {
        body += data;
      });
      response.on('end', function() {
        deferred.resolve(body);
      });
    } else {
      deferred.reject(response);
    }
  }).on('error', function(e) {
    deferred.reject(e);
  });

  return deferred.promise;
};

var parseCalendarFeedTimezone = function(data) {
  var timezone = 'UTC';
  var flag = false;

  data.split("\n").forEach(function(line) {
    if (line == 'BEGIN:VTIMEZONE') {
      flag = true;
    } else if (line == 'END:VTIMEZONE') {
      flag = false;
    } else if (flag) {
      var kv = line.split(':');
      var key = kv[0].split(';')[0];
      var value = kv[1];
      if (key == 'TZID') {
        timezone = value;
      }
    }
  });

  return timezone;
};

var parseCalendarFeedEvents = function(data) {
  var events = [];
  var vevent = {};

  data.split("\n").forEach(function(line) {
    if (line == 'BEGIN:VEVENT') {
      vevent = {};
    } else if (line == 'END:VEVENT') {
      events.push(vevent);
      vevent = {};
    } else {
      var kv = line.split(':');
      var key = kv[0].split(';')[0];
      var value = kv[1];
      if (key == 'SUMMARY') {
        value = value.replace(/^On Call - /, '');
      }
      vevent[key] = value;
    }
  });

  return events;
};

var getActiveSchedules = function(events, now) {
  return events.filter(function(vevent) {
    return now.isBetween(vevent.DTSTART, vevent.DTEND);
  });
};

var getNextSchedules = function(events, now) {
  var futureSchedules = events.filter(function(vevent) {
    return now.isBefore(vevent.DTSTART);
  });

  var earliestSchedule = futureSchedules.reduce(function(a, b) {
    return moment(a.DTSTART).isBefore(b.DTSTART) ? a : b;
  });
  var earliestDtstart = moment(earliestSchedule.DTSTART);

  return futureSchedules.filter(function(vevent) {
    return earliestDtstart.isSame(vevent.DTSTART);
  });
};

var humanizeSchedules = function(events) {
  return humanizeList(events.map(function(vevent) {
    return vevent.SUMMARY;
  }));
};

var humanizeSchedulesWithEndTimes = function(events, timezone, now) {
  var endTimes = {};
  events.forEach(function(vevent) {
    if (!endTimes[vevent.DTEND]) {
      endTimes[vevent.DTEND] = [];
    }
    endTimes[vevent.DTEND].push(vevent.SUMMARY);
  });

  var list = [];
  for (var endTime in endTimes) {
    if (!endTimes.hasOwnProperty(endTime)) {
        continue;
    }
    list.push(humanizeList(endTimes[endTime])+" until "+humanizeTime(endTime, timezone, now));
  }

  return humanizeList(list);
};

var humanizeTime = function(time, timezone, now) {
  return moment(time).tz(timezone).calendar(now, {sameElse: 'dddd, MMMM Do [at] LT'});
};

var app = new alexa.app('pagerduty');
app.id = package_json.alexa.applicationId;

app.launch(function(request, response) {
  response.say("You can ask if you are on call, what schedule you are on call for, or when " +
               "your current on call ends. You can also ask when your next on call starts.");
});

app.intent('IsOnCallIntent', {
  utterances: [
    "if I am {|currently }on call",
    "if I am on call right now",
    "am I {|currently }on call",
    "am I on call right now",
  ]
}, function(request, response) {
  return getSchedules().then(function(data) {
    if (data.activeSchedules.length == 0) {
      response.say("No. You will be on call for "+humanizeSchedules(data.nextSchedules)+
                   " starting "+humanizeTime(data.nextSchedules[0].DTSTART, data.timezone, data.now)+".");
    } else {
      response.say("Yes. You are on call for "+humanizeSchedulesWithEndTimes(data.activeSchedules, data.timezone, data.now)+".");
    }
    response.send();
  }, function(error) {
    response.say("Sorry, I'm having trouble getting the pager duty schedule.");
    response.send();
  });
});

app.intent('ActiveSchedulesIntent', {
  utterances: [
    "what {|rotation |rotations |schedule |schedules |policy |policies }am I {|currently }on call for",
    "what {|rotation |rotations |schedule |schedules |policy |policies }am I on call for right now",
    "when my {|current }on call {|rotation |schedule |policy }ends",
    "when does my {|current }on call {|rotation |schedule |policy }end",
    "when is my {|current }on call {|rotation |schedule |policy }over",
  ]
}, function(request, response) {
  return getSchedules().then(function(data) {
    if (data.activeSchedules.length == 0) {
      response.say("You are not currently on call. You will be on call for "+humanizeSchedules(data.nextSchedules)+
                   " starting "+humanizeTime(data.nextSchedules[0].DTSTART, data.timezone, data.now)+".");
    } else {
      response.say("You are on call for "+humanizeSchedulesWithEndTimes(data.activeSchedules, data.timezone, data.now)+".");
    }
    response.send();
  }, function(error) {
    response.say("Sorry, I'm having trouble getting the pager duty schedule.");
    response.send();
  });
});

app.intent('NextSchedulesIntent', {
  utterances: [
    "what {|rotation |rotations |schedule |schedules |policy |policies }am I on call for next",
    "when my next on call {|rotation |schedule |policy }{starts|begins}",
    "when does my next on call {|rotation |schedule |policy }{start|begin}",
    "when is my next on call {|rotation |schedule |policy }",
    "when am I next on call",
    "when am I on call next",
  ]
}, function(request, response) {
  return getSchedules().then(function(data) {
    if (data.nextSchedules.length == 0) {
      response.say("You are not scheduled for any upcoming on call.");
    } else {
      response.say("You will be on call for "+humanizeSchedules(data.nextSchedules)+
                   " starting "+humanizeTime(data.nextSchedules[0].DTSTART, data.timezone, data.now)+".");
    }
    response.send();
  }, function(error) {
    response.say("Sorry, I'm having trouble getting the pager duty schedule.");
    response.send();
  });
});

module.exports = app;
