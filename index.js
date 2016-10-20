var lightify = require('node-lightify'),
    _        = require('underscore'),
    Promise  = require('promise');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  Accessory      = homebridge.platformAccessory;
  Service        = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen        = homebridge.hap.uuid;
  homebridge.registerPlatform("homebridge-lightify", "Lightify", LightifyPlatform);
}

class LightifyPlatform {

  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.host = config["host"];
    this.lightify = null;
    this.lastDiscovery = null;
    this.discoveryResult = [];
  }

  /**
   * Method fetches all available devices. It caches the result for a second so its safe
   * to request devices multiple times.
   */
  getDevices() {
    let self = this;
    return new Promise((resolve, reject) => {
      if (self.lastDiscovery === null || self.lastDiscovery + 1000 < new Date()
        .getTime()) {
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
    return new Promise((resolve, reject) => {
      if (!this.lightify) {
        lightify.start(this.host).then((data) => {
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
        if (lightify.isPlug(device.type)) {
          return new LightifyPlug(device.name, UUIDGen.generate(device.name), device.mac, self.getLightify(), self);
        } else {
          return new LightifyLamp(device.name, UUIDGen.generate(device.name), device.mac, self.getLightify(), self);
        }
      });
      callback(accessories);
    });
  }
}


class LightifyPlug {

  constructor(name, uuid, mac, lighitfy, platform) {
    this.name = name;
    this.uuid = uuid;
    this.lightify = lightify;
    this.mac = mac;
    this.platform = platform;
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

  setState(value, callback) {
    lightify.node_on_off(this.mac, value);
    callback();
  }

  getState(callback) {
    let self = this;
    this.platform.getDevices().then((data) => {
      let device = _.findWhere(data, {
        "name": self.name
      });
      callback(null, device.online && device.status);
    });
  }

  getServices() {
    let self = this;
    var outletService = new Service.Outlet(this.name);

    outletService.getCharacteristic(Characteristic.On)
                 .on('set', this.setState.bind(this))
                 .on('get', this.getState.bind(this));

    var service = new Service.AccessoryInformation();

    service.setCharacteristic(Characteristic.Name, this.name)
           .setCharacteristic(Characteristic.Manufacturer, "OSRAM Licht AG")
           .setCharacteristic(Characteristic.Model, "Lightify Switch");
    return [service, outletService];
  }

}

class LightifyLamp extends LightifyPlug {

  constructor(name, uuid, mac, lighitfy, platform) {
    super(name, uuid, mac, lighitfy, platform)
  }

  setBrightness(value, callback) {
    lightify.node_brightness(this.mac, value);
    callback();
  }

  getBrightness(callback) {
    var self = this;
    self.platform.getDevices().then((data) => {
      let device = _.findWhere(data, {
        "mac": self.mac
      });
      callback(null, device.brightness);
    });
  }

  getServices() {
    let self = this;
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, this.name)
           .setCharacteristic(Characteristic.Manufacturer, "OSRAM Licht AG")
           .setCharacteristic(Characteristic.Model, "Lightify Lamp");

    var lightService = new Service.Lightbulb(this.name);

    lightService.getCharacteristic(Characteristic.On)
                .on('set', this.setState.bind(this))
                .on('get', this.getState.bind(this));

    lightService.getCharacteristic(Characteristic.Brightness)
                .on('set', this.setBrightness.bind(this))
                .on('get', this.getBrightness.bind(this))
    return [service, lightService];
  }
}
