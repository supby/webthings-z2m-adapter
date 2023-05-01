import { Expos } from '../adapter';
import { Zigbee2MqttDevice } from '../device';
import mqtt from 'mqtt';
import { Zigbee2MqttProperty } from './genericProperty';

export class LeakProperty extends Zigbee2MqttProperty<"boolean"> {
  constructor(
    device: Zigbee2MqttDevice,
    name: string,
    expose: Expos,
    client: mqtt.Client,
    deviceTopic: string
  ) {
    super(device, name, expose, client, deviceTopic, {
      '@type': 'LeakProperty',
      title: 'Leak',
      type: 'boolean',
    });

    device['@type'].push('LeakSensor');
  }

  update(value: boolean, update: Record<string, unknown>): void {
    super.update(!value, update);
  }
}