var fs = require('fs'),
    http = require('http'),

    Datastore = require('nedb'),
    jsonBody = require('body/json'),
    routes = require('routes'),
    st = require('st');

var config = require('./config'),
    def = require('./moose-def'),
    db = new Datastore({ filename: './moose.db', autoload: true }),
    mount = st({ path: __dirname + '/browser', url: '/', passthrough: true }),
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

function error(res, err) {
    console.error(err.stack);
    res.statusCode = 500;
    res.end('{"error":"' + err + '"}');
}

function notFound(res) {
    res.statusCode = 404;
    res.end('{"error":"not found"}');
}

// find a random moose
router.addRoute('/moose/random', function (req, res) {
    db.count({}, function (err, count) {
        var random;

        if (err) {
            return error(res, err);
        }

        random = Math.floor(Math.random() * count);

        db.find({}).skip(random).limit(1).exec(function (err, moose) {
            if (err) {
                error(res, err);
            } else {
                res.end(JSON.stringify(moose[0]));
            }
        });
    });
});

// used finding the latest moose in the gallery
router.addRoute('/moose/latest', function (req, res) {
    db.find({}).sort({ added: 1 }).limit(10).exec(function (err, moose) {
        if (err) {
            error(res, err);
        } else {
            res.end(JSON.stringify(moose));
        }
    });
});

router.addRoute('/moose/:name', function (req, res, params) {
    // find a specific moose by name
    if (req.method === 'GET') {
        db.findOne({ name: params.name }, function (err, moose) {
            if (err) {
                error(res, err);
            } else if (moose) {
                res.end(JSON.stringify(moose));
            } else {
                notFound(res);
            }
        });
    // create a new moose
    } else if (req.method === 'POST') {
        if (!/[A-z0-9 -_]+/.test(params.name) || params.name.length > 48) {
            return error(res, new Error('invalid moose name'));
        }

        jsonBody(req, function (err, body) {
            if (err) {
                return error(res, err);
            }

            if (!validateMoose(body)) {
                error(res, new Error('malformed moose (wrong colours/size)'));
                return;
            }

            db.findOne({ name: params.name }, function (err, moose) {
                if (err) {
                    return error(res, err);
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
        res.statusCode = 405;
        res.end('{"error":"invalid method"}');
    }
});

// additional to the /index.html handled by st
router.addRoute('/', function (req, res) {
    res.end(indexHtml);
});

router.addRoute('/edit/:moose', function (req, res) {
    res.end(indexHtml);
});

server = http.createServer(function (req, res) {
    var match = router.match(req.url);

    if (match) {
        match.fn(req, res, match.params);
    } else {
        mount(req, res, notFound.bind(null, res));
    }
});

server.listen(config.port, function () {
    console.log('listening on ' + server.address().port);
});
