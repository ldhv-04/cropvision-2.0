const { getDefaultConfig } = require('expo/metro-config');

// expo/metro-config already wires pnpm workspaces (watchFolders + node_modules lookup).
module.exports = getDefaultConfig(__dirname);
