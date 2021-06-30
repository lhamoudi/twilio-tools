require("dotenv").config();
const fs = require("fs");
const Twilio = require("twilio");
const args = require('yargs')(process.argv.slice(2))
    .array('userSid')
    .number('cleanupOlderThan')
    .usage('Usage: $0 --userSid=[USxxx] --cleanupOlderThan')
    .describe('userSid', '(Optional) Specific SID of user to look for')
    .describe('cleanupOlderThan', '(Optional) Age in days to cleanup/remove agent from joined channels. Must supply userSid too')
    .argv;

const accountSid = process.env.TWILIO_ACCT_SID;
const authToken = process.env.TWILIO_ACCT_AUTH;
const client = Twilio(accountSid, authToken);


/**
 * Convenience object for output
 * @param {*} name 
 * @param {*} sid 
 * @param {*} joinedChannels 
 */
function UserWithChannels(name, sid, joinedChannels, joinedChannelsAfterClean) {
    this.name = name;
    this.sid = sid;
    this.joinedChannels = joinedChannels;
    this.joinedChannelsAfterClean = joinedChannelsAfterClean;
}

UserWithChannels.prototype.compareTo = function (other) {
    return (this.joinedChannels === other.joinedChannels) ? 0 : ((this.joinedChannels < other.joinedChannels) ? 1 : -1);
};



async function outputUsers(userSids, cleanupOlderThanDays, filename) {
    filename = !!filename ? filename : "output.csv";

    const doCleanup = cleanupOlderThanDays >= 0;

    let usersWithChannels = [];

    console.log(`Output file will be: ${filename}`);

    let userIdentities = [];

    if (!!userSids) {
        // Use the user SID values as user identity
        userIdentities = userSids;
    } else {
        // Get all workers and then derive user identity
        const workerNames = await getWorkers();
    
        for (let i = 0; i < workerNames.length; i++) {
            // Convert the worker name to the chat user identity (at time of writing, '.' and '@' in email addresses are converted)
            const escapedWorkerName = escapeNonAlphaChars(workerNames[i]);  
            userIdentities.push(escapedWorkerName);
        }     

        console.log(`Found ${userIdentities.length} total workers.`);
    }
    console.log(`Retrieving ${userIdentities.length} chat users...`);

    // Use for loop to sequentially pull each corresponding chat user
    // (slow, but avoids hammering API and getting 'Too many requests' errors)
    for (let i = 0; i < userIdentities.length; i++) {
        const user = await getUser(userIdentities[i]);
        if (user && user.sid) {
            let cleanedUp = 0;

            // Do cleanup in here when applicable
            if (doCleanup) {
                const userChannels = await getUserChannels(user.sid);

                const cutoff = new Date(new Date().getTime() - (cleanupOlderThanDays * 24 * 60 * 60 * 1000));
                console.log(`  Found ${userChannels.length} channels for user ${user.sid}. Looking for those older than ${cleanupOlderThanDays} days (${cutoff})...`);
                
                for (let j=0; j < userChannels.length; j++) {
                    const member = await getMember(userChannels[j].channelSid, userChannels[j].memberSid);
                    if (member && member.dateUpdated < cutoff) {
                        // Clean this one up
                        await removeMemberFromChannel(member.channelSid, member.sid);
                        cleanedUp++;
                    }
                    ((j+1) % 50 == 0) && console.log(`  Processed ${j+1} of ${userChannels.length}`);
                }
                console.log(`  Cleaned up ${cleanedUp} channels for user ${user.sid}`);
            }

            usersWithChannels.push(new UserWithChannels(user.friendlyName, user.sid, user.joinedChannelsCount, user.joinedChannelsCount-cleanedUp));
        } else {
            console.error(`Failed to load user with identity: ${userIdentities[i]}`);
        }
        ((i+1) % 50 == 0) && console.log(`Processed ${i+1} of ${userIdentities.length}`);
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
    try {
        const user = await client
            .chat.services(process.env.TWILIO_CHAT_SERVICE_SID)
            .users(identity)
            .fetch();
        return user;
    } catch(err) {
        console.log(`Error fetching user ${identity}`);
        console.error(err);
    }
}

/**
 * Gets channels by user SID 
 * 
 * @param userSid 
 */
async function getUserChannels(userSid) {
    // Get channels
    try {
        const channels = await client
            .chat.services(process.env.TWILIO_CHAT_SERVICE_SID)
            .users(userSid)
            .userChannels
            .list();
        return channels;
    } catch(err) {
        console.log(`Error listing user channels for user ${userSid}`);
        console.error(err);
    }      
}

/**
 * Gets channel member
 * 
 * @param channelSid 
 * @param memberSid
 */
async function getMember(channelSid, memberSid) {
    // Get member
    try {
        const member = await client
            .chat.services(process.env.TWILIO_CHAT_SERVICE_SID)
            .channels(channelSid)
            .members(memberSid)
            .fetch();
        return member;
    } catch(err) {
        console.log(`Error fetching member ${memberSid} for channel ${channelSid}`);
        console.error(err);
    }
}

/**
 * Remove user from channel
 * 
 * @param channelSid 
 * @param memberSid
 */
async function removeMemberFromChannel(channelSid, memberSid) {
    // Get channel
    try {
    await client
        .chat.services(process.env.TWILIO_CHAT_SERVICE_SID)
        .channels(channelSid)
        .members(memberSid)
        .remove();
    } catch(err) {
        console.log(`Error removing member ${memberSid} from channel ${channelSid}`);
        console.error(err);
    }
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


const userSids = args.userSid;
const cleanupOlderThanDays = args.cleanupOlderThan;

outputUsers(userSids, cleanupOlderThanDays);
