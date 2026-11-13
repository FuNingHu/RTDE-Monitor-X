// Merged into the Angular webpack config by ngx-build-plus (angular.json `extraWebpackConfig`).
const path = require('path');

module.exports = {
    module: {
        rules: [
            {
                // Runs before Angular's own processing, while the `styles` arrays are still plain strings.
                enforce: 'pre',
                test: /[\\/](@universal-robots[\\/]ui-angular-components|@ng-select[\\/]ng-select)[\\/]fesm2022[\\/].*\.mjs$/,
                use: [path.resolve(__dirname, 'vendor-pxtorem-loader.js')],
            },
        ],
    },
};
