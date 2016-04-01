var fs = require('fs'),
    http = require('http'),

    Datastore = require('nedb'),
    jsonBody = require('body/json'),
    routes = require('routes'),
    st = require('st');

var config = require('./config'),
    def = require('./moose-def'),
    db = new Datastore({ filename: './moose.db', autoload: true }),
    mount = st({ path: __dirname + '/browser', url: '/' }),
    router = routes(),
    // cache index to avoid fs reads
    indexHtml = fs.readFileSync('./browser/index.html'),
    server;

// make sure name is indexed since it's used for finding the moose in IRC
db.ensureIndex({ fieldName: 'name' });

// make sure the moose has no colours that aren't defined here
function validateMoose(moose) {
    var i, j;

    if (moose.length !== def.height || moose[0].length !== def.width) {
        return false;
    }

    for (i = 0; i < moose.length; i += 1) {
        for (j = 0; j < moose[0].length; j += 1) {
            // is the colour of the cell in our colour definition?
            if (def.colours.indexOf(moose[i][j]) === -1) {
                return false;
            }
        }
    }

    return true;
}

function error(req, res, message) {
    res.statusCode = 500;
    res.end('{"error":"' + message + '"}');
}

function notFound(req, res) {
    res.statusCode = 404;
    res.end('{"error":"not found"}');
}

// used finding the latest moose in the gallery
router.addRoute('/moose/latest', function (req, res) {
    db.find({}).sort({ added: 1 }).limit(10).exec(function (err, moose) {
        if (err) {
            console.error(err.stack);
            return error(req, res, 'database error');
        }

        res.end(JSON.stringify(moose));
    });
});

router.addRoute('/moose/:name', function (req, res, params) {
    // find a specific moose by name
    if (req.method === 'GET') {
        db.findOne({ name: params.name }, function (err, moose) {
            if (err) {
                console.error(err.stack);
                return error(req, res, 'database error');
            }

            if (moose) {
                res.end(JSON.stringify(moose));
            } else {
                notFound(req, res);
            }
        });
    // create a new moose
    } else if (req.method === 'POST') {
        if (!/[A-z0-9 -_]+/.test(params.name) || params.name.length > 48) {
            return error(req, res, 'invalid moose name');
        }

        jsonBody(req, function (err, body) {
            if (err) {
                console.error(err.stack);
                return error(req, res, 'invalid json');
            }

            if (!validateMoose(body)) {
                error(req, res, 'malformed moose (wrong colours or size)');
                return;
            }

            db.findOne({ name: params.name }, function (err, moose) {
                if (err) {
                    console.error(err.stack);
                    return error(req, res, 'database error');
                }

                if (moose) {
                    // 409 is used to specify existing moose
                    res.statusCode = 409;
                    return res.end('{"error":"moose already exists" }');
                }

                db.insert({
                    name: params.name,
                    moose: body,
                    added: Date.now()
                });

                res.end('{"success":"created new moose"}');
            });
        });
    } else {
        error(req, res, 'wrong method');
    }
});

// additional to the /index.html handled by st
router.addRoute('/', function (req, res) {
    res.end(indexHtml);
});

server = http.createServer(function (req, res) {
    var match = router.match(req.url);

    if (match) {
        match.fn(req, res, match.params);
    } else {
        mount(req, res, notFound);
    }
});

server.listen(config.port, function () {
    console.log('listening on ' + server.address().port);
});
