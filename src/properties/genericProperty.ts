import { Property } from 'gateway-addon';
import {
  PropertyValueType,
  Property as PropertySchema,
} from 'gateway-addon/lib/schema';
import { Expos } from '../adapter';
import { Zigbee2MqttDevice } from '../device';
import mqtt from 'mqtt';
import { staticConfig } from '../staticConfig';


export const WRITE_BIT = 0b010;
export const READ_BIT = 0b100;

export function parseType(expose: Expos): PropertyValueType {
  switch (expose.type) {
    case 'numeric':
      if (expose.value_step === 1) {
        return 'integer';
      } else {
        return 'number';
      }
    case 'enum':
      return 'string';
    case 'binary':
      return 'boolean';
  }

  return 'string';
}

export function parseUnit(unit?: string): string | undefined {
  switch (unit) {
    case '°C':
      return 'degree celsius';
  }

  return unit;
}

export function isWritable(access: number): boolean {
  return (access & WRITE_BIT) != 0;
}

export function isReadable(access: number): boolean {
  return (access & READ_BIT) != 0;
}

export class Zigbee2MqttProperty<T extends PropertyValueType> extends Property<T> {
  constructor(
    device: Zigbee2MqttDevice,
    name: string,
    protected expose: Expos,
    private client: mqtt.Client,
    private deviceTopic: string,
    additionalProperties?: PropertySchema
  ) {
    super(device, name, {
      title: name,
      description: expose.description,
      type: parseType(expose),
      unit: parseUnit(expose.unit),
      enum: expose.values,
      minimum: expose.value_min,
      maximum: expose.value_max,
      multipleOf: expose.value_step,
      readOnly: !isWritable(expose.access ?? 0),
      ...additionalProperties,
    });

    if (this.getUnit() == '%') {
      this.setAtType('LevelProperty');
    }

    switch (name) {
      case 'occupancy': {
        const device = (this.getDevice() as unknown) as { '@type': string[] };
        device['@type'].push('MotionSensor');
        this.setAtType('MotionProperty');
        break;
      }
      case 'power': {
        this.setAtType('InstantaneousPowerProperty');
        break;
      }
      case 'voltage': {
        this.setAtType('VoltageProperty');
        break;
      }
      case 'current': {
        this.setAtType('CurrentProperty');
        break;
      }
      case 'local_temperature': {
        this.setTitle('Current temperature');
        this.setAtType('TemperatureProperty');
        break;
      }
      case 'occupied_heating_setpoint': {
        this.setTitle('Target temperature');
        this.setAtType('TargetTemperatureProperty');
        break;
      }
      case 'system_mode': {
        this.setTitle('Mode');
        break;
      }
      case 'pi_heating_demand': {
        this.setTitle('Valve state');
        break;
      }
      case 'battery': {
        this.setTitle('Battery');
        break;
      }
      case 'temperature': {
        device['@type'].push('TemperatureSensor');
        this.setTitle('Temperature');
        this.setAtType('TemperatureProperty');
        break;
      }
      case 'humidity': {
        device['@type'].push('HumiditySensor');
        this.setTitle('Humidity');
        this.setAtType('HumidityProperty');
        break;
      }
      case 'pressure': {
        device['@type'].push('BarometricPressureSensor');
        this.setTitle('Barometric pressure');
        this.setAtType('BarometricPressureProperty');
        break;
      }
      case 'smoke': {
        device['@type'].push('SmokeSensor');
        this.setTitle('Smoke');
        this.setAtType('SmokeProperty');
        break;
      }
      case 'contact': {
        device['@type'].push('DoorSensor');
        this.setTitle('Open');
        this.setAtType('OpenProperty');
        break;
      }
    }
  }

  isReadable(): boolean {
    console.log(`${this.getName()} ${this.expose.access} ${isReadable(this.expose.access ?? 0)}`);
    return isReadable(this.expose.access ?? 0);
  }

  update(value: unknown, _: Record<string, unknown>): void {
    this.setCachedValueAndNotify(value as T);
  }

  async setValue(value: T): Promise<T> {
    const newValue = await super.setValue(value);
    await this.sendValue(newValue);

    return Promise.resolve(newValue);
  }

  protected async sendValue(value: unknown): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const writeTopic = `${this.deviceTopic}/set`;
      const json = { [this.getName()]: value };

      if (staticConfig.adapterDebugLogs) {
        console.log(`[genericProperty->sendValue]: Sending ${JSON.stringify(json)} to ${writeTopic}`);
      }

      this.client.publish(writeTopic, JSON.stringify(json), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}