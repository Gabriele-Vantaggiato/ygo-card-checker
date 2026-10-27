module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    plugins: [require('karma-jasmine'), require('karma-chrome-launcher')],
    client: { jasmine: { timeoutInterval: 600000 } },
    reporters: ['progress'],
    browsers: ['ChromeHeadless'],
    browserNoActivityTimeout: 600000,
    browserDisconnectTimeout: 600000,
    captureTimeout: 600000,
    restartOnFileChange: false,
  });
};
