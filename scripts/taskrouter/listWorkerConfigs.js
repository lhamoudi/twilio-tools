require("dotenv").config();
const fs = require("fs");
const Twilio = require("twilio")

const accountSid = process.env.TWILIO_ACCT_SID;
const authToken = process.env.TWILIO_ACCT_AUTH;
const client = Twilio(accountSid, authToken);


/**
 * Convenience object for simplified config representation
 * @param {*} name 
 * @param {*} sid 
 */
function WorkerConfig(name, sid, includedChannels) {
    this.name = name;
    this.sid = sid;
    this.channelCapacities = new Map();
    // Default to zeros
    if (includedChannels) {
        includedChannels.forEach(c => {
            this.channelCapacities.set(c, "0");
        });
    }
}

WorkerConfig.prototype.setChannelCapacity = function (channel, capacity) {
    this.channelCapacities.set(channel, capacity ? "" + capacity : "0");
}

WorkerConfig.prototype.compareTo = function (otherConfig) {
    return this.name.localeCompare(otherConfig.name);
}



async function outputWorkerConfigs(includedChannels, filename) {
    filename = !!filename ? filename : "output.csv";

    console.log(`Included channels are: ${includedChannels}`);
    console.log(`Output file will be: ${filename}`);


    // If no explicit list of included channels is given, get em all
    if (!includedChannels || includedChannels.length === 0) {
        // Get all channels
        includedChannels = await client
            .taskrouter.workspaces(process.env.TWILIO_WORKSPACE_SID)
            .taskChannels
            .list()
            .then(taskChannels => taskChannels.map(tc => tc.friendlyName)
                .sort((a, b) => a.localeCompare(b)));
    }

    // Get all the workers, map to our simple object model, and sort
    const workerConfigList = await client
        .taskrouter.workspaces(process.env.TWILIO_WORKSPACE_SID)
        .workers
        .list()
        .then(workers => workers.map(w => new WorkerConfig(w.friendlyName, w.sid, includedChannels))
            .sort((a, b) => a.compareTo(b)));


    console.log(`Found ${workerConfigList.length} workers.  Retrieving worker configurations...`);

    // Work through those workers and pull in the channels, filtering on the relevant ones
    for (let i = 0, totalLogged = 0; i < workerConfigList.length; i++) {
        const workerSid = workerConfigList[i].sid;
        const workerChannelCapacities = await client
            .taskrouter
            .workspaces(process.env.TWILIO_WORKSPACE_SID)
            .workers(workerSid)
            .workerChannels
            .list()
            .then(workerChannels =>
                workerChannels.filter(wcc => includedChannels.indexOf(wcc.taskChannelUniqueName) > -1));
        // Set those channel capacities on our simple config object
        workerChannelCapacities.forEach(wcc => {
            workerConfigList[i].setChannelCapacity(wcc.taskChannelUniqueName, wcc.configuredCapacity);
        });
        if ((i+1) % 10 == 0 || (i+1) == workerConfigList.length) {
            totalLogged = i+1;
            console.log(`Retrieved ${totalLogged} of ${workerConfigList.length} worker configurations`);
        }
    }

    writeCSVToFile(workerConfigList, includedChannels, filename);
}

function writeCSVToFile(workerConfigs, includedChannels, filename) {
     fs.writeFile(filename, extractAsCSV(workerConfigs, includedChannels), err => {
        if (err) {
            console.log('Error writing to CSV file', err);
        } else { 
            console.log(`Saved ${workerConfigs.length} worker configs to ${filename}`);
        }
    })

}
function extractAsCSV(workerConfigs, includedChannels) {
    const header = [`WorkerSid,WorkerFriendlyName,${includedChannels.join(',')}`];
    const rows = workerConfigs.map(w =>
        `${w.sid},${w.name},${[...w.channelCapacities.values()].join(',')}`
    );
    return header.concat(rows).join("\n");

}
outputWorkerConfigs(['readiness_check_channel', 'proctor_channel', 'security_review_channel'], 'pm-worker-configs.txt');
