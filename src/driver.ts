import { AddonManagerProxy } from 'gateway-addon';
import { Config } from './config';
import { Zigbee2MqttAdapter } from './adapter';

export class Zigbee2MqttDriver {
  constructor(addonManager: AddonManagerProxy, config: Config, packageName: string) {
    if (config.zigbee2mqttAdapters) {
      for (const zigbee2mqtt of config.zigbee2mqttAdapters) {
        const adapter = new Zigbee2MqttAdapter(addonManager, config, zigbee2mqtt, packageName);
        addonManager.addAdapter(adapter);
      }
    }
  }
}