var hg = require('mercury');

function handleDrag(ev, broadcast) {
    var delegator = hg.Delegator(),
        target = ev.target,
        rect = target.getBoundingClientRect();

    function onmove(ev) {
        broadcast({
            x: Math.floor(ev.clientX - rect.left),
            y: Math.floor(ev.clientY - rect.top)
        });
    }

    function onup() {
        delegator.unlistenTo('mousemove');
        delegator.removeEventListener(target, 'mousemove', onmove);
        delegator.removeGlobalEventListener('mouseup', onup);
    }

    if (ev.button !== 0) {
        return;
    }

    delegator.listenTo('mousemove');
    delegator.addEventListener(target, 'mousemove', onmove);
    delegator.addGlobalEventListener('mouseup', onup);

    broadcast({
        x: Math.floor(ev.clientX - rect.left),
        y: Math.floor(ev.clientY - rect.top)
    });
}

module.exports = hg.BaseEvent(handleDrag);
