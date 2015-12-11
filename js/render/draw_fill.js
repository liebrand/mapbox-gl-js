'use strict';

var browser = require('../util/browser');
var assert = require('assert');

module.exports = drawFill;

function drawFill(painter, source, layer, coords) {
    for (var i = 0; i < coords.length; i++) {
        drawFillTile(painter, source, layer, coords[i]);
    }
}

function drawFillTile(painter, source, layer, coord) {
    var tile = source.getTile(coord);

    // No data
    if (!tile.buffers) return;
    if (!tile.elementGroups[layer.ref || layer.id]) return;
    var elementGroups = tile.elementGroups[layer.ref || layer.id].fill;
    var posMatrix = painter.calculateMatrix(coord, source.maxzoom);

    var color = layer.paint['fill-color'];
    var image = layer.paint['fill-pattern'];
    var opacity = layer.paint['fill-opacity'] || 1;

    var drawFillThisPass = image ?
        !painter.opaquePass :
        painter.opaquePass === (color[3] === 1);

    var gl = painter.gl;
    var translatedPosMatrix = painter.translateMatrix(posMatrix, tile, layer.paint['fill-translate'], layer.paint['fill-translate-anchor']);

    var vertex, elements, group, count;

    if (drawFillThisPass) {
        // Draw the stencil mask.
        painter.setSublayer(1);

        // We're only drawing to the first seven bits (== support a maximum of
        // 8 overlapping polygons in one place before we get rendering errors).
        gl.stencilMask(0x07);
        gl.clear(gl.STENCIL_BUFFER_BIT);

        // Draw front facing triangles. Wherever the 0x80 bit is 1, we are
        // increasing the lower 7 bits by one if the triangle is a front-facing
        // triangle. This means that all visible polygons should be in CCW
        // orientation, while all holes (see below) are in CW orientation.
        painter.setClippingMask(coord);

        // When we do a nonzero fill, we count the number of times a pixel is
        // covered by a counterclockwise polygon, and subtract the number of
        // times it is "uncovered" by a clockwise polygon.
        gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
        gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);

        // When drawing a shape, we first draw all shapes to the stencil buffer
        // and incrementing all areas where polygons are
        gl.colorMask(false, false, false, false);
        painter.depthMask(false);

        // Draw the actual triangle fan into the stencil buffer.
        gl.switchShader(painter.fillShader);
        gl.uniformMatrix4fv(painter.fillShader.u_matrix, false, translatedPosMatrix);

        // Draw all buffers
        vertex = tile.buffers.fillVertex;
        vertex.bind(gl);

        elements = tile.buffers.fillElement;
        elements.bind(gl);

        var offset, elementOffset;

        for (var i = 0; i < elementGroups.groups.length; i++) {
            group = elementGroups.groups[i];
            offset = group.vertexStartIndex * vertex.itemSize;
            vertex.setAttribPointers(gl, painter.fillShader, offset);

            count = group.elementLength * 3;
            elementOffset = group.elementStartIndex * elements.itemSize;
            gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, elementOffset);
        }

        // Now that we have the stencil mask in the stencil buffer, we can start
        // writing to the color buffer.
        gl.colorMask(true, true, true, true);
        painter.depthMask(true);

        // From now on, we don't want to update the stencil buffer anymore.
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.stencilMask(0x0);
        var shader;

        if (image) {
            // Draw texture fill
            var imagePosA = painter.spriteAtlas.getPosition(image.from, true);
            var imagePosB = painter.spriteAtlas.getPosition(image.to, true);
            if (!imagePosA || !imagePosB) return;

            shader = painter.patternShader;
            gl.switchShader(shader);
            gl.uniformMatrix4fv(shader.u_matrix, false, posMatrix);
            gl.uniform1i(shader.u_image, 0);
            gl.uniform2fv(shader.u_pattern_tl_a, imagePosA.tl);
            gl.uniform2fv(shader.u_pattern_br_a, imagePosA.br);
            gl.uniform2fv(shader.u_pattern_tl_b, imagePosB.tl);
            gl.uniform2fv(shader.u_pattern_br_b, imagePosB.br);
            gl.uniform1f(shader.u_opacity, opacity);
            gl.uniform1f(shader.u_mix, image.t);

            var factor = (4096 / tile.tileSize) / Math.pow(2, painter.transform.tileZoom - tile.coord.z);

            gl.uniform2fv(shader.u_patternscale_a, [
                1 / (imagePosA.size[0] * factor * image.fromScale),
                1 / (imagePosA.size[1] * factor * image.fromScale)
            ]);

            gl.uniform2fv(shader.u_patternscale_b, [
                1 / (imagePosB.size[0] * factor * image.toScale),
                1 / (imagePosB.size[1] * factor * image.toScale)
            ]);

            painter.spriteAtlas.bind(gl, true);

        } else {
            // Draw filling rectangle.
            shader = painter.fillShader;
            gl.switchShader(shader);
            gl.uniformMatrix4fv(shader.u_matrix, false, posMatrix);
            gl.uniform4fv(shader.u_color, color);
        }

        // Only draw regions that we marked
        gl.stencilFunc(gl.NOTEQUAL, 0x0, 0x07);
        gl.bindBuffer(gl.ARRAY_BUFFER, painter.tileExtentBuffer);
        gl.vertexAttribPointer(shader.a_pos, painter.tileExtentBuffer.itemSize, gl.SHORT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, painter.tileExtentBuffer.itemCount);

        gl.stencilMask(0x00);
        painter.setClippingMask(coord);
    }

    var strokeColor = layer.paint['fill-outline-color'];

    // Because we're drawing top-to-bottom, and we update the stencil mask
    // below, we have to draw the outline first (!)
    if (!painter.opaquePass && layer.paint['fill-antialias'] === true && !(layer.paint['fill-pattern'] && !strokeColor)) {
        gl.switchShader(painter.outlineShader);
        gl.uniformMatrix4fv(painter.outlineShader.u_matrix, false, translatedPosMatrix);
        gl.lineWidth(2 * browser.devicePixelRatio * 10);

        if (strokeColor) {
            // If we defined a different color for the fill outline, we are
            // going to ignore the bits in 0x07 and just care about the global
            // clipping mask.
            painter.setSublayer(2);

        } else {
            // Otherwise, we only want to draw the antialiased parts that are
            // *outside* the current shape. This is important in case the fill
            // or stroke color is translucent. If we wouldn't clip to outside
            // the current shape, some pixels from the outline stroke overlapped
            // the (non-antialiased) fill.
            painter.setSublayer(0);
        }

        gl.uniform2f(painter.outlineShader.u_world, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform4fv(painter.outlineShader.u_color, strokeColor ? strokeColor : color);

        // Draw all buffers
        vertex = tile.buffers.fillVertex;
        elements = tile.buffers.fillSecondElement;
        vertex.bind(gl);
        elements.bind(gl);

        painter.setClippingMask(coord);

        for (var k = 0; k < elementGroups.groups.length; k++) {
            group = elementGroups.groups[k];
            offset = group.vertexStartIndex * vertex.itemSize;
            vertex.setAttribPointers(gl, painter.outlineShader, offset);

            count = group.secondElementLength * 2;
            elementOffset = group.secondElementStartIndex * elements.itemSize;
            gl.drawElements(gl.LINES, count, gl.UNSIGNED_SHORT, elementOffset);
        }
    }
}
