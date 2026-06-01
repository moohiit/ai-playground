module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Required by react-native-reanimated v4 (SDK 54). Must be listed last.
    plugins: ["react-native-worklets/plugin"],
  };
};
