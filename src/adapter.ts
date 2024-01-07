import { Adapter, AddonManagerProxy, Device } from 'gateway-addon';
import { Config, Zigbee2MQTTAdapter } from './config';
import mqtt, { OnConnectCallback } from 'mqtt';
import { Zigbee2MqttDevice } from './device';
import { staticConfig } from './staticConfig';

interface Response {
  data?: {
    id?: string;
    block?: boolean;
    force?: boolean;
    value: boolean;
  };
  status?: string;
  error?: string;
}

interface Log {
  level?: string;
  message?: string;
}

const DEVICES_POSTFIX = '/bridge/devices';
const PERMIT_REQUEST_POSTFIX = '/bridge/request/permit_join';
const PERMIT_RESPONSE_POSTFIX = '/bridge/response/permit_join';
const REMOVE_REQUEST_POSTFIX = '/bridge/request/device/remove';
const REMOVE_RESPONSE_POSTFIX = '/bridge/response/device/remove';
const LOGGING_POSTFIX = '/bridge/logging';

const DEFAULT_PORT = 1883;
const DEFAULT_TOPIC = 'zigbee2mqtt';

export class Zigbee2MqttAdapter extends Adapter {
  private prefix: string;
  private port: number;

  private client?: mqtt.Client;

  private deviceByFriendlyName: Record<string, Zigbee2MqttDevice> = {};

  constructor(
    addonManager: AddonManagerProxy,
    private config: Config,
    private adapterConfig: Zigbee2MQTTAdapter,
    packageName: string,
  ) {
    super(
        addonManager, 
        `z2m-adapter-${adapterConfig.host}:${adapterConfig.port ?? DEFAULT_PORT}:${adapterConfig.topicPrefix ?? DEFAULT_TOPIC}`,
        packageName);

    this.prefix = adapterConfig.topicPrefix ?? DEFAULT_TOPIC;
    this.port = this.adapterConfig.port || DEFAULT_PORT;

    this.connect();
  }

  onMqttConnect(broker: string): OnConnectCallback {
    return () => {
        console.log(`Successfully connected to ${broker}`);
  
        this.subscribe(`${this.prefix}${DEVICES_POSTFIX}`);
        this.subscribe(`${this.prefix}${PERMIT_RESPONSE_POSTFIX}`);
        this.subscribe(`${this.prefix}${REMOVE_RESPONSE_POSTFIX}`);
        if (this.config.zigbee2mqttDebugLogs) {
          this.subscribe(`${this.prefix}${LOGGING_POSTFIX}`);
        }
      }
  }

  onMqttError(error: Error) {
    console.error(`Could not connect to broker: ${error}`);
  }

  onMqttMessage(topic: string, message: Buffer) {
    const raw = message.toString();
    
    if (this.config.adapterDebugLogs) {
      console.log(`[adapter->onMqttMessage]: Received on ${topic}: ${raw}`);
    }

    try {
      const json = JSON.parse(raw);

      if (topic.endsWith(DEVICES_POSTFIX)) {
        this.handleDevices(json);
        return
      }

      if (topic.endsWith(PERMIT_RESPONSE_POSTFIX)) {
        this.handlePermitResponse(json);
        return
      }

      if (topic.endsWith(REMOVE_RESPONSE_POSTFIX)) {
        this.handleRemoveResponse(json);
        return
      }

      if (topic.indexOf(LOGGING_POSTFIX) > -1) {
        this.handleLogging(json);
        return
      }

      const parts = topic.split('/');
      if (parts.length < 2) { 
        return
      }

      const friendlyName = parts[1];
      const device = this.deviceByFriendlyName[friendlyName];

      if (device) {
        device.update(json);
      } else {
        console.log(`Could not find device with friendlyName ${friendlyName}`);
      }

      
    } catch (error) {
      console.error(`Could not process message ${raw}: ${error}`);
    }
  }

  private handleLogging(log: Log) {
    console.log(`Zigbee2Mqtt::${log.level}: ${log.message}`);
  }

  private handleRemoveResponse(response: Response) {
    const id = response.data?.id ?? 'unknown';
    if (response.error) {
      console.log(`Could not remove device ${id}: ${response.error}`);
    } else if (response.status === 'ok') {
      console.log(`Removed device ${id} successfully`);

      const existingDevice = this.getDevice(id);

      if (existingDevice) {
        this.handleDeviceRemoved(existingDevice);
      } else {
        console.warn(`Could not find device with id ${id}`);
      }
    }
  }

  private handlePermitResponse(response: Response) {
    if (response.error) {
      console.log(`Could not enable permit join mode: ${response.error}`);
    } else if (response.status === 'ok') {
      if (response.data?.value) {
        console.log('Bridge is now permitting new devices to join');
      } else {
        console.log('Bridge is no longer permitting new devices to join');
      }
    }
  }

  async connect(): Promise<void> {
    const broker = `mqtt://${this.adapterConfig.host}:${this.port}`;

    console.log(`Connecting to broker ${broker}`);

    const client = mqtt.connect(
      broker,
      {
        username: this.adapterConfig.username,
        password: this.adapterConfig.password,
      });
    this.client = client;

    client.on('connect', this.onMqttConnect(broker));
    client.on('error', (e) => this.onMqttError(e));
    client.on('message', (t, msg) => this.onMqttMessage(t, msg));
  }

  private subscribe(topic: string): void {
    console.log(`Subscribing to ${topic}`);

    if (!this.client) {
      console.log('No client to subscribe to');
      return;
    }

    this.client.subscribe(topic, (err) => {
      if (err) {
        console.error(`Could not subscribe to ${topic}: ${err}`);
      } else {
        console.log(`Successfully subscribed to ${topic}`);
      }
    });
  }

  private handleDevices(deviceDefinitions: DeviceDefinition[]): void {
    if (!Array.isArray(deviceDefinitions)) {
      console.log(`Expected list of devices but got ${typeof deviceDefinitions}`);
      return;
    }

    for (const deviceDefinition of deviceDefinitions) {
      this.handleDevice(deviceDefinition);
    }
  }

  private handleDevice(deviceDefinition: DeviceDefinition) {
    if (deviceDefinition.type != 'EndDevice' && deviceDefinition.type != 'Router') {
      console.log(`Ignoring device of type ${deviceDefinition.type}`);
      return
    }

    const id = deviceDefinition.ieee_address;
    if (!id) {
      console.log(`Ignoring device without id: ${JSON.stringify(deviceDefinition)}`);
      return
    }

    const existingDevice = this.getDevice(id);
    if (!existingDevice) {
      this.addNewDevice(id, deviceDefinition);
    }
  }

  private addNewDevice(id: string, deviceDefinition: DeviceDefinition) {
    const device = new Zigbee2MqttDevice(this, id, deviceDefinition, this.client, this.prefix);
    this.handleDeviceAdded(device);
    this.deviceByFriendlyName[deviceDefinition.friendly_name as string] = device;
    device.fetchValues();

    if (staticConfig.adapterDebugLogs)
      console.log(`[adapter->addNewDevice]: Device added, id: ${id}, definition: ${JSON.stringify(deviceDefinition)}`);
  }

  startPairing(timeoutSeconds: number): void {
    console.log(`Permit joining for ${timeoutSeconds} seconds`);
    const permitTopic = `${this.prefix}${PERMIT_REQUEST_POSTFIX}`;
    this.publish(permitTopic, JSON.stringify({ value: true, time: timeoutSeconds }));
  }

  cancelPairing(): void {
    console.log('Deny joining');
    const permitTopic = `${this.prefix}${PERMIT_REQUEST_POSTFIX}`;
    this.publish(permitTopic, JSON.stringify({ value: false }));
  }

  removeThing(device: Device): void {
    console.log(`Removing ${device.getTitle()} (${device.getId()})`);
    const removeTopic = `${this.prefix}${REMOVE_REQUEST_POSTFIX}`;
    this.publish(removeTopic, JSON.stringify({ id: device.getId() }));
  }

  private publish(topic: string, payload: string): void {    
    if (this.config.adapterDebugLogs) {
      console.log(`[adapter->publish]: Sending ${payload} to ${topic}`);
    }

    this?.client?.publish(topic, payload, (error) => {
      if (error) {
        console.log(`Could not send ${payload} to ${topic}: ${error}`);
      }
    });
  }
}

export interface DeviceDefinition {
  definition?: Definition;
  friendly_name?: string;
  ieee_address?: string;
  interview_completed?: boolean;
  interviewing?: boolean;
  model_id?: string;
  network_address?: number;
  power_source?: string;
  supported?: boolean;
  type?: string;
}

export interface Definition {
  description?: string;
  exposes?: Expos[];
  model?: string;
  supports_ota?: boolean;
  vendor?: string;
}

export interface Expos {
  access?: number;
  description?: string;
  name?: string;
  property?: string;
  type?: string;
  unit?: string;
  value_max?: number;
  value_min?: number;
  value_step?: number;
  values?: string[];
  features: Expos[];
}
