'use strict';

module.exports = BinPack;

/**
 * Simple Bin Packing
 * Uses the Shelf Best Height Fit algorithm from
 * http://clb.demon.fi/files/RectangleBinPack.pdf
 * @private
 */
function BinPack(width, height) {
    this.width = width;
    this.height = height;
    this.shelves = [];
    this.stats = {};
    this.count = function(h) {
        this.stats[h] = this.stats[h]++ || 1;
    };
}

BinPack.prototype.allocate = function(reqWidth, reqHeight) {
    var y = 0,
        best = { shelf: -1, waste: Infinity },
        shelf, waste;


    // find shelf
    for (var i = 0; i < this.shelves.length; i++) {
        shelf = this.shelves[i];
        y += shelf.height;

        // exactly the right height with width to spare, pack it..
        if (reqHeight === shelf.height && reqWidth <= shelf.free) {
            this.count(reqHeight);
            return shelf.alloc(reqWidth, reqHeight);
        }
        // not enough height or width, skip it..
        if (reqHeight > shelf.height || reqWidth > shelf.free) {
            continue;
        }
        // maybe enough height or width, minimize waste..
        if (reqHeight < shelf.height && reqWidth <= shelf.free) {
            waste = shelf.height - reqHeight;
            if (waste < best.waste) { best.shelf = i; }
        }
    }

    if (best.shelf !== -1) {
        shelf = this.shelves[best.shelf];
        this.count(reqHeight);
        return shelf.alloc(reqWidth, reqHeight);
    }

    // add shelf
    if (reqHeight <= (this.height - y) && reqWidth <= this.width) {
        shelf = new Shelf(y, this.width, reqHeight);
        this.shelves.push(shelf);
        this.count(reqHeight);
        return shelf.alloc(reqWidth, reqHeight);
    }

    // no more space
    return {x: -1, y: -1};


    // // Find the smallest free rect angle
    // var rect = { x: Infinity, y: Infinity, w: Infinity, h: Infinity };
    // var smallest = -1;
    // for (var i = 0; i < this.free.length; i++) {
    //     var ref = this.free[i];
    //     if (width <= ref.w && height <= ref.h && ref.y <= rect.y && ref.x <= rect.x) {
    //         rect = ref;
    //         smallest = i;
    //     }
    // }

    // if (smallest < 0) {
    //     // There's no space left for this char.
    //     return { x: -1, y: -1 };
    // }

    // this.free.splice(smallest, 1);

    // // Shorter/Longer Axis Split Rule (SAS)
    // // http://clb.demon.fi/files/RectangleBinPack.pdf p. 15
    // // Ignore the dimension of R and just split long the shorter dimension
    // // See Also: http://www.cs.princeton.edu/~chazelle/pubs/blbinpacking.pdf
    // if (rect.w < rect.h) {
    //     // split horizontally
    //     // +--+---+
    //     // |__|___|  <-- b1
    //     // +------+  <-- b2
    //     if (rect.w > width) this.free.push({ x: rect.x + width, y: rect.y, w: rect.w - width, h: height });
    //     if (rect.h > height) this.free.push({ x: rect.x, y: rect.y + height, w: rect.w, h: rect.h - height });
    // } else {
    //     // split vertically
    //     // +--+---+
    //     // |__|   | <-- b1
    //     // +--|---+ <-- b2
    //     if (rect.w > width) this.free.push({ x: rect.x + width, y: rect.y, w: rect.w - width, h: rect.h });
    //     if (rect.h > height) this.free.push({ x: rect.x, y: rect.y + height, w: width, h: rect.h - height });
    // }

    // return { x: rect.x, y: rect.y, w: width, h: height };
};

BinPack.prototype.release = function(rect) {
    // for (var i = 0; i < this.shelves.length; i++) {
    //     var free = this.free[i];

    //     if (free.y === rect.y && free.h === rect.h && free.x + free.w === rect.x) {
    //         free.w += rect.w;

    //     } else if (free.x === rect.x && free.w === rect.w && free.y + free.h === rect.y) {
    //         free.h += rect.h;

    //     } else if (rect.y === free.y && rect.h === free.h && rect.x + rect.w === free.x) {
    //         free.x = rect.x;
    //         free.w += rect.w;

    //     } else if (rect.x === free.x && rect.w === free.w && rect.y + rect.h === free.y) {
    //         free.y = rect.y;
    //         free.h += rect.h;

    //     } else continue;

    //     this.free.splice(i, 1);
    //     this.release(free);
    //     return;

    // }
    // this.free.push(rect);
};



BinPack.prototype.resize = function(reqWidth, reqHeight) {
    if (reqWidth < this.width || reqHeight < this.height) { return false; }
    this.height = reqHeight;
    this.width = reqWidth;
    for (var i = 0; i < this.shelves.length; i++) {
        this.shelves[i].resize(reqWidth);
    }
    return true;
};


function Shelf(y, width, height) {
    this.y = y;
    this.x = 0;
    this.width = this.free = width;
    this.height = height;
}

Shelf.prototype = {
    alloc: function(reqWidth, reqHeight) {
        if (reqWidth > this.free || reqHeight > this.height) {
            return {x: -1, y: -1};
        }
        var x = this.x;
        this.x += reqWidth;
        this.free -= reqWidth;
        return {x: x, y: this.y, w: reqWidth, h: reqHeight};
    },

    resize: function(reqWidth) {
        if (reqWidth < this.width) { return false; }
        this.free += (reqWidth - this.width);
        this.width = reqWidth;
        return true;
    }
};

