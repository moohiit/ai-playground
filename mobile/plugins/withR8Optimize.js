// Expo config plugin: let R8 optimize, not just shrink and obfuscate.
//
// The Android template's release build uses getDefaultProguardFile(
// "proguard-android.txt"), which contains `-dontoptimize`. With that file R8
// renames and removes code but never optimizes it, and Play Console keeps
// recommending "R8 optimization" even with minification on. The `-optimize`
// variant is the same rule set without that line. A `-dontoptimize` anywhere
// wins, so this cannot be undone from extraProguardRules; the file name in
// build.gradle has to change.
const { withAppBuildGradle } = require("expo/config-plugins");

const DEFAULT = /getDefaultProguardFile\((['"])proguard-android\.txt\1\)/g;

module.exports = function withR8Optimize(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error("withR8Optimize: expected a Groovy build.gradle");
    }
    const before = cfg.modResults.contents;
    const after = before.replace(DEFAULT, 'getDefaultProguardFile("proguard-android-optimize.txt")');
    if (after === before && !before.includes("proguard-android-optimize.txt")) {
      throw new Error(
        "withR8Optimize: getDefaultProguardFile(\"proguard-android.txt\") not found in app/build.gradle — the template changed; update the plugin"
      );
    }
    cfg.modResults.contents = after;
    return cfg;
  });
};
