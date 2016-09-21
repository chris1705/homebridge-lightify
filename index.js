var lightify = require('node-lightify'),
           _ = require('underscore');

var Service, Characteristic;

module.exports = function(homebridge) {

  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform("homebridge-lightify", "Lightify", LightifyPlatform);
}


class LightifyPlatform {

 constructor(log, config, api) {
   this.log = log;
   this.config = config;
   this.host = config['host']
   this.api = api;
 }

 accessories(callback) {
   let self = this;
   lightify.start(host).then(function(data){
       return lightify.discovery();
   }).then(function(response) {
       let list = _.map(response.result, (device) => {
         // We will only add lights
         if(lightify.isLight(device['type'])) {
           return new LightifyAccessory(self.log, self.config, lightify, device, api);
         }
       });
       callback(list);
   });
 }
}

class LightifyAccessory {

  constructor(log, config, lightify, device) {
    this.log = log;
    this.config = config;
    this.id = device['id'];
    this.name = device['name'];
    this.fw_version = device['firmware_version'];
    this.device = device;
    this.lightify = lightify;
    this.api = api;
    let self = this;
    this.api.registerPlatformAccessories("homebridge-lightify", "LightifyPlatform", self.getServices());
  }

  setOn(state, callback) {
    let self = this;
    self.lightify.node_on_off(self.device['mac'], state);
    if(callback) {
      callback();
    }
  }

  setOff(callback) {
    let self = this;
    this.lightify.discovery().then((response) => {
      let info = _.findWhere(response.result, {"id": self.id});
      callback(status == 1);
    });
  }

  getServices() {
    let self = this;
    let informationService = new Service.AccessoryInformation();
    let lightbulbService = new Service.Lightbulb(this.name);

	  informationService.setCharacteristic(Characteristic.Manufacturer, "OSRAM Licht AG")
                  		.setCharacteristic(Characteristic.Model, "Lightify")
                  		.addCharacteristic(Characteristic.FirmwareRevision, this.fw_version);

    lightbulbService.getCharacteristic(Characteristic.On)
                    .on('get', self.getOn)
                    .on('set', self.setOn)

    return [informationService, lightbulbService];
  }

}
