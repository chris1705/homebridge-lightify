var lightify = require('node-lightify'),
  _ = require('underscore');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  homebridge.registerPlatform("homebridge-lightify", "Lightify",
    LightifyPlatform);
}

class LightifyPlatform {

  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.host = config["host"];
  }

  accessories(callback) {
    let self = this;
    lightify.start(this.host).then((data) => {
      return lightify.discovery();
    }).then((data) => {
      let accessories = _.map(data.result, (device) => {
        console.log(lightify);
        if (lightify.isPlug(device.type)) {
          return new LightifyPlug(device.name, UUIDGen.generate(
            device.name), device.mac, this.lightify);
        } 
        else {
          return new LightifyLamp(device.name, UUIDGen.generate(
            device.name), device.mac, this.lightify);
        }
      });
      callback(accessories);
    });
  }


}

class LightifyPlug {
  constructor(name, uuid, mac, lighitfy) {
    this.name = name;
    this.uuid = uuid;
    this.lightify = lightify;
    this.mac = mac;
  }

  setState(value, callback) {
    lightify.node_on_off(this.mac, value);
    callback();
  }

  getState(callback) {
    var self = this;
    lightify.discovery().then((data) => {
      let device = _.findWhere(data.result, {
        "mac": self.mac
      });
      callback(null, device.status === 1 || device.online === 1);
    });
  }

  getServices() {
    let self = this;
    var outletService = new Service.Outlet(this.name);

    outletService.getCharacteristic(Characteristic.On)
      .on('set', (a, b) => {
        self.setState(a, b);
      })
      .on('get', (a, b) => {
        self.getState(a, b);
      });

    outletService.getCharacteristic(Characteristic.OutletInUse)
      .on('get', (a, b) => {
        self.getState(a, b);
      });

    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, "OSRAM Licht AG")
      .setCharacteristic(Characteristic.Model, "Lightify Switch");
    return [service, outletService];
  }

}

class LightifyLamp extends LightifyPlug {

  constructor(name, uuid, mac, lighitfy) {
    super(name, uuid, mac, lighitfy)
  }

  setBrightness(value, callback) {
    lightify.node_brightness(this.mac, value);
    callback();
  }

  getBrightness(callback) {
    var self = this;
    lightify.discovery().then((data) => {
      let device = _.findWhere(data.result, {
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
      .on('set', (a, b) => {
        self.setState(a, b);
      })
      .on('get', (a, b) => {
        self.getState(a, b);
      });
    lightService.getCharacteristic(Characteristic.Brightness)
      .on('set', (a, b) => {
        self.setBrightness(a, b);
      })
      .on('get', (a, b) => {
        self.getBrightness(a, b);
      });

    return [service, lightService];
  }
}
