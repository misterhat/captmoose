const config = require('./config');

function flatten(array) {
    return [].concat.apply([], array);
}

function chunk(array, n) {
    return Array.from(Array(Math.ceil(array.length/n)), (_,i)=>array.slice(i*n,i*n+n));
}

function compress(array) {
    return flatten(array).map(i => config.moose.colors.indexOf(i));
}

function decompress(array) {
    return chunk(array.map(i => config.moose.colors[i]), config.moose.width);
}

module.exports.compress   = compress;
module.exports.decompress = decompress;

