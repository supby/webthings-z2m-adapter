import { Expos } from "../adapter";
import { Zigbee2MqttDevice } from "../device";
import { Zigbee2MqttProperty, parseType } from "./genericProperty";
import mqtt from 'mqtt';

export class BrightnessProperty extends Zigbee2MqttProperty<"number"> {
    constructor(
      device: Zigbee2MqttDevice,
      name: string,
      expose: Expos,
      client: mqtt.Client,
      deviceTopic: string
    ) {
      super(device, name, expose, client, deviceTopic, {
        '@type': 'BrightnessProperty',
        title: 'Brightness',
        minimum: 0,
        maximum: 100,
        type: 'number',
        unit: 'percent',
      });
    }
  
    update(value: number, update: Record<string, unknown>): void {
      const percent = Math.round((value / (this.expose.value_max ?? 100)) * 100);
      super.update(percent, update);
    }
  
    protected async sendValue(value: number): Promise<void> {
      return super.sendValue(Math.round((value / 100) * (this.expose.value_max ?? 100)));
    }
}