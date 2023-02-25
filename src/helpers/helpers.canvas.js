import {addRoundedRectPath, isArray, isNumber, toFont, toTRBLCorners, toRadians} from 'chart.js/helpers';
import {clampAll, clamp} from './helpers.core';
import {calculateTextAlignment, getSize} from './helpers.options';

const widthCache = new Map();
const fontsKey = (fonts) => fonts.reduce(function(prev, item) {
  prev += item.string;
  return prev;
}, '');

/**
 * @typedef { import('chart.js').Point } Point
 * @typedef { import('../../types/label').CoreLabelOptions } CoreLabelOptions
 */

/**
 * Determine if content is an image or a canvas.
 * @param {*} content
 * @returns boolean|undefined
 * @todo move this function to chart.js helpers
 */
export function isImageOrCanvas(content) {
  if (content && typeof content === 'object') {
    const type = content.toString();
    return (type === '[object HTMLImageElement]' || type === '[object HTMLCanvasElement]');
  }
}

/**
 * Set the translation on the canvas if the rotation must be applied.
 * @param {CanvasRenderingContext2D} ctx - chart canvas context
 * @param {Point} point - the point of translation
 * @param {number} rotation - rotation (in degrees) to apply
 */
export function translate(ctx, {x, y}, rotation) {
  if (rotation) {
    ctx.translate(x, y);
    ctx.rotate(toRadians(rotation));
    ctx.translate(-x, -y);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} options
 * @returns {boolean|undefined}
 */
export function setBorderStyle(ctx, options) {
  if (options && options.borderWidth) {
    ctx.lineCap = options.borderCapStyle;
    ctx.setLineDash(options.borderDash);
    ctx.lineDashOffset = options.borderDashOffset;
    ctx.lineJoin = options.borderJoinStyle;
    ctx.lineWidth = options.borderWidth;
    ctx.strokeStyle = options.borderColor;
    return true;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} options
 */
export function setShadowStyle(ctx, options) {
  ctx.shadowColor = options.backgroundShadowColor;
  ctx.shadowBlur = options.shadowBlur;
  ctx.shadowOffsetX = options.shadowOffsetX;
  ctx.shadowOffsetY = options.shadowOffsetY;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CoreLabelOptions} options
 * @returns {{width: number, height: number}}
 */
export function measureLabelSize(ctx, options) {
  const content = options.content;
  if (isImageOrCanvas(content)) {
    return {
      width: getSize(content.width, options.width),
      height: getSize(content.height, options.height)
    };
  }
  const optFont = options.font;
  const fonts = isArray(optFont) ? optFont.map(f => toFont(f)) : [toFont(optFont)];
  const strokeWidth = options.textStrokeWidth;
  const lines = isArray(content) ? content : [content];
  const mapKey = lines.join() + fontsKey(fonts) + strokeWidth + (ctx._measureText ? '-spriting' : '');
  if (!widthCache.has(mapKey)) {
    widthCache.set(mapKey, calculateLabelSize(ctx, lines, fonts, strokeWidth));
  }
  return widthCache.get(mapKey);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {Object} options
 */
export function drawBox(ctx, rect, options) {
  const {x, y, width, height} = rect;
  ctx.save();
  setShadowStyle(ctx, options);
  const stroke = setBorderStyle(ctx, options);
  ctx.fillStyle = options.backgroundColor;
  ctx.beginPath();
  addRoundedRectPath(ctx, {
    x, y, w: width, h: height,
    radius: clampAll(toTRBLCorners(options.borderRadius), 0, Math.min(width, height) / 2)
  });
  ctx.closePath();
  ctx.fill();
  if (stroke) {
    ctx.shadowColor = options.borderShadowColor;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {CoreLabelOptions} options
 */
export function drawLabel(ctx, rect, options) {
  const content = options.content;
  if (isImageOrCanvas(content)) {
    ctx.save();
    ctx.globalAlpha = getOpacity(options.opacity, content.style.opacity);
    ctx.drawImage(content, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
    return;
  }
  const labels = isArray(content) ? content : [content];
  const optFont = options.font;
  const fonts = isArray(optFont) ? optFont.map(f => toFont(f)) : [toFont(optFont)];
  const optColor = options.color;
  const colors = isArray(optColor) ? optColor : [optColor];
  const x = calculateTextAlignment(rect, options);
  const y = rect.y + options.textStrokeWidth / 2;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = options.textAlign;
  if (setTextStrokeStyle(ctx, options)) {
    applyLabelDecoration(ctx, {x, y}, labels, fonts);
  }
  applyLabelContent(ctx, {x, y}, labels, {fonts, colors});
  ctx.restore();
}

function setTextStrokeStyle(ctx, options) {
  if (options.textStrokeWidth > 0) {
    // https://stackoverflow.com/questions/13627111/drawing-text-with-an-outer-stroke-with-html5s-canvas
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = options.textStrokeWidth;
    ctx.strokeStyle = options.textStrokeColor;
    return true;
  }
}

function calculateLabelSize(ctx, lines, fonts, strokeWidth) {
  ctx.save();
  const count = lines.length;
  let width = 0;
  let height = strokeWidth;
  for (let i = 0; i < count; i++) {
    const font = fonts[Math.min(i, fonts.length - 1)];
    ctx.font = font.string;
    const text = lines[i];
    width = Math.max(width, ctx.measureText(text).width + strokeWidth);
    height += font.lineHeight;
  }
  ctx.restore();
  return {width, height};
}

function applyLabelDecoration(ctx, {x, y}, labels, fonts) {
  ctx.beginPath();
  let lhs = 0;
  labels.forEach(function(l, i) {
    const f = fonts[Math.min(i, fonts.length - 1)];
    const lh = f.lineHeight;
    ctx.font = f.string;
    ctx.strokeText(l, x, y + lh / 2 + lhs);
    lhs += lh;
  });
  ctx.stroke();
}

function applyLabelContent(ctx, {x, y}, labels, {fonts, colors}) {
  let lhs = 0;
  labels.forEach(function(l, i) {
    const c = colors[Math.min(i, colors.length - 1)];
    const f = fonts[Math.min(i, fonts.length - 1)];
    const lh = f.lineHeight;
    ctx.beginPath();
    ctx.font = f.string;
    ctx.fillStyle = c;
    ctx.fillText(l, x, y + lh / 2 + lhs);
    lhs += lh;
    ctx.fill();
  });
}

function getOpacity(value, elementValue) {
  const opacity = isNumber(value) ? value : elementValue;
  return isNumber(opacity) ? clamp(opacity, 0, 1) : 1;
}
