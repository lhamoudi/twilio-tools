require("dotenv").config();
const fs = require("fs");
const Twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCT_SID;
const authToken = process.env.TWILIO_ACCT_AUTH;
const client = Twilio(accountSid, authToken);


/**
 * Convenience object for output
 * @param {*} name 
 * @param {*} sid 
 * @param {*} joinedChannels 
 */
function UserWithChannels(name, sid, joinedChannels) {
    this.name = name;
    this.sid = sid;
    this.joinedChannels = joinedChannels ? joinedChannels : 0;
}

UserWithChannels.prototype.setJoinedChannels = function (joinedChannels) {
    this.joinedChannels = joinedChannels ? joinedChannels : 0;
};

UserWithChannels.prototype.compareTo = function (other) {
    return (this.joinedChannels === other.joinedChannels) ? 0 : ((this.joinedChannels < other.joinedChannels) ? 1 : -1);
};



async function outputUsers(filename) {
    filename = !!filename ? filename : "output.csv";

    let usersWithChannels = [];

    console.log(`Output file will be: ${filename}`);

    const workerNames = await getWorkers();
    console.log(`Found ${workerNames.length} total workers. Retrieving corresponding chat users...`);

    // Use for loop to sequentially pull each corresponding chat user
    // (slow, but avoids hammering API and getting 'Too many requests' errors)
    for (let i = 0; i < workerNames.length; i++) {
        // Convert the worker name to the chat user identity (at time of writing, '.' and '@' in email addresses are converted)
        const escapedWorkerName = escapeNonAlphaChars(workerNames[i]);

        const user = await getUser(escapedWorkerName);
        if (user && user.sid) {
            usersWithChannels.push(new UserWithChannels(user.friendlyName, user.sid, user.joinedChannelsCount));
        } else {
            console.error(`Failed to load user with identity: ${escapedWorkerName}`);
        }
        ((i+1) % 10 == 0) && console.log(`Processed ${i+1} of ${workerNames.length}`);
    }
    console.log(`Found ${usersWithChannels.length} users.`);
    const sortedList = usersWithChannels.sort((a, b) => a.compareTo(b));

    writeCSVToFile(sortedList, filename);

    console.log(`Top channel counts below (see ${filename} for full list)`);
    console.table(sortedList.length > 10 ? sortedList.slice(0, 10) : sortedList);
}

function escapeNonAlphaChars(stringToEscape, prefix = '_') {
    const escaped = stringToEscape.replace(/[^A-Za-z0-9]/g, function(match) {
        const hex = match.charCodeAt(0).toString(16).toUpperCase();
        return prefix + (hex.length < 2 ? '0' + hex : hex);
    });
    return escaped;
}

/**
 * Gets the TR workers (friendly names only)
 */
async function getWorkers() {
    // Get all workers
    let workerNames = await client
    .taskrouter.workspaces(process.env.TWILIO_WORKSPACE_SID)
        .workers
        .list()
        .then(workers => workers.map(w => w.friendlyName));
    return workerNames;
}

/**
 * Gets user by identity 
 * 
 * @param identity 
 */
async function getUser(identity) {
    // Get user
    const user = await client
        .chat.services(process.env.TWILIO_SERVICE_SID)
        .users(identity)
        .fetch();
    return user;
}

function writeCSVToFile(usersAndChannels, filename) {
     fs.writeFile(filename, extractAsCSV(usersAndChannels), err => {
        if (err) {
            console.log('Error writing to CSV file', err);
        } else { 
            console.log(`Saved ${usersAndChannels.length} users to ${filename}`);
        }
    });

}
function extractAsCSV(usersAndChannels) {
    const header = [`UserFriendlyName,UserSid,JoinedChannelsCount`];
    const rows = usersAndChannels
        .map(u => `${u.name},${u.sid},${u.joinedChannels}`);
    return header.concat(rows).join("\n");

}
outputUsers();
