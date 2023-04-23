import { Expos } from "../adapter";
import { Zigbee2MqttDevice } from "../device";
import { Zigbee2MqttProperty, parseType } from "./genericProperty";
import mqtt from 'mqtt';

export class ColorTemperatureProperty extends Zigbee2MqttProperty<"number"> {
    constructor(
      device: Zigbee2MqttDevice,
      name: string,
      expose: Expos,
      client: mqtt.Client,
      deviceTopic: string
    ) {
      super(device, name, expose, client, deviceTopic, {
        '@type': 'ColorTemperatureProperty',
        title: 'Color temperature',
        type: 'number',
        minimum: miredToKelvin(expose.value_max!),
        maximum: miredToKelvin(expose.value_min!),
        unit: 'kelvin',
      });
    }
  
    update(value: number, update: Record<string, unknown>): void {
      super.update(miredToKelvin(value), update);
    }
  
    protected async sendValue(value: number): Promise<void> {
      return super.sendValue(kelvinToMiredd(value));
    }
}

function miredToKelvin(mired: number): number {
    return Math.round(1_000_000 / mired);
}

function kelvinToMiredd(kelvin: number): number {
    return Math.round(1_000_000 / kelvin);
}

