var fs = require('fs'),
    http = require('http'),
    jsonBody = require('body/json'),
    routes = require('routes'),
    st = require('st'),
    q_escape = require('escape-regex-string'),
    mysql = require('mysql'),
    compress = require('./compress');

var config = require('./config'),
    pool = mysql.createPool(config.sql),
    mount = st({ path: __dirname + '/browser', url: '/', passthrough: true }),
    router = routes(),
    // cache index to avoid fs reads
    indexHtml = fs.readFileSync('./browser/index.html'),
    server;

// make sure the moose has no colours that aren't defined here
function validateMoose(moose) {
    var i, j;

    if (moose.length !== config.moose.height
            || moose[0].length !== config.moose.width) {
        return false;
    }

    for (i = 0; i < moose.length; i += 1) {
        for (j = 0; j < moose[0].length; j += 1) {
            // is the colour of the cell in our colour definition?
            if (config.moose.colors.indexOf(moose[i][j]) === -1) {
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

function sendMoose(res, row) {
    let image = compress.decompress(JSON.parse(row.image));
    res.end(JSON.stringify({
        name: row.name,
        moose: image,
        added: row.created
    }));
}

// find a random moose
router.addRoute('/moose/random', function (req, res) {
    pool.getConnection((err, connection) => {
        if (err) {
            return error(res, err);
        }
        connection.query('SELECT * FROM meese ORDER BY RAND() LIMIT 1')
            .on('result', row => sendMoose(res, row))
            .on('end', () => connection.release())
            .on('error', err => error(res, err));
    });
});

// used finding the latest moose in the gallery
router.addRoute('/moose/latest', function (req, res) {
    pool.getConnection((err, connection) => {
        if (err) {
            return err(res, err);
        }
        connection.query('SELECT * FROM meese ORDER BY id DESC LIMIT 10')
            .on('result', row => sendMoose(res, row))
            .on('end', () => { res.end(); connection.release(); })
            .on('error', err => error(res, err));
    });
});

router.addRoute('/moose/:name', function (req, res, params) {
    // find a specific moose by name
    if (req.method === 'GET') {
        pool.getConnection((err, connection) => {
            if (err) {
                return error(res, err);
            }
            connection.query('SELECT * FROM meese WHERE name = ?', [params.name])
                .on('result', row => sendMoose(res, row))
                .on('end', () => connection.release())
                .on('error', err => error(res, err));
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
                error(res, new Error('malformed moose (wrong colors/size)'));
                return;
            }

            pool.getConnection((err, connection) => {
                if (err) {
                    return error(res, err);
                }
                connection.query('SELECT COUNT(*) AS count FROM meese WHERE name = ?', [params.name])
                    .on('result', row => {
                        if (row.count != 0) {
                            res.statusCode = 409; // specifies existing moose
                            return res.end('{"error":"moose already exists"}');
                        }
                        let data = {
                            name: params.name,
                            image: JSON.stringify(compress.compress(body)),
                            created: Date.now()
                        };
                        connection.query('INSERT INTO meese SET ?', data)
                            .on('end', () => { res.end('{"success":"created new moose"}'); connection.release(); })
                            .on('error', err => error(res, err));
                    })
                    .on('error', err => error(res, err));
            });
        });
    } else {
        res.statusCode = 405;
        res.end('{"error":"invalid method"}');
    }
});

router.addRoute('/list', function(req, res) {
    res.setHeader('Content-Type', 'text/html');
    res.write('<!doctype html><html lang="en">');
    res.write('<head><title>moose list</title></head><body>');
    pool.getConnection((err, connection) => {
        if (err) {
            return res.end('Error connecting to MySQL</body></html>');
        }
        connection.query('SELECT * FROM meese ORDER BY id ASC')
            .on('result', row => {
                let url = '/edit/' + encodeURIComponent(row.name);
                res.write('<a href="' + url + '">' + row.name + '</a><br>');
            })
            .on('end', () => { res.end('</body></html>'); connection.release(); })
            .on('error', err => error(res, err));
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
    res.end('Gallery temporarily disabled :(!');
            /*
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
                res.write('<html><head lang="en"><meta charset="utf8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Moose Gallery - Page '+ pagenum+'</title><style>div { display: flex; flex-flow: row wrap; justify-content: space-between; } body { background-color: #343434; color: #fff; } table { width: 20.625em; border-spacing: 0em; padding: .625em .625em .625em .625em; } td { padding: 0em; border-spacing: 0em; } a { color: white; }</style></head><body>');
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
                    res.write('\n<table><tr><td colspan="'+ moosematrix[0].length +'">'+
                        `<a href="/edit/${encodeURIComponent(meese[i].name)}">${meese[i].name}</a>`+
                        '</td></tr>');
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
    });*/
});

server = http.createServer(function (req, res) {
    var match = router.match(req.url);

    if (match) {
        match.fn(req, res, match.params);
    } else {
        mount(req, res, notFound.bind(null, res));
    }
});

server.listen(config.app.port, function () {
    console.log('listening on ' + server.address().port);
});


