const { getDefaultConfig } = require("expo/metro-config")

const config = getDefaultConfig(__dirname)

config.transformer = {
    ...config.transformer,
    minifierConfig: {
        keep_classnames: true,
        keep_fnames: true,
        mangle: false,
        compress: false
    }
}

module.exports = config
