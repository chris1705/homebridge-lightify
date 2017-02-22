# homebridge-lightify

Plugin adding Osram Lightify support to homebridge. It uses the proprietary protocol to communicate with the [OSRAM Lightify Gateway](http://amzn.to/2d9tQiU), so it does not make use of the OSRAM Cloud REST API thing.

## Installation
1. Install plugin with `npm install -g homebridge-lightify`
2. Add platform within `config.json` of you homebridge instance:

    ```
    {
        "platform": "Lightify",
        "host": "192.168.1.3"
    }
    ```
3. Restart homebridge
4. Enjoy!

## Supported Devices
Currently all Lightify Lamps should be compatible (turn on/off, adjust brightness). I've tested it with the following devices:
* [OSRAM LIGHTIFY Classic A](http://amzn.to/2kKiUO4)
* [OSRAM LIGHTIFY Plug](http://amzn.to/2kjc813)
* [OSRAM LIGHTIFY Surface](http://amzn.to/2kj8K60)
