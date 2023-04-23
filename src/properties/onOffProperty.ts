import { Expos } from "../adapter";
import { Zigbee2MqttDevice } from "../device";
import { Zigbee2MqttProperty, parseType } from "./genericProperty";
import mqtt from 'mqtt';

export class OnOffProperty extends Zigbee2MqttProperty<"boolean"> {
    constructor(
      device: Zigbee2MqttDevice,
      name: string,
      expose: Expos,
      client: mqtt.Client,
      deviceTopic: string
    ) {
      super(device, name, expose, client, deviceTopic, {
        '@type': 'OnOffProperty',
        title: 'On',
        type: parseType(expose),
      });
    }
  
    update(value: string, update: Record<string, unknown>): void {
      super.update(value === 'ON', update);
    }
  
    protected async sendValue(value: boolean): Promise<void> {
      return super.sendValue(value ? 'ON' : 'OFF');
    }
  }