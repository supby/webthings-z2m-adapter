import { AddonManagerProxy, Database } from "gateway-addon";
import { Zigbee2MqttDriver } from "./driver";
import { Config } from "./config";
import { staticConfig } from "./staticConfig";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../manifest.json');

async function main(addonManager: AddonManagerProxy,
    _: unknown,
    errorCallback: (packageName: string, error: string) => void) {
    const packageName = manifest.id;

    let config: Config = {};
    const db = new Database(packageName);
    await db.open().then(() => {
        return db.loadConfig();
    }).then((cfg) => {
        config = cfg;        

        return db.saveConfig(config);
    }).catch(() => {
        errorCallback(packageName, 'Failed to open database');
    }).finally(() => {
        console.log('Closing database');
        db.close();
    });

    setStaticConfig(config)


    new Zigbee2MqttDriver(addonManager, config, packageName);
}

export default main

function setStaticConfig(config: Config) {
    staticConfig.adapterDebugLogs = config.adapterDebugLogs || false
}
