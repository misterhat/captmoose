var CanvasWidget = require('./lib/canvas'),
    dragEvent = require('./lib/drag'),
    h = require('mercury').h,
    hg = require('mercury'),
    xhr = require('xhr');

var def = require('../moose-def');

function createMoose() {
    var moose = hg.array([]),
        i, j;

    for (i = 0; i < def.height; i += 1) {
        moose.push(hg.array([]));
        for (j = 0; j < def.width; j += 1) {
            moose.get(i).push(hg.value('transparent'));
        }
    }

    return moose;
}

function saveMoose(state, form) {
    if (form.name.length < 3) {
        return state.message.set({
            type: 'bad',
            message: 'moose name too short.'
        });
    } else if (!/[A-z0-9 -_]+/.test(form.name)) {
        return state.message.set({
            type: 'bad',
            message: 'bad characters in moose name.'
        });
    }

    xhr.post('/moose/' + form.name, {
        json: state.moose()
    }, function (err, res, body) {
        if (err) {
            return state.message.set({ type: 'bad', message: err.toString() });
        }

        if (/^2/.test(res.statusCode)) {
            state.message.set({
                type: 'good',
                message: form.name + ' moose is now safe.'
            });
        } else if (res.statusCode === 409) {
            state.message.set({
                type: 'bad',
                message: form.name + ' moose is already safe.'
            });
        } else {
            state.message.set({
                type: 'bad',
                message: body.error || 'unknown issue.'
            });
        }
    });
}

function App() {
    var state = hg.state({
        moose: createMoose(),
        colour: hg.value('blue'),
        colours: hg.array(def.colours),
        grid: hg.value(true),
        message: hg.value({
            type: 'good', message: 'welcome to captain moose.'
        }),

        channels: {
            changeColour: function (state, data) {
                state.colour.set(data);
            },
            touchMoose: function (state, data) {
                var x = Math.floor(data.x / 16),
                    y = Math.floor(data.y / 24);

                state.moose.get(y).get(x).set(state.colour());
            },
            changeTool: function (state, tool) {
                var i, j;

                if (tool === 'clear') {
                    if (!confirm('are you sure you want to kill your moose?')) {
                        return;
                    }

                    for (i = 0; i < state.moose().length; i += 1) {
                        for (j = 0; j < state.moose.get(0)().length; j += 1) {
                            state.moose.get(i).get(j).set('transparent');
                        }
                    }
                } else if (tool === 'grid') {
                    state.grid.set(!state.grid());
                }
            },
            save: saveMoose
        }
    });

    return state;
}

// paint the moose to a canvas' context
function paintMoose(context, data) {
    var moose = data.moose,
        width = moose[0].length,
        height = moose.length,
        i, j;

    context.clearRect(0, 0, width * 16, height * 24);

    for (i = 0; i < height; i += 1) {
        for (j = 0; j < width; j += 1) {
            if (moose[i][j] !== 'transparent') {
                context.fillStyle = moose[i][j];
                context.fillRect(j * 16, i * 24, 16, 24);
            }
        }
    }

    if (data.grid) {
        context.fillStyle = '#000';

        for (i = 0; i < width; i += 1) {
            context.beginPath();
            context.moveTo((i * 16) - 0.5, 0);
            context.lineTo((i * 16) - 0.5, height * 24);
            context.stroke();
        }

        for (i = 0; i < height; i += 1) {
            context.beginPath();
            context.moveTo(0, (i * 24) - 0.5);
            context.lineTo(width * 16, (i * 24) - 0.5);
            context.stroke();
        }
    }
}

function renderCanvas(moose, grid, onDrag) {
    var width = moose[0].length,
        height = moose.length;

    return h('div.moose-canvas', {
        'ev-mousedown': dragEvent(onDrag),
        style: {
            width: width * 16 + 'px',
            height: height * 24 + 'px'
        }
    }, CanvasWidget(paintMoose, { moose: moose, grid: grid }, {
        title: 'pro-tip: right click > save image as to export your moose',
        width: width * 16,
        height: height * 24
    }));
}

function renderColours(colours, selected, onChange) {
    return h('ul.moose-horizontal-list',
        colours.map(function (colour) {
            var isSelected = '', isTransparent = '';

            if (colour === selected) {
                isSelected = '.moose-selected-colour';
            }

            if (colour === 'transparent') {
                isTransparent = 'url(./transparent.png)';
            }

            return h('li',
                h('button.moose-colour' + isSelected, {
                    'ev-click': hg.sendClick(onChange, colour),
                    style: {
                        'background-color': colour,
                        'background-image': isTransparent
                    },
                    title: colour
                }, '\u00a0')
            );
        })
    );
}

function renderHeader(message, onSubmit) {
    return h('header', {
        'ev-event': hg.sendSubmit(onSubmit)
    }, [
        h('div.moose-message.moose-' + message.type + '-message',
            h('p', message.message)),
        h('input.moose-input', {
            maxLength: 48,
            name: 'name',
            placeholder: 'name your moose',
            title: 'name your moose',
            type: 'text'
        }),
        h('button.moose-button', 'save')
    ]);
}

function renderTools(grid, onClick) {
    return h('ul.moose-horizontal-list', [
        h('li', h('button.moose-button', {
            'ev-click': hg.clickEvent(onClick, 'grid'),
            title: 'enable the grid view'
        }, grid ? h('strong', 'grid') : 'grid')),
        h('li', h('button.moose-button', {
            'ev-click': hg.clickEvent(onClick, 'pencil'),
            title: 'enable the pencil tool'
        }, h('strong', 'pencil'))),
        h('li', h('button.moose-button', {
            'ev-click': hg.clickEvent(onClick, 'bucket'),
            title: 'enable the bucket fill tool'
        }, 'bucket')),
        h('li', h('button.moose-bad-button.moose-button', {
            'ev-click': hg.clickEvent(onClick, 'clear'),
            title: 'kill your moose'
        }, 'clear'))
    ]);
}

function renderFooter() {
    return h('small', [
        'Copyright \u00a9 ' + new Date().getFullYear() + ' Mister Hat - ',
        h('a', { href: './COPYING' }, 'AGPLv3+')
    ]);
}

App.render = function (state) {
    return h('.moose-wrap', [
        hg.partial(renderHeader, state.message, state.channels.save),
        hg.partial(renderCanvas, state.moose, state.grid,
                   state.channels.touchMoose),
        hg.partial(renderColours, state.colours, state.colour,
                   state.channels.changeColour),
        hg.partial(renderTools, state.grid, state.channels.changeTool),
        hg.partial(renderFooter)
    ]);
};

hg.app(document.body, App(), App.render);
