/* jshint esversion: 6 */

var lightify = require('node-lightify'),
    _        = require('underscore'),
    Promise  = require('promise'),
    colorconv = require('color-convert'),
    colortemp = require('color-temperature');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  Accessory      = homebridge.platformAccessory;
  Service        = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen        = homebridge.hap.uuid;
  homebridge.registerPlatform("homebridge-lightify", "Lightify", LightifyPlatform);
};

class LightifyPlatform {

  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.host = config.host;
    this.lightify = null;
    this.lastDiscovery = null;
    this.discoveryResult = [];
  }

  /**
   * Method fetches all available devices. It caches the result for a second so its safe
   * to request devices multiple times.
   */
  getDevices(flushP) {
    let self = this;
    return new Promise((resolve, reject) => {/* jshint unused: false */
      if (flushP || self.lastDiscovery === null || self.lastDiscovery + 1000 < new Date().getTime()) {
        self.lastDiscovery = new Date().getTime();
        self.getLightify().then((lightify) => {
          lightify.discovery().then((data) => {
            self.discoveryResult = data.result;
            resolve(self.discoveryResult);
          });
        });
      } else {
        resolve(self.discoveryResult);
      }
    });
  }

  /**
   * Returns a connected lightify instance (singleton)
   */
  getLightify() {
    return new Promise((resolve, reject) => {/* jshint unused: false */
      if (!this.lightify) {
        lightify.start(this.host).then((data) => {/* jshint unused: false */
          this.lightify = lightify;
          resolve(this.lightify);
        });
      } else {
        resolve(this.lightify);
      }
    });
  }

  accessories(callback) {
    let self = this;
    self.getDevices().then((devices) => {
      let accessories = _.map(devices, (device) => {
        device.name = device.name || `${device.id}`;
        if (lightify.isPlug(device.type)) {
          return new LightifyPlug(device.name, UUIDGen.generate(device.name), device, device.mac, self.getLightify(), self);
        } else if (lightify.isLight(device.type)) {
          return new LightifyLamp(device.name, UUIDGen.generate(device.name), device, device.mac, self.getLightify(), self);
        } else {
          self.log.warn('unknown Lightify device type: ' + device.type);
        }
      });
      callback(accessories);
    });
  }
}


class LightifyPlug {

  constructor(name, uuid, props, mac, lightify, platform) {
    this.name = name;
    this.uuid = uuid;
    this.lightify = lightify;
    this.props = props;
    this.mac = mac;
    this.platform = platform;
  }

  flush(callback) {
    var self = this;
    setTimeout(() => {
      self.platform.getDevices(true).then((data) => {
        let device = _.findWhere(data, {
          "mac": self.mac
        });
        if (callback) return callback(device);  // child handles everything
        self.update.bind(self)(device);
        self.refresh.bind(self)();
      });
    }, 250);
  }

  update(properties) {
    if (properties) _.extend(this.props, properties);
  }

  refresh() {
    var lightService = new Service.Lightbulb(this.name);
    lightService.getCharacteristic(Characteristic.On).updateValue(this.props.status);
  }

  isOnline(callback) {
    let self = this;
    lightify.discovery().then((data) => {
      let device = _.findWhere(data, {
        "mac": self.mac
      });
      callback(null, device.online);
    });
  }

// would prefer to invoke the child's `refresh`, but this looks easiest...
  setState(value, callback) {
    this.props.status = value;
    lightify.node_on_off(this.mac, value);

    // not invoked by child
    if (callback) callback();
  }

  getState(callback) {
    let self = this;
    this.platform.getDevices().then((data) => {
      let device = _.findWhere(data, {
        "mac": self.mac
      });
      self.update.bind(self)(device);
      callback(null, device.online && device.status);
    });
  }

  getServices() {
    var outletService = new Service.Outlet(this.name);

    outletService.getCharacteristic(Characteristic.On)
                 .on('set', this.setState.bind(this))
                 .on('get', this.getState.bind(this));

    var service = new Service.AccessoryInformation();

    service.setCharacteristic(Characteristic.Name, this.name)
           .setCharacteristic(Characteristic.Manufacturer, "OSRAM Licht AG")
           .setCharacteristic(Characteristic.Model, "Lightify Switch");
    this.flush();
    return [service, outletService];
  }

}

class LightifyLamp extends LightifyPlug {

  constructor(name, uuid, props, mac, lightify, platform) {
    super(name, uuid, props, mac, lightify, platform);
  }

  flush(callback) {
    var self = this;
    super.flush((device) => {
      if (callback) return callback(device);  // (future) child handles everything
      self.update.bind(self)(device);
      self.refresh.bind(self)();
    });
  }

  update(properties) {
    var rgb;

    super.update(properties);
    if (lightify.isTemperatureSupported(this.props.type)) {
      if (lightify.isColorSupported(this.props.type)) {
        this.props.rgb = [ this.props.red, this.props.green, this.props.blue ];
      } else {
        rgb = colortemp.colorTemperature2rgb(this.props.temperature);
        this.props.rgb = [ rgb.red, rgb.green, rgb.blue ];
      }
      this.props.hsv = colorconv.rgb.hsv(this.props.rgb);
    }
  }

  refresh() {
    var lightService = new Service.Lightbulb(this.name);

    super.refresh();
    if (lightify.isBrightnessSupported(this.props.type)) {
      lightService.getCharacteristic(Characteristic.Brightness).updateValue(this.props.brightness);
    }
    if (lightify.isTemperatureSupported(this.props.type)) {
      lightService.getCharacteristic(Characteristic.Hue).updateValue(this.props.hsv[0]);
      lightService.getCharacteristic(Characteristic.Saturation).updateValue(this.props.hsv[1]);
    }
  }

  setState(value, callback) {
    super.setState(value);
    // not invoked by (future) child
    if (callback) {
      if (value) this.flush();
      callback();
    }
  }

  setBrightness(value, callback) {
    lightify.node_brightness(this.mac, value);
    if (lightify.isTemperatureSupported(this.props.type)) {
      this.flush();
    }
    callback();
  }

  getBrightness(callback) {
    var self = this;
    self.platform.getDevices().then((data) => {
      let device = _.findWhere(data, {
        "mac": self.mac
      });
      self.update.bind(self)(device);
      callback(null, this.props.brightness);
    });
  }

// courtesy of https://dsp.stackexchange.com/questions/8949/how-do-i-calculate-the-color-temperature-of-the-light-source-illuminating-an-ima#answer-8968
  setK() {
    var xyz = colorconv.hsv.xyz(this.props.newhsv);
    var X = xyz[0];
    var Y = xyz[1];
    var Z = xyz[2];
    var x = X / (X + Y + Z);
    var y = Y / (X + Y + Z);
    var n = (x - 0.3320) / (0.1858 - y);
    var CCT = Math.round((449 * Math.pow(n, 3)) + (3525 * Math.pow(n, 2)) + (6823.3 * n) + 5520.33);

    // it would be nice if zigbee bulbs would report the range, so we could adjust as needed...
    this.props.temperature = (CCT < 2700) ? 2700 : (5000 < CCT) ? 5000 : CCT;
    lightify.node_temperature(this.mac, this.props.temperature);
    this.flush();
  }

  setRGB() {
    var rgb = colorconv.hsv.rgb(this.props.newhsv);

    this.props.red = rgb[0];
    this.props.green = rgb[1];
    this.props.blue = rgb[2];
    lightify.node_color(this.mac, this.props.red, this.props.green, this.props.blue, 255);
    this.flush();
  }

  setHue(value, callback) {
    if (!this.props.newhsv) this.props.newhsv = _.clone(this.props.hsv || [ 0, 0, 100 ]);
    this.props.newhsv[0] = value;

    if (lightify.isTemperatureSupported(this.props.type)) {
      this.setColor();
    }
    callback();
  }

  getHue(callback) {
    var self = this;
    self.platform.getDevices().then((data) => {
      let device = _.findWhere(data, {
        "mac": self.mac
      });
      self.update.bind(self)(device);
      callback(null, self.props.hsv[0]);
    });
  }

  setSaturation(value, callback) {
    if (!this.props.newhsv) this.props.newhsv = _.clone(this.props.hsv || [ 0, 0, 100 ]);
    this.props.newhsv[1] = value;

    if (lightify.isTemperatureSupported(this.props.type)) {
      this.setColor();
    }
    callback();
  }

  getSaturation(callback) {
    var self = this;
    self.platform.getDevices().then((data) => {
      let device = _.findWhere(data, {
        "mac": self.mac
      });
      self.update.bind(self)(device);
      callback(null, self.props.hsv[1]);
    });
  }

  getServices() {
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, this.name)
           .setCharacteristic(Characteristic.Manufacturer, "OSRAM Licht AG")
           .setCharacteristic(Characteristic.Model, "Lightify Lamp");

    var lightService = new Service.Lightbulb(this.name);

    lightService.getCharacteristic(Characteristic.On)
                .on('set', this.setState.bind(this))
                .on('get', this.getState.bind(this));

    if (lightify.isBrightnessSupported(this.props.type)) {
      lightService.getCharacteristic(Characteristic.Brightness)
                  .on('set', this.setBrightness.bind(this))
                  .on('get', this.getBrightness.bind(this));
    }
    if (lightify.isTemperatureSupported(this.props.type)) {
      lightService.getCharacteristic(Characteristic.Hue)
                  .on('set', this.setHue.bind(this))
                  .on('get', this.getHue.bind(this));
      lightService.getCharacteristic(Characteristic.Saturation)
                  .on('set', this.setSaturation.bind(this))
                  .on('get', this.getSaturation.bind(this));
      if (lightify.isColorSupported(this.props.type)) {
        this.setColor = _.debounce(this.setRGB, 250);
      } else {
        this.setColor = _.debounce(this.setK, 250);
      }
    }
    this.flush();

    return [service, lightService];
  }
}
