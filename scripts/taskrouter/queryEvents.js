require("dotenv").config();
const { log } = require("console");
const Twilio = require("twilio");
const args = require('yargs')(process.argv.slice(2))
    .array('excludeEventType')
    .array('includeColumn')
    .usage('Usage: $0 --startDate=[date] --endDate=[date] --filterType=[taskSid|workerSid|task_attributes__<attribute-name>] --filterValue=[text]')
    .example('$0 --startDate=2020-10-25T00:00:00-07:00 --endDate=2020-10-25T21:00:00-07:00 --filterType=task_attributes__channelSid --filterValue=CHc03ffaacf8f14027a25f2fc5e0482066', 'List all event data related to the chat channel SID')
    .example('$0 --startDate 2020-11-02T10:00:00-07:00 --endDate 2020-11-02T12:00:00-07:00 --filterType task_attributes__correlationId --filterValue 0000000094886693 --excludeEventType workflow.target-matched workflow.entered --includeColumn task_attributes__channelSid task_attributes__conferenceId workerName', 'List all event data related to the correlation ID, and add extra columns')
    .demandOption(['filterType', 'filterValue'])
    .describe('startDate', 'Start of search range')
    .default('startDate', '4 hours ago')
    .describe('endDate', 'End of search range')
    .default('endDate', 'Current time')
    .describe('includeColumn', 'Extra column(s) to display')
    .describe('excludeEventType', 'Event(s) to be excluded from results')

    .argv;

const accountSid = process.env.TWILIO_ACCT_SID;
const authToken = process.env.TWILIO_ACCT_AUTH;
const client = Twilio(accountSid, authToken);
//const { hideBin } = require('yargs/helpers');
//const argv = yargs(hideBin(process.argv)).argv;

function SimpleTaskrouterEvent(taskrouterEvent, filter) {
    //this.eventSid = taskrouterEvent.sid;
    this.eventDate = taskrouterEvent.eventDate.toISOString();
    this.eventType = taskrouterEvent.eventType;
    if (!!taskrouterEvent.eventData.task_sid && includedColumns.indexOf(SearchFilter.COLUMN_TASK_SID) > -1)
        this.taskSid = taskrouterEvent.eventData.task_sid;
    if (!!taskrouterEvent.eventData.task_queue_name && includedColumns.indexOf(SearchFilter.COLUMN_TASK_QUEUE) > -1)
        this.taskQueue = taskrouterEvent.eventData.task_queue_name;
    if (!!taskrouterEvent.eventData.worker_sid && includedColumns.indexOf(SearchFilter.COLUMN_WORKER_SID) > -1)
        this.workerSid = taskrouterEvent.eventData.worker_sid;
    if (!!taskrouterEvent.eventData.worker_name && includedColumns.indexOf(SearchFilter.COLUMN_WORKER_NAME) > -1)
        this.workerName = taskrouterEvent.eventData.worker_name.slice(0, taskrouterEvent.eventData.worker_name.indexOf('@'));  // Get rid of the email address part
    if (!!taskrouterEvent.eventData.task_attributes) {
        const taskAttribs = JSON.parse(taskrouterEvent.eventData.task_attributes);
        Object.keys(taskAttribs).forEach(key => {
            if (taskAttribs.hasOwnProperty(key) && includedColumns.indexOf("task_attributes__" + key) > -1) {
                this[key] = taskAttribs[key];
            }
        });
        // if (!!taskAttribs.channelSid && includedColumns.indexOf(SearchFilter.COLUMN_CHANNEL_SID) > -1)
        //     this.channelSid = taskAttribs.channelSid;
        // if (!!taskAttribs.conferenceId && includedColumns.indexOf(SearchFilter.COLUMN_CONFERENCE_ID) > -1)
        //     this.conferenceId = taskAttribs.conferenceId;
        // if (!!taskAttribs.correlationId && includedColumns.indexOf(SearchFilter.COLUMN_CORRELATION_ID) > -1)
        //     this.correlationId = taskAttribs.correlationId;
    }
    //this.taskAttribs = JSON.stringify(taskAttribs);
}

function SearchFilter(startDate, endDate, filterType, filterValue, excludedEventTypes, includedColumns) {
    this.startDate = startDate;
    this.endDate = endDate;
    this.filterType = filterType;
    this.filterValue = filterValue;
    this.excludedEventTypes = !!excludedEventTypes ? excludedEventTypes : [];
    this.includedColumns = !!includedColumns ? includedColumns : [];
}

SearchFilter.FILTER_TYPE_TASK_SID = 'taskSid';
SearchFilter.FILTER_TYPE_WORKER_SID = 'workerSid';
SearchFilter.FILTER_TYPE_TASK_ATTRIBUTE = 'task_attributes__';

SearchFilter.COLUMN_TASK_SID = 'taskSid';
SearchFilter.COLUMN_TASK_QUEUE = 'taskQueue';
SearchFilter.COLUMN_WORKER_SID = 'workerSid';
SearchFilter.COLUMN_WORKER_NAME = 'workerName';
SearchFilter.COLUMN_CHANNEL_SID = 'channelSid';
SearchFilter.COLUMN_CONFERENCE_ID = 'conferenceId';
SearchFilter.COLUMN_CORRELATION_ID = 'correlationId';


async function queryEvents(filter) {

    if (filter.excludedEventTypes.length > 0) {
        console.log(`Excluding event types: ${filter.excludedEventTypes}`);
    }
    if (filter.filterType) {
        console.log(`Applying filter [${filter.filterType}=${filter.filterValue}]`);
    }

    console.log(`Querying events from: ${startDate.toISOString()} to: ${endDate.toISOString()}`);

    const taskrouterEvents = await performQueryEvents(filter);

    if (taskrouterEvents.length > 0) {
        const filteredEvents = filterEvents(taskrouterEvents, filter);
        console.log(`Found total of ${filteredEvents.length} matching events from a possible ${taskrouterEvents.length}. Last event_date retrieved was ${taskrouterEvents[taskrouterEvents.length - 1].eventDate.toISOString()}. Trying next page...`);
        console.table(filteredEvents);
    } else {
        console.log(`No matching events. Query complete.`);
    }


}

async function performQueryEvents(filter) {
    const eventList = await client.taskrouter.workspaces(process.env.TWILIO_WORKSPACE_SID)
        .events
        .list({
            //pageSize: 1000,
            startDate: filter.startDate,
            endDate: filter.endDate,
            ...(filter.filterType === SearchFilter.FILTER_TYPE_TASK_SID ? { taskSid: filter.filterValue } : {}),
            ...(filter.filterType === SearchFilter.FILTER_TYPE_WORKER_SID ? { workerSid: filter.filterValue } : {})
        });
    return eventList;
}

function filterEvents(taskrouterEvents, filter) {
    return taskrouterEvents
        .filter(taskrouterEvent => {
            if (!!filter.excludedEventTypes && filter.excludedEventTypes.indexOf(taskrouterEvent.eventType) > -1) {
                // This is an excluded event type
                return false;
            }
            if (!!filter.filterType && filter.filterType.indexOf(SearchFilter.FILTER_TYPE_TASK_ATTRIBUTE) == 0) {
                const attributeName = filter.filterType.slice(SearchFilter.FILTER_TYPE_TASK_ATTRIBUTE.length);
                if (!!taskrouterEvent.eventData.task_attributes) {
                    const jsonTaskAttributes = JSON.parse(taskrouterEvent.eventData.task_attributes);
                    if (!!jsonTaskAttributes[attributeName] && jsonTaskAttributes[attributeName] === filterValue) {
                        return true;
                    }
                }
                return false;
            }
            return true;
        })
        .map(taskrouterEvent => new SimpleTaskrouterEvent(taskrouterEvent, filter));
}

const DEFAULT_START_DATE_HOURS = 4;
const defaults = {
    startDate: new Date(Date.now() - (DEFAULT_START_DATE_HOURS * 60 * 60 * 1000)),
    endDate: new Date(),
    includedColumns: ["eventSid", "eventDate", "eventType", SearchFilter.COLUMN_TASK_SID]
};

const startDate = !!args.startDate ? new Date(args.startDate) : defaults.startDate;
const endDate = !!args.endDate ? new Date(args.endDate) : defaults.endDate;


const filterType = args.filterType;
//const filterType = = SearchFilter.FILTER_TYPE_TASK_SID;
//const filterType = SearchFilter.FILTER_TYPE_CHAT_CHANNEL_SID;
const filterValue = args.filterValue;
//const filterValue = "CHc03ffaacf8f14027a25f2fc5e0482066";
//const excludedEventTypes = undefined;
const excludedEventTypes = args.excludeEventType;
const extraIncludedColumns = args.includeColumn;
let includedColumns = defaults.includedColumns;
if (!!extraIncludedColumns)
    includedColumns = includedColumns.concat(extraIncludedColumns);


const filter = new SearchFilter(startDate, endDate, filterType, filterValue, excludedEventTypes, includedColumns);
queryEvents(filter);
