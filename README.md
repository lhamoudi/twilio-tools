# twilio-tools
Snippets of code I've put together to help with Flex/Taskrouter/Video/anything Twilio really

Docs are admittedly lacking!

## Install dependencies:

```
npm install
```

## Taskrouter: Query Events

`/scripts/taskrouter/queryEvents.js`

Expands on events API by allowing you to filter on task attributes too - making it possible to see a full sequence of task-related events related to, say, the same chat channel SID.

Lots of things can be filtered on (any task attribute - using a special convention as below), and similarly various columns can be included.  This overcomes some of the limitations of the events API (e.g. not being able to query on a task attribute), but comes at a cost - as the script needs to pull **ALL** of the workspace’s events for a particular timeframe in order to programmatically inspect the task attributes.

**IMPORTANT:** Timeframe needs to be specified carefully to ensure semi-speedy responses - since events API will return **A LOT** of results on a production system!  And nodeJS will automatically pull all the pages too.

```
npm run twilio:taskrouter:query-events` 
```

### Examples

Find all events relating to a particular chat channel SID over a time range. Swap the task_attributes__channelSid for any other attribute you want to filter on. Optionally exclude certain event types to reduce noise. Optionally include extra columns in the results.

```
npm run twilio:taskrouter:query-events -- --startDate 2020-11-02T10:00:00-07:00 --endDate 2020-11-02T14:00:00-07:00 --filterType task_attributes__channelSid --filterValue CH473f4625d17d4059a7e85429308077e1 --excludeEventType workflow.target-matched workflow.entered --includeColumn task_attributes__conferenceId workerName taskQueue
```

## List Workers and Configured Channel Capacities

`/scripts/taskrouter/listWorkerConfig.js`

Quick way to view all workers and their configured channel capacities. Simply grabs all the Taskrouter workers and their channel capacities, and outputs to a file - to save the need to click into each worker via Taskrouter Workers UI in Twilio Console.

```
npm run twilio:taskrouter:worker-configs
```

## List Chat Users and Joined Channel Counts (With Option to CleanUp)

`/scripts/chat/listUsersAndChannels.js`

Retrieves all agent chat users along with the number of channels they are members of.  Helpful to identify where cleanup of chat channels is necessary, if - for example - your Flex project isn't using the Channel Janitor. Option to cleanup channels joined more than X days ago.

This script pulls all of the workers from Taskrouter, and then looks to identify all of the chat users associated with those workers - and the number of channels those users are members of. This can be useful when there are issues with chat channel cleanup and - while it doesn’t address the root cause - it allows you to see the extent of the current problem, and even repair it temporarily.

**NOTE:** The iterative calls to the Chat User Fetch API can make this a slow script to execute on a large user base, but there are stdout updates (every 50 users retrieved) to indicate progress.

The results are output to a CSV file, with the highest channel counts first.  The top 10 are also output to stdout as a convenience.

### Examples

Simply list all chat users and current count of joined channels

```
npm run twilio:chat:list-users
```

As above, but specify particular user SIDs (much faster!)

```
npm run twilio:chat:list-users -- --userSid USeb537f769a9445dcaa4ee013da57eba7 US320f3241de5b4834b9e28d97aaf4d217
```

As above, but also cleanup and channel memberships that haven't been updated in X days (2 in this instance)

```
npm run twilio:chat:list-users -- --userSid USeb537f769a9445dcaa4ee013da57eba7 US320f3241de5b4834b9e28d97aaf4d217 --cleanupOlderThan 2
```

