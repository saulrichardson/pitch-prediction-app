// Preserve official SVG artwork in the bundle instead of emitting image URLs.
module.exports = function svgText(source) {
  return `export default ${JSON.stringify(source)};`;
};
