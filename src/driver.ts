import { AddonManagerProxy } from 'gateway-addon';
import { Config } from './config';
import { Zigbee2MqttAdapter } from './zigbee2mqtt-adapter';

export class Zigbee2MqttDriver {
  constructor(addonManager: AddonManagerProxy, config: Config) {
    if (config.zigbee2mqtt?.zigbee2mqttAdapters) {
      for (const zigbee2mqtt of config.zigbee2mqtt?.zigbee2mqttAdapters) {
        const adapter = new Zigbee2MqttAdapter(addonManager, config, zigbee2mqtt);
        addonManager.addAdapter(adapter);
      }
    }
  }
}