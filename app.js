var fs = require('fs'),
    http = require('http'),

    Datastore = require('nedb'),
    jsonBody = require('body/json'),
    routes = require('routes'),
    st = require('st'),
    q_escape = require('escape-regex-string');

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

router.addRoute('/list', function(req, res) {
    res.setHeader('Content-Type', 'text/html');
    db.find({}).sort({ added: 1 }).exec(function (err, meese) {
        if (err) {
            res.end('error loading meese :(');
        } else {
            res.write('<!doctype html><html lang="">');
            res.write('<head><title>moose list</title></head>');
            res.write('<body>');
            for (var i = 0; i < meese.length; i += 1) {
                res.write('<a href="http://sysdevs.org:1337/edit/' + meese[i].name + '">'+meese[i].name+'</a><br>');
            }
            res.write('</body></html>');
            res.end();
        }
    });
});

// additional to the /index.html handled by st
router.addRoute('/', function (req, res) {
    res.end(indexHtml);
});

router.addRoute('/edit/:moose', function (req, res) {
    res.end(indexHtml);
});

router.addRoute('/gallery', function(req, res) {
    res.statusCode = 301;
    res.setHeader('Location', '/gallery/1');
    res.end();
});

router.addRoute('/gallery/:pagenum', function(req, res, params) {
    res.setHeader('Content-Type', 'text/html');

    db.count({}, function (err, count) {
        if (err) {
            return error(res, err);
        }

        var search_param = {};
        var search_q = params.pagenum.split('?')[1] || '';
        search_q = decodeURI(search_q.split('=')[1] || '').replace('+', ' ');
        if (search_q != '') {
            search_param.name = RegExp(q_escape(search_q));
        }
        var mooseperpage = 10;
        var totalmeeselength=count;
        var pagenum = +params.pagenum.split('?')[0];
        var firstmoose = pagenum * mooseperpage - mooseperpage;

        db.find(search_param).sort({ added: 1 }).skip(firstmoose).limit(mooseperpage).exec(function (err, meese) {
            if (err) {
                res.end('error loading meese :(');
                return;
            }
            if (pagenum >= 1 && pagenum * mooseperpage - mooseperpage < totalmeeselength){
                var lastmoose = meese.length ;
                var moosematrix;
                var htmlcolor = '';
                res.write('<html><head lang="en"><meta charset="utf8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Moose Gallery - Page '+ pagenum+'</title><style>div {display: flex; flex-flow: row wrap; justify-content: space-between; }body { background-color: #343434; color: #fff; } table { border-spacing: 0px; padding: 10px 10px 10px 10px; } td { padding: 0px; border-spacing: 0px; }</style></head><body>');
                res.write(`
                    <form action="/gallery/1" method="get">
                        <input type="text" name="q">
                        <input type="submit" value="Search">
                    </form>
                `);
                if(pagenum - 1 > 0)
                    res.write(`
                        <input type="button" onclick="location.href='../gallery/${pagenum - 1}${(() => search_q != '' ? '?q='+search_q : '')()}';" value="Previous" />
                    `);
                if((pagenum + 1 ) * mooseperpage - mooseperpage < totalmeeselength)
                    res.write(`
                        <input type="button" onclick="location.href='../gallery/${pagenum + 1}${(() => search_q != '' ? '?q='+search_q : '')()}';" value="Next" />
                    `);
                res.write('\n<div>');
                for (var i = 0 ; i < lastmoose; i += 1) {
                    moosematrix=meese[i].moose;
                    res.write('\n<table><tr><td colspan="'+ moosematrix[0].length +'">'+meese[i].name + '</td></tr>');
                    for (var y = 0; y < moosematrix.length; y++){
                        res.write('\n<tr>');
                        for (var x = 0; x < moosematrix[y].length; x++){
                            htmlcolor = moosematrix[y][x];
                            res.write('\n<td style="background-color: '+htmlcolor+';">&nbsp;&nbsp;&nbsp;<td>');
                        }
                        res.write('\n</tr>');
                    }
                    res.write('\n</table>');
                }
                res.write('\n</div>');
                if(pagenum - 1 > 0)
                    res.write(`<br>
                        <input type="button" onclick="location.href='../gallery/${pagenum - 1}${(() => search_q != '' ? '?q='+search_q : '')()}';" value="Previous" />
                    `);
                if((pagenum + 1 )* mooseperpage - mooseperpage < totalmeeselength)
                    res.write(`
                        <input type="button" onclick="location.href='../gallery/${pagenum + 1}${(() => search_q != '' ? '?q='+search_q : '')()}';" value="Next" />
                    `);
                res.write('\n</body></html>');
                res.end();

            }
            else {
                res.write('\nInvalid page number.');
                res.end();
            }

        });
    });
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


