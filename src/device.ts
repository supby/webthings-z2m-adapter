import { Action, Device, Event } from 'gateway-addon';
import { PropertyValueType, Event as EventSchema } from 'gateway-addon/lib/schema';
import { Zigbee2MqttAdapter, DeviceDefinition, Expos } from './adapter';
import {
  Zigbee2MqttProperty,
  WRITE_BIT,
  parseType,
  parseUnit,  
} from './properties/genericProperty';
import mqtt from 'mqtt';
import { OnOffProperty } from './properties/onOffProperty';
import { BrightnessProperty } from './properties/brightnessProperty';
import { ColorTemperatureProperty } from './properties/colorTemperatureProperty';
import { ColorProperty } from './properties/colorProperty';
import { HeatingCoolingProperty } from './properties/heatingCoolingProperty';
import { ContactProperty } from './properties/contactProperty';
import { LeakProperty } from './properties/leakProperty';
import { Config } from './config';
import { staticConfig } from './staticConfig';

const IGNORED_PROPERTIES = [
  'linkquality',
  'local_temperature_calibration',
  'update',
  'update_available',
  'color_temp_startup',
  'voltage',
  'led_indication',
  'occupancy_timeout',
  'illuminance',
  'motion_sensitivity',
  'requested_brightness_percent',
  'requested_brightness_level',
  'action_side',
  'eurotronic_trv_mode',
  'eurotronic_valve_position',
];

export class Zigbee2MqttDevice extends Device {
  private deviceTopic: string;

  constructor(
    adapter: Zigbee2MqttAdapter,
    id: string,
    deviceDefinition: DeviceDefinition,
    private client: mqtt.Client,
    topicPrefix: string
  ) {
    super(adapter, id);
    this.deviceTopic = `${topicPrefix}/${deviceDefinition.friendly_name}`;

    this.detectDeviceProperties(deviceDefinition);

    console.log(`Subscribing to ${this.deviceTopic}`);

    client.subscribe(this.deviceTopic, (err) => {
      if (err) {
        console.error(`Could not subscribe to ${this.deviceTopic}: ${err}`);
      }
    });

    if (deviceDefinition.friendly_name) {
      this.setTitle(deviceDefinition.friendly_name);
    } else {
      this.setTitle(`Zigbee2MQTT (${id})`);
    }
  }

  protected detectDeviceProperties(deviceDefinition: DeviceDefinition): void {
    for (const expose of deviceDefinition?.definition?.exposes ?? []) {
      switch (expose.type ?? '') {
        case 'light':
          this.createLightProperties(expose);
          break;
        case 'switch':
          this.createSwitchProperties(expose);
          break;
        case 'fan':
          this.createFanProperties(expose);
          break;
        case 'cover':
          this.createCoverProperties(expose);
          break;
        case 'lock':
          this.createLockProperties(expose);
          break;
        case 'climate':
          this.createThermostatProperties(expose);
          break;
        default:
          if (expose.name === 'action') {
            this.createEvents(expose.values as string[]);
          } else {
            const isWriteOnly = (expose.access ?? 0) == WRITE_BIT;

            if (isWriteOnly) {
              this.createAction(expose);
            } else {
              this.createGenericProperty(expose);
            }
          }
          break;
      }
    }
  }
  createLockProperties(expose: Expos) {
    console.warn(`Method not implemented for expose: ${JSON.stringify(expose)}`);
  }
  createCoverProperties(expose: Expos) {
    console.warn(`Method not implemented for expose: ${JSON.stringify(expose)}`);
  }
  createFanProperties(expose: Expos) {
    console.warn(`Method not implemented for expose: ${JSON.stringify(expose)}`);
  }

  private createLightProperties(expose: Expos): void {
    if (expose.features) {
      ((this as unknown) as { '@type': string[] })['@type'].push('Light');

      // TODO: add properties: color_hs, min_brightness, level_config, color_temp_startup

      for (const feature of expose.features) {
        if (feature.name) {
          switch (feature.name) {            
            case 'state':
              {
                console.log(`[createLightProperties]: Creating property for ${feature.name}`);

                const property = new OnOffProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
            case 'brightness':
              {
                console.log(`[device->createLightProperties]: Creating property for ${feature.name}`);

                const property = new BrightnessProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
            case 'color_temp':
              {
                console.log(`[device->createLightProperties]: Creating property for ${feature.name}`);

                const property = new ColorTemperatureProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
            case 'color_xy':
              {
                console.log(`[device->createLightProperties]: Creating property for ${feature.name}`);

                const property = new ColorProperty(
                  this,
                  'color',
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
          }
        } else {
          console.log(`[device->createLightProperties]: Ignoring property without name: ${JSON.stringify(expose, null, 0)}`);
        }
      }
    } else {
      console.warn(`Expected features array in light expose: ${JSON.stringify(expose)}`);
    }
  }

  private createSwitchProperties(expose: Expos): void {
    if (!expose.features) {
      console.warn(`[device->createSwitchProperties]: Expected features array in switch expose: ${JSON.stringify(expose)}`);
      return
    }

    ((this as unknown) as { '@type': string[] })['@type'].push('OnOffSwitch');

    for (const feature of expose.features) {        
      if (feature.property == 'state' || 
          feature.property == 'state_left' || 
          feature.property == 'state_right' || 
          feature.property == 'state_bottom_left' || 
          feature.property == 'state_bottom_right') {

            console.log(`[device->createSwitchProperties]: Creating property for "${feature.property}"`);

            const property = new OnOffProperty(
              this,
              feature.property,
              feature,
              this.client,
              this.deviceTopic
            );

            this.addProperty(property);
          }
    }
  }

  private createThermostatProperties(expose: Expos): void {
    if (expose.features) {
      ((this as unknown) as { '@type': string[] })['@type'].push('Thermostat');

      for (const feature of expose.features) {
        if (feature.name) {
          switch (feature.name) {
            case 'system_mode': {
              console.log(`Creating property for ${feature.name}`);

              const property = new Zigbee2MqttProperty<"string">(
                this,
                feature.name,
                feature,
                this.client,
                this.deviceTopic,
                {
                  '@type': 'ThermostatModeProperty',
                  type: 'string',
                }
              );

              this.addProperty(property);
              break;
            }
            case 'running_state':
              {
                console.log(`Creating property for ${feature.name}`);

                const property = new HeatingCoolingProperty(
                  this,
                  feature.name,
                  feature,
                  this.client,
                  this.deviceTopic
                );

                this.addProperty(property);
              }
              break;
            default:
              this.createGenericProperty(feature);
              break;
          }
        } else {
          console.log(`Ignoring property without name: ${JSON.stringify(expose, null, 0)}`);
        }
      }
    } else {
      console.warn(`Expected features array in thermostat expose: ${JSON.stringify(expose)}`);
    }
  }

  private createEvents(values: string[]): void {
    if (Array.isArray(values)) {
      if (values.length > 0) {
        let isPushbutton = false;

        for (const value of values) {
          console.log(`Creating property for ${value}`);

          const additionalProperties: Record<string, unknown> = {};

          if (value.indexOf('single') > -1 || value === 'on' || value === 'toggle') {
            additionalProperties['@type'] = 'PressedEvent';
            isPushbutton = true;
          }

          if (value.indexOf('double') > -1) {
            additionalProperties['@type'] = 'DoublePressedEvent';
            isPushbutton = true;
          }

          if (value.indexOf('release') > -1) {
            additionalProperties['@type'] = 'LongPressedEvent';
            isPushbutton = true;
          }

          this.addEvent(value, {
            name: value,
            ...additionalProperties,
          });

          console.log({
            name: value,
            ...additionalProperties,
          });
        }

        if (isPushbutton) {
          const device = (this as unknown) as { '@type': string[] };
          device['@type'].push('PushButton');
        }
      } else {
        console.log(`Expected list of values but got ${JSON.stringify(values)}`);
      }
    } else {
      console.log(`Expected array but got ${typeof values}`);
    }
  }

  private createAction(expose: Expos): void {
    if (!expose.name) return

    console.log(`Creating action for ${expose.name}`);

    this.addAction(expose.name, {
      description: expose.description,
      input: {
        type: parseType(expose),
        unit: parseUnit(expose.unit),
        enum: expose.values,
        minimum: expose.value_min,
        maximum: expose.value_max,
      },
    });
  }

  private createGenericProperty<T extends PropertyValueType>(expose: Expos): void {
    if (!expose.name) return

    if (IGNORED_PROPERTIES.includes(expose.name)) return;

    console.log(`Creating property for ${expose.name}`);

    switch (expose.name) {
      case 'contact': {
          const property = new ContactProperty(
            this,
            expose.name,
            expose,
            this.client,
            this.deviceTopic);
          this.addProperty(property);
        }
        break;
        case 'water_leak': {
          const property = new LeakProperty(
            this,
            expose.name,
            expose,
            this.client,
            this.deviceTopic);
          this.addProperty(property);
        }
        break;
      default: {
          const property = new Zigbee2MqttProperty<T>(
            this,
            expose.name,
            expose,
            this.client,
            this.deviceTopic
          );
          this.addProperty(property);
        }
        break;
    }
  }

  update(update: Record<string, PropertyValueType>): void {
    if (typeof update !== 'object') {
      console.log(`Expected object but got ${typeof update}`);
    }

    for (const [key, value] of Object.entries(update)) {
      if (IGNORED_PROPERTIES.includes(key)) {
        continue;
      }

      if (key === 'action') {
        if (typeof value !== 'string') {
          console.log(`Expected event of type string but got ${typeof value}`);
          continue;
        }

        const exists = ((this as unknown) as { events: Map<string, EventSchema> }).events.has(
          value
        );

        if (!exists) {
          if (staticConfig.adapterDebugLogs) {
            console.log(`[device->update]: Event '${value}' does not exist on ${this.getTitle()} (${this.getId()})`);
          }
          continue;
        }

        const event = new Event(this, value as string);
        this.eventNotify(event);
      } else {
        const property = this.findProperty(key) as Zigbee2MqttProperty<PropertyValueType>;

        if (property) {
          property.update(value, update);
        } 
        else if (staticConfig.adapterDebugLogs) {
          console.log(`[device->update]: Property '${key}' does not exist on ${this.getTitle()} (${this.getId()})`);
        }
      }
    }
  }

  performAction(action: Action): Promise<void> {
    const { name, input } = action.asDict();

    action.start();

    return new Promise<void>((resolve, reject) => {
      const writeTopic = `${this.deviceTopic}/set`;
      const json = { [name]: input };

      if (staticConfig.adapterDebugLogs) {
        console.log(`[device->performAction]: Sending ${JSON.stringify(json)} to ${writeTopic}`);
      }

      this.client.publish(writeTopic, JSON.stringify(json), (error) => {
        action.finish();

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  fetchValues(): void {
    const { properties } = (this as unknown) as {
      properties: Map<string, Zigbee2MqttProperty<PropertyValueType>>;
    };

    const payload: Record<string, string> = {};

    for (const property of properties.values()) {
      if (property.isReadable()) {
        payload[property.getName()] = '';
      }
    }

    if (Object.keys(payload).length > 0) {
      const readTopic = `${this.deviceTopic}/get`;
      const readPayload = JSON.stringify(payload);

      // if (debug()) {
      //   console.log(`Sending ${readPayload} to ${readTopic}`);
      // }

      this.client.publish(readTopic, readPayload, (error) => {
        if (error) {
          console.warn(`Could not send ${readPayload} to ${readTopic}: ${console.error()}`);
        }
      });
    } 
    // else if (debug()) {
    //   console.log(`${this.getTitle()} has no readable properties`);
    // }
  }
}
