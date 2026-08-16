/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "widget",
  name: "session-widget",
  bundleIdentifier: ".session-widget",
  deploymentTarget: "17.0",
  icon: 'https://github.com/expo.png',
  entitlements: {
    "com.apple.security.application-groups": [
      "group.com.pmarconato.forcaapp.shared"
    ]
  },
});