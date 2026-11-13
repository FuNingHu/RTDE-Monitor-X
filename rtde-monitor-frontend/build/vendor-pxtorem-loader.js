// Webpack loader: runs postcss-pxtorem over the precompiled component styles embedded in
// Angular packages (the `styles: ["..."]` arrays in their fesm2022 bundles), so the ur-*
// components scale with the PolyScope X zoom level.
// Not needed if your version of @universal-robots/ui-angular-components ships its component styles in rem.
const path = require('path');
const postcss = require('postcss');
const pxtorem = require('postcss-pxtorem');

// Same options as your own stylesheets (postcss.config.json).
const { plugins } = require(path.resolve(__dirname, '../postcss.config.json'));
const processor = postcss([pxtorem(plugins['postcss-pxtorem'])]);

// Angular partial-compilation output: `styles: ["css", "css"]` with double-quoted string literals.
const STYLES_ARRAY = /styles: \[((?:\s*"(?:[^"\\]|\\.)*",?)+)\s*\]/g;
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"/g;

function convert(literal) {
    try {
        const css = JSON.parse(literal);
        return JSON.stringify(processor.process(css, { from: undefined }).css);
    } catch {
        // Not a plain JSON-compatible string: leave that style unconverted rather than fail the build.
        return literal;
    }
}

module.exports = function vendorPxToRemLoader(source) {
    return source.replace(STYLES_ARRAY, (_, literals) => {
        const converted = literals.match(STRING_LITERAL).map(convert);
        return `styles: [${converted.join(', ')}]`;
    });
};
