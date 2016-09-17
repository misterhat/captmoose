var http = require('http'),

    irc = require('irc'),
    c = require('irc-colors');

var config = require('./config'),
    client = new irc.Client(config.server, config.nick || 'CaptMoose', {
        channels: config.channels
    }),
    // when the last moose display occured
    lastMessage = 0,
    url = 'http://' + config.host + (config.port ? ':' + config.port : '');

// find a moose on the moose server and try to parse it
function findMoose(name, done) {
    http.request({
        host: config.host,
        port: config.port,
        path: '/moose/' + encodeURIComponent(name)
    }, function (res) {
        var moose = '';

        if (!/^2/.test(res.statusCode)) {
            return done();
        }

        res.on('data', function (chunk) {
            moose += chunk;
        });

        res.on('end', function () {
            try {
                moose = JSON.parse(moose);
                done(null, moose);
            } catch (e) {
                done(e);
            }
        });

        res.on('error', function (err) {
            done(err);
        });
    }).end();
}

// remove the transparent padding around the moose
function shrinkMoose(moose) {
    var minX = moose[0].length,
        minY = moose.length, maxY = 0,
        i, j;

    for (i = 0; i < moose.length; i += 1) { // height
        for (j = 0; j < moose[0].length; j += 1) { // width
            if (moose[i][j] !== 'transparent') {
                if (i < minY) {
                    minY = i;
                } else if (i > maxY) {
                    maxY = i;
                }

                if (j < minX) {
                    minX = j;
                }
            }
        }
    }

    moose = moose.slice(minY, maxY + 1).map(function (row) {
        var lastColour = row.length,
            i;

        for (i = 0; i < row.length; i += 1) {
            if (row[i] !== 'transparent') {
                lastColour = i;
            }
        }

        return row.slice(minX, lastColour + 1);
    });

    return moose;
}

// turn the moost from a 2D list of colours to a 2D list of IRC colour codes
function formatMoose(moose) {
    return moose.map(function (row) {
        return row.map(function (colour) {
            if (colour === 'transparent') {
                return c.stripColors(' ');
            }

            return c[colour]['bg' + colour]('@');
        });
    });
}

// we don't want the moose to get kicked for spamming, so implement a short
// delay between two lines
function sayMoose(say, moose, done) {
    if (moose.length) {
        say(moose[0].join(''));

        if (moose[1]) {
            say(moose[1].join(''));
        }

        setTimeout(function () {
            sayMoose(say, moose.slice(2, moose.length), done);
        }, 800);
    } else {
        if (done) {
            return done();
        }
    }
}

client.addListener('message', function (from, to, message) {
    // make sure only valid characters exist in the mooseme command
    var mooseMe = message.match(/^\.?moose(?:me)? ([A-z0-9 -_]+)/),
        bots = /^\.bots/.test(message),
        lastMessageAge;

    // message not from channel
    if (!/#/.test(to) || !(mooseMe || bots)) {
        return;
    }

    lastMessageAge = Math.round((Date.now() - lastMessage) / 1000);

    // moose was called too recently
    if (lastMessageAge < 25) {
        client.say(from, 'please wait another ' + (26 - lastMessageAge) + 
                         ' seconds');
        return;
    }

    if (bots) {
        client.say(to, 'CaptMoose [NodeJS], create moose pictures at ' + url);
        return;
    }

    mooseMe = mooseMe[1].trim();

    findMoose(mooseMe, function (err, moose) {
        var shrunk;

        if (err) {
            client.say(to, c.bold.red('moose parsing error'));
            return console.error(err.stack);
        }

        if (!moose) {
            return client.say(to, c.bold.red('moose not found.') + ' create ' +
                                  'him at ' + url + '/edit/' +
                                  encodeURIComponent(mooseMe));
        }

        lastMessage = Date.now();
        shrunk = formatMoose(shrinkMoose(moose.moose));
        sayMoose(client.say.bind(client, to), shrunk, function () {
            if (mooseMe === 'random') {
                client.say(to, 'a lovely ' + moose.name + ' moose');
            }
        });
    });
});

client.addListener('error', function (err) {
    console.error(err.stack);
});
