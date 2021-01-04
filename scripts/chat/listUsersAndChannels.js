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
function UserWithChannels(name, sid, joinedChannels) {
    this.name = name;
    this.sid = sid;
    this.joinedChannels = joinedChannels ? joinedChannels : 0;
}

UserWithChannels.prototype.setJoinedChannels = function (joinedChannels) {
    this.joinedChannels = joinedChannels ? joinedChannels : 0;
}

UserWithChannels.prototype.compareTo = function (other) {
    return (this.joinedChannels === other.joinedChannels) ? 0 : ((this.joinedChannels > other.joinedChannels) ? 1 : -1);
}



async function outputUsers(identityFilter, filename) {
    filename = !!filename ? filename : "output.csv";

    console.log(`Identity filter is: ${identityFilter}`);
    console.log(`Output file will be: ${filename}`);

    let usersAndChannels = await getUsers();
    console.log(`Found ${usersAndChannels.length} users.`);

    writeCSVToFile(usersAndChannels, filename);
}

async function getUsers(identityFilter, filename) {
    // Get all user identities
    let usersAndChannels = await client
        .chat.services(process.env.TWILIO_SERVICE_SID)
        .users
        .list()
        // .then(users => users.map(u => u.friendlyName)
        //     .sort((a, b) => a ? a.localeCompare(b) : -1));
        .then(users => users.map(user => new UserWithChannels(user.friendlyName, user.sid, user.joinedChannelsCount))
            .sort((a, b) => a.compareTo(b)));
    return usersAndChannels;
}

function writeCSVToFile(usersAndChannels, filename) {
     fs.writeFile(filename, extractAsCSV(usersAndChannels), err => {
        if (err) {
            console.log('Error writing to CSV file', err);
        } else { 
            console.log(`Saved ${usersAndChannels.length} users to ${filename}`);
        }
    })

}
function extractAsCSV(usersAndChannels) {
    const header = [`UserFriendlyName,UserSid,JoinedChannelsCount`];
    const rows = usersAndChannels.map(u =>
        `${u.name},${u.sid},${u.joinedChannels}`
    );
    return header.concat(rows).join("\n");

}
outputUsers();
