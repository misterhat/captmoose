const nedb = require('nedb'),
      mysql  = require('mysql'),
      compress = require('./compress'),
      config = require('./config');

let sqlConnection = mysql.createConnection(config.sql),
    nedbConnection = new nedb(config.nedb);

sqlConnection.connect();
nedbConnection.ensureIndex({ fieldName: 'name' });

nedbConnection.find({}).sort({ added : 1 }).exec((error, meese) => {
    if (error) {
        throw error; 
    }

    meese.forEach(moose => { 
        let data = {
            name: moose.name,
            image: JSON.stringify(compress.compress(moose.moose)),
            created: moose.added
        };

        sqlConnection.query('INSERT INTO meese SET ?', data)
            .on('error', error => { throw error; });
    });

    sqlConnection.end(error => console.log('done'));
});

