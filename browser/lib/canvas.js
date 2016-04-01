function CanvasWidget(paint, data, attrs) {
    if (!(this instanceof CanvasWidget)) {
        return new CanvasWidget(paint, data, attrs);
    }

    this.paint = paint;
    this.data = data;
    this.attrs = attrs || {};
}

CanvasWidget.prototype.type = 'Widget';

CanvasWidget.prototype.init = function () {
    var attrs = this.attrs,
        elem = document.createElement('canvas');

    Object.keys(attrs).forEach(function (attr) {
        elem[attr] = attrs[attr];
    });

    this.update(null, elem);
    return elem;
};

CanvasWidget.prototype.update = function (prev, elem) {
    var context = elem.getContext('2d');
    this.paint(context, this.data);
};

module.exports = CanvasWidget;
